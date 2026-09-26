// Render each scene's 3D camera move to an MP4 clip (frame-by-frame, so it's perfectly smooth).
import fs from 'node:fs';
import path from 'node:path';
import { FPS, WIDTH, HEIGHT, run } from './util.mjs';
import { startCaptureServer } from './server.mjs';

export async function captureShots(episode, timeline, epDir, { mode } = {}) {
  const framesDir = path.join(epDir, 'frames');
  const shotsDir = path.join(epDir, 'shots');
  fs.mkdirSync(shotsDir, { recursive: true });

  const shots = episode.scenes.map((scene, index) => ({
    index,
    frames: Math.ceil(timeline[index].duration * FPS) + 2,
    ...scene.location,
    ...scene.shot,
  }));

  const todo = shots.filter(s => !fs.existsSync(path.join(shotsDir, `${s.index}.mp4`)))
    .map(s => ({ ...s, skip: countFrames(path.join(framesDir, String(s.index))) }))
    .filter(s => s.skip < s.frames); // frames may already exist (rendered in parallel jobs)

  if (todo.length) await renderFrames(todo, framesDir, { mode });

  for (const s of shots) {
    const out = path.join(shotsDir, `${s.index}.mp4`);
    if (fs.existsSync(out)) continue;
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS),
      '-i', path.join(framesDir, String(s.index), '%05d.jpg'),
      '-vf', `deflicker=size=5:mode=pm,scale=${WIDTH}:${HEIGHT}:flags=lanczos${process.env.CAPTURE_QUALITY === 'high' ? ',unsharp=5:5:0.6:5:5:0,eq=contrast=1.05:saturation=1.12' : ''}`, '-c:v', 'libx264', '-preset', process.env.CAPTURE_QUALITY === 'high' ? 'slow' : 'medium', '-crf', process.env.CAPTURE_QUALITY === 'high' ? '14' : '17', '-pix_fmt', 'yuv420p', out]);
    console.log(`  shot ${s.index} → ${path.relative(epDir, out)}`);
  }
  return shots.map(s => `shots/${s.index}.mp4`);
}


// Render camera frames for some shots (optionally a frame range: shot.from/shot.to) into framesDir/<shot>/NNNNN.jpg
export async function renderFrames(todo, framesDir, { mode } = {}) {
  // standard: render at 2/3 size and upscale (fast, daily posts). high: full 1080x1920, ~2.5x more building detail,
  // wait for every tile to load, anti-aliasing. Set CAPTURE_QUALITY=high (requests/run.json "quality": "high").
  const high = process.env.CAPTURE_QUALITY === 'high';
  const job = high
    ? { width: WIDTH, height: HEIGHT, renderWidth: WIDTH, renderHeight: HEIGHT, sse: 4, frameTimeout: 12000, fxaa: true, shots: todo }
    : { width: WIDTH, height: HEIGHT, renderWidth: 720, renderHeight: 1280, sse: 10, frameTimeout: 1800, shots: todo };
  if (high) console.log('  capture quality: HIGH (slower)');
  const srv = await startCaptureServer({ job, framesDir });
  const key = process.env.GOOGLE_MAPS_API_KEY;
  const usePane = mode === 'pane' || !key;
  let browser;
  try {
    if (usePane) {
      console.log(`  Open ${srv.url} in a browser that has the Google key saved (the Miami 3D Camera page). Waiting…`);
    } else {
      const puppeteer = (await import('puppeteer')).default;
      browser = await puppeteer.launch({
        headless: true,
        // Mac: real GPU via Metal. Linux/cloud (no GPU): SwiftShader software rendering.
        args: process.platform === 'darwin'
          ? ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--use-angle=metal', '--enable-unsafe-swiftshader']
          : ['--no-sandbox', '--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
        protocolTimeout: 0,
      });
      const page = await browser.newPage();
      await page.setViewport({ width: 540, height: 960, deviceScaleFactor: 2 });
      await page.evaluateOnNewDocument(k => { window.__GMAPS_KEY = k; }, key);
      page.on('pageerror', e => console.log('  [page error]', e.message));
      await page.goto(srv.url);
    }
    await srv.done;
  } finally {
    await browser?.close();
    await srv.close();
  }
}

export function countFrames(dir) {
  if (!fs.existsSync(dir)) return 0;
  const have = new Set(fs.readdirSync(dir));
  let n = 0;
  while (have.has(String(n).padStart(5, '0') + '.jpg')) n++;
  return n;
}
