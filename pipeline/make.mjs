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
      image: s.image?.file ? { file: s.image.file, path: timeFocus(s.image, i, captions, timeline), label: s.image.label ?? 'AI RENDER' } : null,
      photos: s.photos?.files?.length ? { files: s.photos.files, at: s.photos.at ?? 0.4, style: s.photos.style ?? null } : null,
      reveal: s.reveal ?? null,
      screen: s.screen ? timeScreen(s.screen, i, captions, timeline) : null,
      stats: s.stats ?? null, source: s.source ?? null, hit: s.hit ?? null, shotType: s.shot?.type ?? null, sfx: episode.sfx ?? 'hard',
      from: Math.round(timeline[i].start * FPS),
      duration: Math.round(timeline[i].duration * FPS),
      video: videos[i],
    })),
  };
}

// How-to screens: each step happens on the word the narrator says ("cue"), typing a few frames early so the letters land
// with the word; steps never overlap. Without a matching word (or without captions) steps are spread evenly.
function timeScreen(screen, sceneIndex, captions, timeline) {
  const words = (captions || []).filter(w => w.scene === sceneIndex);
  const start = timeline[sceneIndex].start, dur = Math.round(timeline[sceneIndex].duration * FPS);
  const norm = t => String(t).toLowerCase().replace(/[^a-z0-9]/g, '');
  const open = Math.round(dur * (screen.at ?? 0.15)) + 16;
  const steps = screen.steps || [];
  const len = s => (s.do === 'url' ? (screen.site || '').length : (s.text || '').length);
  const endOf = (s, t) => t + (s.do === 'url' ? 12 + len(s) * 2 : s.do === 'type' ? 6 + len(s) * 2 : 8);
  let from = 0, free = open;
  const out = steps.map((s, k) => {
    const key = norm(s.cue || '');
    const hit = key ? words.findIndex((w, j) => j >= from && norm(w.text).startsWith(key.slice(0, 6))) : -1;
    const lead = s.do === 'url' || s.do === 'type' ? 8 : 4;
    let t = hit >= 0 ? Math.round((words[hit].start - start) * FPS) - lead : Math.round(open + ((dur - 20 - open) * k) / Math.max(1, steps.length));
    if (hit >= 0) from = hit + 1;
    t = Math.max(t, free + 14); // room for the cursor to glide over
    free = endOf(s, t);
    return { ...s, t };
  });
  return { ...screen, steps: out };
}

// Image scenes: move the camera to each focus spot exactly when the narrator says it. Each spot (after the opening full
// view) gets "at" = frames into the scene of the first spoken word that matches its focus phrase ("the movie theater" → "theater").
const STOP = new Set(['the', 'and', 'with', 'from', 'that', 'this', 'its', 'his', 'her', 'their', 'black', 'eight', 'car']);
function timeFocus(image, sceneIndex, captions, timeline) {
  const path = image.path;
  if (!path?.length) return null;
  const words = (captions || []).filter(w => w.scene === sceneIndex);
  const start = timeline[sceneIndex].start, dur = timeline[sceneIndex].duration;
  const norm = t => String(t).toLowerCase().replace(/[^a-z0-9]/g, '');
  let from = 0;
  const timed = path.map((p, k) => {
    if (k === 0) return { ...p, at: 0 };
    const keys = String(image.focus?.[k - 1] || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 3 && !STOP.has(w));
    const hit = words.findIndex((w, j) => j >= from && keys.some(key => norm(w.text).startsWith(key.slice(0, 5))));
    if (hit >= 0) { from = hit + 1; return { ...p, at: Math.max(0, Math.round((words[hit].start - start) * FPS)) }; }
    return { ...p, at: Math.round((dur * FPS * k) / path.length) }; // not spoken: spread evenly
  });
  // after the last spot, pull back to the whole building if the narrator keeps talking for a while
  const back = timed[timed.length - 1].at + 60;
  if (timed.length > 1 && dur * FPS - back > 45) timed.push({ ...timed[0], at: back });
  return timed;
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
