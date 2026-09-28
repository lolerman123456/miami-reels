// Hand-made TikTok photo slideshows (brand logos, bold colors) → Buffer reminder.
//   node pipeline/slideshow.mjs render slideshows/<id>   → slideshows/<id>/out/NN.jpg (1080x1920)
//   node pipeline/slideshow.mjs send   slideshows/<id>   → renders if needed, then a TikTok slideshow reminder in Buffer
// slideshows/<id>/slides.json: { "caption": "...", "slides": [ {type:"cover"|"brand"|"end", ...} ] }; logos in slideshows/<id>/logos/.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, readJSON } from './util.mjs';

const BLUE = '#1769FF';
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const font = (file, weight) => `@font-face { font-family: 'Montserrat'; font-weight: ${weight};
  src: url('data:font/woff2;base64,${fs.readFileSync(path.join(ROOT, 'assets/fonts', file)).toString('base64')}'); }`;
const img = file => `data:image/${file.endsWith('.jpg') ? 'jpeg' : 'png'};base64,${fs.readFileSync(file).toString('base64')}`;

const CSS = `${font('Montserrat-700.woff2', 700)} ${font('Montserrat-800.woff2', 800)} ${font('Montserrat-900.woff2', 900)}
* { margin: 0; box-sizing: border-box; }
body { width: 1080px; height: 1920px; overflow: hidden; color: #fff; font-family: 'Montserrat', 'Noto Color Emoji', sans-serif; position: relative; }
.kicker { position: absolute; top: 110px; left: 0; right: 0; text-align: center; font-weight: 900; font-size: 44px; letter-spacing: 6px; color: rgba(255,255,255,.9); }
.bgicon { position: absolute; right: -120px; bottom: 60px; font-size: 620px; opacity: .13; transform: rotate(-14deg); }
.count { position: absolute; top: 100px; right: 60px; background: rgba(0,0,0,.35); border-radius: 40px; padding: 10px 26px; font-weight: 800; font-size: 34px; }
.card { background: #fff; border-radius: 48px; box-shadow: 0 30px 80px rgba(0,0,0,.35); display: flex; align-items: center; justify-content: center; }
.card img { width: 100%; height: 100%; object-fit: contain; }
.deal { font-weight: 900; text-transform: uppercase; line-height: .95; text-shadow: 0 8px 30px rgba(0,0,0,.35); }
.chip { display: inline-block; font-weight: 900; border-radius: 22px; padding: 14px 34px; }
.handle { position: absolute; bottom: 0; left: 0; right: 0; height: 120px; background: ${BLUE}; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 44px; letter-spacing: 2px; }
.fine { font-weight: 700; font-size: 30px; opacity: .85; line-height: 1.35; }`;

function cover(s, dir) {
  const logos = s.logos.map(l => `<div class="card" style="width:440px;height:170px;padding:26px 40px"><img src="${img(path.join(dir, 'logos', l))}"></div>`).join('');
  return `<body style="background: radial-gradient(circle at 50% 30%, #7a4b2a 0%, #3b2314 55%, #1c0f08 100%)">
  <div class="kicker" style="color:#ffd27a">${esc(s.kicker)}</div>
  <div style="position:absolute;top:200px;left:0;right:0;text-align:center">
    <div class="deal" style="font-size:190px">${esc(s.title)}</div>
    <div class="deal" style="font-size:190px;color:#ffd27a">${esc(s.highlight)}</div>
    <div style="margin-top:34px"><span class="chip" style="background:#fff;color:#3b2314;font-size:54px">${esc(s.date)}</span></div>
  </div>
  <div style="position:absolute;top:840px;left:60px;right:60px;display:flex;flex-wrap:wrap;gap:30px 40px;justify-content:center">${logos}</div>
  <div style="position:absolute;bottom:170px;left:0;right:0;text-align:center;font-weight:900;font-size:48px">${esc(s.sub)}</div>
  <div class="handle">@getnearapp</div></body>`;
}

