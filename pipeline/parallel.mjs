// Parallel Reel pipeline for GitHub Actions: prepare → N capture jobs (slices of the 3D footage, at the same time) → assemble.
//   node pipeline/parallel.mjs prepare [--topic "…"] [--episode episodes/x]  → writes episode + voice + captions + plan.json
//   node pipeline/parallel.mjs capture <episodeDir> <piece>   → renders one slice: 3D frames → clip → finished video part (graphics + captions)
//   node pipeline/parallel.mjs finish <episodeDir> [--dry-run] → joins the parts, mixes narration + sound effects, posts
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, FPS, WIDTH, HEIGHT, readJSON, writeJSON, run } from './util.mjs';
import { prepareEpisode, buildProps } from './make.mjs';
import { renderFrames } from './capture.mjs';
import { ensureSfx } from './sfx.mjs';
import { sfxCues } from '../src/cues.js';

const PIECES = Number(process.env.CAPTURE_PIECES || 20);

function shotsOf(episode, timeline) {
  return episode.scenes.map((scene, index) => ({
    index, frames: Math.ceil(timeline[index].duration * FPS) + 2, ...scene.location, ...scene.shot,
  }));
}

// Split all frames into ~PIECES slices of similar size; a slice never crosses a shot boundary.
function plan(shots) {
  const total = shots.reduce((n, s) => n + s.frames, 0);
  const size = Math.ceil(total / PIECES);
  const pieces = [];
  for (const s of shots) {
    const parts = Math.max(1, Math.round(s.frames / size));
    const per = Math.ceil(s.frames / parts);
    for (let from = 0; from < s.frames; from += per) pieces.push({ shot: s.index, from, to: Math.min(s.frames, from + per) });
  }
  return pieces;
}

const [cmd, ...args] = process.argv.slice(2);
const opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };

