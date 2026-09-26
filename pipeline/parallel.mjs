// Parallel Reel pipeline for GitHub Actions: prepare → N capture jobs (slices of the 3D footage, at the same time) → assemble.
//   node pipeline/parallel.mjs prepare [--topic "…"] [--episode episodes/x]  → writes episode + voice + captions + plan.json
//   node pipeline/parallel.mjs capture <episodeDir> <piece>                → renders one slice of frames
// The assemble job then runs `daily.mjs --episode <dir>`, which finds all frames already rendered and just encodes + posts.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, FPS, readJSON, writeJSON } from './util.mjs';
import { prepareEpisode } from './make.mjs';
import { renderFrames } from './capture.mjs';

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
  const piece = readJSON(path.join(dir, 'plan.json'))[Number(args[1])];
  const shots = shotsOf(readJSON(path.join(dir, 'episode.json')), readJSON(path.join(dir, 'timeline.json')).timeline);
  const shot = { ...shots[piece.shot], from: piece.from, to: piece.to };
  console.log(`▶ capture shot ${piece.shot}, frames ${piece.from}–${piece.to - 1}`);
  await renderFrames([shot], path.join(dir, 'frames'));
  console.log('✔ done');
} else {
  console.error('Usage: parallel.mjs prepare|capture …'); process.exit(1);
}