function brand(s, dir, i, n) {
  return `<body style="background: radial-gradient(circle at 50% 35%, ${s.color} 0%, ${s.dark || s.color} 100%)">
  <div class="bgicon">${s.icon || '☕'}</div>
  <div class="kicker" style="text-align:left;left:60px">${esc(s.kicker || 'NATIONAL COFFEE DAY ☕')}</div>
  <div class="count">${i}/${n}</div>
  <div class="card" style="position:absolute;top:250px;left:90px;width:900px;height:560px;padding:${s.square ? 50 : 70}px"><img src="${img(path.join(dir, 'logos', s.logo))}"></div>
  <div style="position:absolute;top:900px;left:70px;right:70px">
    <div class="deal" style="font-size:${s.deal.length > 18 ? 128 : 158}px">${esc(s.deal)}</div>
    <div style="margin-top:44px;font-weight:800;font-size:58px;line-height:1.2">${esc(s.detail)}</div>
    <div style="margin-top:50px"><span class="chip" style="background:${s.accent || '#fff'};color:${s.chipText || '#111'};font-size:48px">${esc(s.when)}</span></div>
    ${s.note ? `<div class="fine" style="margin-top:40px">${esc(s.note)}</div>` : ''}
  </div>
  <div class="handle">@getnearapp</div></body>`;
}

function end(s) {
  return `<body style="background: radial-gradient(circle at 50% 30%, #3d86ff 0%, ${BLUE} 45%, #0b3fb3 100%)">
  <div style="position:absolute;top:420px;left:70px;right:70px;text-align:center">
    <div class="deal" style="font-size:170px">${esc(s.title)}</div>
    <div style="margin-top:50px;font-weight:900;font-size:64px">${esc(s.sub)}</div>
    ${s.near ? `<div style="margin-top:110px;font-weight:800;font-size:44px;line-height:1.3;opacity:.95">${esc(s.near)}</div>` : ''}
    <div class="fine" style="margin-top:110px">${esc(s.fine)}</div>
  </div>
  <div class="handle" style="background:#fff;color:${BLUE}">@getnearapp</div></body>`;
}

export async function renderSlideshow(dir) {
  dir = path.resolve(ROOT, dir);
  const spec = readJSON(path.join(dir, 'slides.json'));
  const out = path.join(dir, 'out');
  fs.mkdirSync(out, { recursive: true });
  const puppeteer = (await import('puppeteer')).default;
  const exe = process.env.PUPPETEER_EXECUTABLE_PATH || (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined);
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'], ...(exe ? { executablePath: exe } : {}) });
  const files = [];
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1920 });
    const brands = spec.slides.filter(s => s.type === 'brand');
    let k = 0;
    for (const [i, s] of spec.slides.entries()) {
      const body = s.type === 'cover' ? cover(s, dir) : s.type === 'end' ? end(s) : brand(s, dir, ++k, brands.length);
      await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head>${body}</html>`, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      const f = path.join(out, `${String(i).padStart(2, '0')}.jpg`);
      await page.screenshot({ path: f, type: 'jpeg', quality: 92 });
      files.push(f);
    }
  } finally { await browser.close(); }
  console.log(`✔ rendered ${files.length} slides → ${path.relative(ROOT, out)}`);
  return files;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, dir] = process.argv.slice(2);
  if (!['render', 'send'].includes(cmd) || !dir) { console.error('Usage: node pipeline/slideshow.mjs render|send slideshows/<id>'); process.exit(1); }
  // send: use the slides already rendered (committed from a chat) when they exist, else render them here
  const outDir = path.join(ROOT, dir, 'out');
  const have = cmd === 'send' && fs.existsSync(outDir) ? fs.readdirSync(outDir).filter(f => f.endsWith('.jpg')).sort().map(f => path.join(outDir, f)) : [];
  const files = have.length ? have : await renderSlideshow(dir);
  if (cmd === 'send') {
    const spec = readJSON(path.join(ROOT, dir, 'slides.json'));
    const { postToTikTok } = await import('./buffer.mjs');
    await postToTikTok({ images: files, text: spec.caption, label: path.basename(dir) });
  }
}