if (cmd === 'prepare') {
  let dir = opt('--episode');
  if (!dir) {
    const { generateEpisode } = await import('./generate.mjs');
    dir = await generateEpisode({ topic: opt('--topic') || null });
  }
  dir = path.resolve(ROOT, dir);
  const { episode, timeline } = await prepareEpisode(dir);
  const pieces = plan(shotsOf(episode, timeline));
  writeJSON(path.join(dir, 'plan.json'), pieces);
  const rel = path.relative(ROOT, dir);
  console.log(`✔ prepared ${rel}: ${pieces.length} capture pieces`);
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `dir=${rel}\npieces=${JSON.stringify(pieces.map((_, i) => i))}\n`);
  }
} else if (cmd === 'capture') {
  const dir = path.resolve(ROOT, args[0]);
  const k = Number(args[1]);
  const plan = readJSON(path.join(dir, 'plan.json'));
  const piece = plan[k];
  const episode = readJSON(path.join(dir, 'episode.json'));
  const { timeline, duration } = readJSON(path.join(dir, 'timeline.json'));
  const shots = shotsOf(episode, timeline);
  const shot = { ...shots[piece.shot], from: piece.from, to: piece.to };
  console.log(`▶ slice ${k}: shot ${piece.shot}, frames ${piece.from}–${piece.to - 1}`);

  // 1) 3D frames → clip
  const fdir = path.join(dir, 'frames', String(piece.shot));
  const have = n => fs.existsSync(path.join(fdir, String(n).padStart(5, '0') + '.jpg'));
  let missing = false; for (let f = piece.from; f < piece.to; f++) if (!have(f)) { missing = true; break; }
  if (missing) await renderFrames([shot], path.join(dir, 'frames'));
  const high = process.env.CAPTURE_QUALITY === 'high';
  fs.mkdirSync(path.join(dir, 'shots'), { recursive: true });
  const clip = `shots/slice-${k}.mp4`;
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-start_number', String(piece.from),
    '-i', path.join(dir, 'frames', String(piece.shot), '%05d.jpg'), '-frames:v', String(piece.to - piece.from),
    '-vf', `deflicker=size=5:mode=pm,scale=${WIDTH}:${HEIGHT}:flags=lanczos${high ? ',unsharp=5:5:0.6:5:5:0,eq=contrast=1.05:saturation=1.12' : ''}`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', high ? '14' : '17', '-pix_fmt', 'yuv420p', path.join(dir, clip)]);

  // 2) the finished frames for this slice's stretch of the Reel (graphics + captions, silent)
  const props = buildProps(episode, timeline, duration, readJSON(path.join(dir, 'captions.json')), episode.scenes.map(() => clip));
  props.noAudio = true;
  props.scenes[piece.shot].videoOffset = piece.from;
  const starts = props.scenes.map(x => x.from);
  const sceneStart = starts[piece.shot];
  const sceneEnd = piece.shot + 1 < starts.length ? starts[piece.shot + 1] : props.durationInFrames;
  const lastOfShot = !plan[k + 1] || plan[k + 1].shot !== piece.shot;
  const g0 = piece.from === 0 ? sceneStart : sceneStart + piece.from;
  const g1 = Math.min(props.durationInFrames, lastOfShot ? sceneEnd : Math.min(sceneStart + piece.to, sceneEnd));
  fs.mkdirSync(path.join(dir, 'parts'), { recursive: true });
  if (g1 <= g0) { console.log('  (slice falls outside the video, nothing to compose)'); process.exit(0); }
  fs.cpSync(path.join(ROOT, 'assets', 'fonts'), path.join(dir, 'fonts'), { recursive: true });
  const propsFile = path.join(dir, `props-${k}.json`);
  writeJSON(propsFile, props);
  const part = path.join(dir, 'parts', `part-${String(k).padStart(3, '0')}.mp4`);
  console.log(`▶ compose frames ${g0}–${g1 - 1}`);
  await run('npx', ['remotion', 'render', 'src/index.ts', 'Reel', part, `--props=${propsFile}`, `--public-dir=${dir}`,
    `--frames=${g0}-${g1 - 1}`, '--muted', '--codec=h264', '--crf=19', '--concurrency=100%',
    ...(process.env.REMOTION_BROWSER ? [`--browser-executable=${process.env.REMOTION_BROWSER}`] : [])]);
  console.log(`✔ ${path.relative(ROOT, part)}`);
} else if (cmd === 'finish') {
  const dir = path.resolve(ROOT, args[0]);
  const episode = readJSON(path.join(dir, 'episode.json'));
  const { timeline, duration } = readJSON(path.join(dir, 'timeline.json'));
  const partsDir = path.join(dir, 'parts');
  const parts = fs.readdirSync(partsDir).filter(f => f.endsWith('.mp4')).sort();
  const expected = readJSON(path.join(dir, 'plan.json')).length;
  console.log(`▶ joining ${parts.length} parts (${expected} slices planned)`);
  fs.writeFileSync(path.join(partsDir, 'list.txt'), parts.map(f => `file '${f}'`).join('\n'));
  const video = path.join(dir, 'video-silent.mp4');
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(partsDir, 'list.txt'), '-c', 'copy', video]);

  // audio: narration + the same sound-effect cues the composition uses
  const sfxDir = await ensureSfx();
  const props = buildProps(episode, timeline, duration, [], []);
  const cues = sfxCues(props.scenes);
  const inputs = ['-i', path.join(dir, 'narration.wav')];
  const chains = ['[1:a]aresample=48000,aformat=channel_layouts=stereo[a0]']; // input 0 is the video
  cues.forEach((c, i) => {
    inputs.push('-i', path.join(sfxDir, path.basename(c.file)));
    const ms = Math.round((c.at / FPS) * 1000);
    chains.push(`[${i + 2}:a]aresample=48000,aformat=channel_layouts=stereo,volume=${c.volume},adelay=${ms}|${ms}[s${i}]`);
  });
  const mix = `${chains.join(';')};[a0]${cues.map((_, i) => `[s${i}]`).join('')}amix=inputs=${cues.length + 1}:duration=first:normalize=0[a]`;
  const out = path.join(ROOT, 'out', `${episode.id}.mp4`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', video, ...inputs, '-filter_complex', mix,
    '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out]);
  console.log(`✔ Video: ${out}`);
  if (!args.includes('--dry-run')) {
    const { publishReel, publishStory } = await import('./publish.mjs');
    await publishReel(out, episode.igCaption, { collaborators: episode.collaborators });
    await publishStory(out, episode.id).catch(e => console.log(`(story skipped: ${e.message})`));
  } else console.log('(dry run) not posted');
} else {
  console.error('Usage: parallel.mjs prepare|capture …'); process.exit(1);
}
