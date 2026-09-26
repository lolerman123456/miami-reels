// Build one Reel from episodes/<id>/episode.json
//   node pipeline/make.mjs episodes/001-rudest-cities [--pane] [--publish]
// Each step is cached in the episode folder; delete a file to redo that step.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, FPS, WIDTH, HEIGHT, run, readJSON, writeJSON, step } from './util.mjs';
import { makeNarration } from './voice.mjs';
import { makeCaptions } from './captions.mjs';
import { captureShots } from './capture.mjs';
import { ensureSfx } from './sfx.mjs';

// Steps 1–2 (voice + caption timing). Also used by the parallel pipeline's "prepare" job.
export async function prepareEpisode(epDir) {
  epDir = path.resolve(epDir);
  const episode = readJSON(path.join(epDir, 'episode.json'));
  console.log(`\n=== ${episode.title} (${episode.id}) ===`);

  // 1. Voice
  const timelineFile = path.join(epDir, 'timeline.json');
  if (!fs.existsSync(timelineFile)) {
    step(`Narration (${episode.voice?.provider === 'openai' ? 'OpenAI ' + (episode.voice.voice || 'ash') : 'Kokoro'})`);
    const { timeline, duration } = await makeNarration(episode, epDir);
    writeJSON(timelineFile, { timeline, duration });
  }
  const { timeline, duration } = readJSON(timelineFile);
  console.log(`  narration: ${duration.toFixed(1)}s`);

  // 2. Captions
  const captionsFile = path.join(epDir, 'captions.json');
  if (!fs.existsSync(captionsFile)) {
    step('Caption timing (Whisper)');
    writeJSON(captionsFile, await makeCaptions(episode, timeline, epDir));
  }
  return { episode, timeline, duration, captionsFile };
}

export async function makeEpisode(epDir, { pane = false } = {}) {
  epDir = path.resolve(epDir);
  const { episode, timeline, duration, captionsFile } = await prepareEpisode(epDir);

  // 3. 3D footage
  step('3D footage');
  const videos = await captureShots(episode, timeline, epDir, { mode: pane ? 'pane' : undefined });

  // 4. Motion graphics (Remotion)
  step('Motion graphics render (Remotion)');
  const sfxDir = await ensureSfx();
  fs.cpSync(sfxDir, path.join(epDir, 'sfx'), { recursive: true });
  fs.cpSync(path.join(ROOT, 'assets', 'fonts'), path.join(epDir, 'fonts'), { recursive: true });
  const music = pickMusic();
  if (music) fs.copyFileSync(music, path.join(epDir, 'music' + path.extname(music)));

  const props = buildProps(episode, timeline, duration, readJSON(captionsFile), videos, music ? 'music' + path.extname(music) : null);
  const propsFile = path.join(epDir, 'props.json');
  writeJSON(propsFile, props);

  const out = path.join(ROOT, 'out', `${episode.id}.mp4`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await run('npx', ['remotion', 'render', 'src/index.ts', 'Reel', out,
    `--props=${propsFile}`, `--public-dir=${epDir}`, '--codec=h264', '--crf=21', '--audio-bitrate=192k', '--concurrency=100%']);
  console.log(`\n✔ Video: ${out}`);
  return { out, episode };
}

export function buildProps(episode, timeline, duration, captions, videos, music = null) {
  return {
    fps: FPS, width: WIDTH, height: HEIGHT,
    durationInFrames: Math.ceil(duration * FPS),
    narration: 'narration.wav',
    music,
    captions,
    scenes: episode.scenes.map((s, i) => ({
      kind: s.kind, rank: s.rank ?? null, overlay: s.overlay, sub: s.sub ?? null,
      emoji: s.emoji ?? null, emojis: s.emojis ?? null, alert: s.alert ?? null, note: s.note ?? null, badge: s.badge ?? null,
      stats: s.stats ?? null, source: s.source ?? null, hit: s.hit ?? null, shotType: s.shot?.type ?? null, sfx: episode.sfx ?? 'hard',
      from: Math.round(timeline[i].start * FPS),
      duration: Math.round(timeline[i].duration * FPS),
      video: videos[i],
    })),
  };
}

function pickMusic() {
  const dir = path.join(ROOT, 'assets', 'music');
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter(f => /\.(mp3|wav|m4a)$/i.test(f));
  return files.length ? path.join(dir, files[Math.floor(Math.random() * files.length)]) : null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const dir = args.find(a => !a.startsWith('--'));
  if (!dir) { console.error('Usage: node pipeline/make.mjs episodes/<id> [--pane] [--publish]'); process.exit(1); }
  const { out, episode } = await makeEpisode(dir, { pane: args.includes('--pane') });
  if (args.includes('--publish')) {
    const { publishReel } = await import('./publish.mjs');
    await publishReel(out, episode.igCaption);
  }
}
