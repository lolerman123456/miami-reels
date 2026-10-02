// "Hook + viral video" news post (owner, Oct 2): like @onlyindade — slide 1 is a big hook over a frame of the clip,
// slide 2 is the clip itself. No explainer slides. The video is footage the agencies release themselves (sheriff,
// police, prosecutors, cities) — public record, credited on the video and in the caption. Never TV-station footage.
//   node pipeline/clip.mjs [--url <youtube url>] [--dry-run]
// Needs YOUTUBE_COOKIES (Netscape cookies.txt contents; YouTube blocks cloud servers without a signed-in session).
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { ROOT, run, step, writeJSON } from './util.mjs';

// official agency YouTube channels (their own uploads only)
export const CHANNELS = [
  ['Miami-Dade Sheriff\'s Office', 'UCH8W3L7MP85cfU63LbUNPFQ'],
  ['Miami Police Department', 'UCQ4ep1O3dLiHsda9rOPccsQ'],
  ['Broward Sheriff\'s Office', 'UC2T9FKndXhkgHLk-lKOiCrQ'],
  ['Fort Lauderdale Police', 'UCjz6Ksf6g6Mb8cuKfJQADMw'],
  ['City of Hialeah', 'UCI3p9c__3qlEFi4iaQTOQaw'],
  ['Miami-Dade State Attorney', 'UCqUZ2ICxQKPamJRK0mVtGEw'],
  ['U.S. Attorney, Southern District of Florida', 'UCPBcmpTC3WtgzUqDfds4fWw'],
  ['City of Miami Beach', 'UCAthAfV8Iqgyl8znznZodlQ'],
  ['Miami-Dade County', 'UCGJz92l0embLrICvxJx_0Gg'],
  ['Pembroke Pines Police', 'UCbU7nUImxhA48X2EQMAfmiw'],
  ['Coral Springs Police', 'UCsNBzRS6fNGDwwVXkQzlm3w'],
  ['Hollywood Police', 'UCVtTjaaajzCaWsMxHBmTIsA'],
  ['City of Doral', 'UClUMQPoYao_K1Vs3tOOVonA'],
  ['Boca Raton Police', 'UCl6Odacm7g41cqVb6JRhuSQ'],
  ['Miami-Dade Fire Rescue', 'UCsuPEhHBlgvtDw1O8tE64IQ'],
  ['Florida Dept. of Law Enforcement', 'UCzmvxYTiJcAvX-9bAkC8Ftg'],
];
const MAX_SECONDS = 58; // Instagram carousel videos max out at 60 s
const FONT = path.join(ROOT, 'assets', 'fonts');

const ytdlpArgs = () => {
  const args = ['--no-warnings', '--no-playlist'];
  if (process.env.YOUTUBE_COOKIES) {
    const f = path.join(ROOT, '.yt-cookies.txt');
    fs.writeFileSync(f, process.env.YOUTUBE_COOKIES.endsWith('\n') ? process.env.YOUTUBE_COOKIES : process.env.YOUTUBE_COOKIES + '\n', { mode: 0o600 });
    args.push('--cookies', f);
  }
  return args;
};
const clean = s => String(s || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

// recent uploads from every agency channel (public RSS, no key needed)
export async function recentAgencyVideos({ days = 14 } = {}) {
  const out = [];
  for (const [agency, id] of CHANNELS) {
    try {
      const xml = await (await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`)).text();
      for (const e of xml.split('<entry>').slice(1)) {
        const vid = /<yt:videoId>([^<]+)/.exec(e)?.[1];
        const published = /<published>([^<]+)/.exec(e)?.[1];
        if (!vid || Date.now() - Date.parse(published) > days * 864e5) continue;
        out.push({ agency, id: vid, url: `https://www.youtube.com/watch?v=${vid}`, published,
          title: clean(/<media:title>([^<]*)/.exec(e)?.[1]), description: clean(/<media:description>([^<]*)/.exec(e)?.[1]).slice(0, 400),
          views: +(/<media:statistics views="(\d+)"/.exec(e)?.[1] || 0) });
      }
    } catch (e) { console.log(`  (${agency}: ${e.message})`); }
  }
  return out.sort((a, b) => Date.parse(b.published) - Date.parse(a.published));
}

async function chat(messages) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-5.5', response_format: { type: 'json_object' }, messages }),
      });
      if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return JSON.parse((await res.json()).choices[0].message.content);
    } catch (e) { if (attempt === 3) throw e; console.log(`  (OpenAI retry: ${e.message.slice(0, 100)})`); }
  }
}

const RULES = 'Content rules (hard): never a video whose point is a victim, a child or a dead/injured person; no graphic violence, gore or nudity; '
  + 'no ceremonies, promotions, PSAs, recruiting, budget talks or other PR — only footage people would actually share (bodycam, dashcam, chases, arrests, '
  + 'busts with seized cash/drugs/guns, rescues, wild moments, big fraud takedowns announced by prosecutors). Say "accused"/"charged" unless convicted; '
  + 'never name or show a victim.';

async function pick(videos) {
  const r = await chat([{ role: 'system', content: 'You run a South Florida news page like @onlyindade. Pick the ONE agency video that would go most viral as a '
    + '"hook + video" post, or none. ' + RULES + ' Write the cover like onlyindade: 2 short punchy lines in plain words, the second line is the shock '
    + '(e.g. "MIAMI-DADE DEPUTIES" / "STOP A WRONG-WAY DRIVER ON I-95"), no clickbait lies, only what the title/description supports. '
    + 'Rank up to 4 candidates, best first (fewer or none if nothing qualifies). '
    + 'Return JSON {"picks": [{"index": number, "kicker": "2–3 word label like BODYCAM, CAUGHT ON CAMERA, CHASE, BUSTED, RESCUE", "line1": "≤28 chars", '
    + '"line2": "≤40 chars, the shock", "caption": "2–4 short lines: what happened (accused/charged wording), where, credit line \\"🎥 Video: <agency>\\", then 3 hashtags", "why": "…"}]}' },
  { role: 'user', content: videos.map((v, i) => `${i}. [${v.agency}] ${v.title} (${v.published.slice(0, 10)}, ${v.views} views) — ${v.description}`).join('\n') }]);
  return (r.picks || []).filter(x => videos[x.index]);
}

// last look at the actual frames before anything is posted
async function framesOk(frames) {
  const content = [{ type: 'text', text: 'These are frames from a police/government video we want to repost on a local news page. ' + RULES
    + ' Reply JSON {"ok": true|false, "why": "…", "cover": index of the most gripping frame that shows no victim/child/gore}.' }];
  for (const f of frames) content.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${fs.readFileSync(f).toString('base64')}` } });
  return chat([{ role: 'user', content }]);
}

async function shoot(html, file, width, height) {
  const local = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'],
    ...(!process.env.CI && fs.existsSync(local) ? { executablePath: local } : {}) });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height });
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: file, type: file.endsWith('.png') ? 'png' : 'jpeg', ...(file.endsWith('.png') ? { omitBackground: true } : { quality: 92 }) });
  } finally { await browser.close(); }
  return file;
}
const fontCSS = () => ['700', '800', '900'].map(w => `@font-face{font-family:M;font-weight:${w};src:url(data:font/woff2;base64,${fs.readFileSync(path.join(FONT, `Montserrat-${w}.woff2`)).toString('base64')})}`).join('');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

function coverHTML(img, p, agency) {
  return `<html><head><style>${fontCSS()}*{margin:0;box-sizing:border-box}body{width:1080px;height:1350px;overflow:hidden;font-family:M,sans-serif;background:#000}
  .bg{position:absolute;inset:0;background:url(data:image/jpeg;base64,${fs.readFileSync(img).toString('base64')}) center/cover}
  .fade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(6,14,34,0) 30%,rgba(6,14,34,.55) 55%,rgba(6,14,34,.96) 82%)}
  .box{position:absolute;left:60px;right:60px;bottom:120px}
  .k{display:inline-block;background:#E5252A;color:#fff;font-weight:900;font-size:34px;letter-spacing:2px;padding:10px 20px;border-radius:10px}
  .l1{color:#fff;font-weight:900;font-size:76px;line-height:1.02;margin-top:22px;text-transform:uppercase;letter-spacing:-1px}
  .l2{color:#4D8DFF;font-weight:900;font-size:76px;line-height:1.02;margin-top:6px;text-transform:uppercase;letter-spacing:-1px}
  .foot{position:absolute;left:60px;right:60px;bottom:44px;display:flex;justify-content:space-between;color:#fff;font-weight:800;font-size:26px;opacity:.92}
  .play{position:absolute;top:44px;right:44px;background:rgba(0,0,0,.55);color:#fff;font-weight:900;font-size:30px;padding:12px 22px;border-radius:999px}
  </style></head><body><div class="bg"></div><div class="fade"></div><div class="play">▶ WATCH →</div>
  <div class="box"><span class="k">${esc(p.kicker || 'CAUGHT ON CAMERA')}</span><div class="l1">${esc(p.line1)}</div><div class="l2">${esc(p.line2)}</div></div>
  <div class="foot"><span>🎥 ${esc(agency)}</span><span>@getnearapp</span></div></body></html>`;
}
function chipHTML(agency) {
  return `<html><head><style>${fontCSS()}*{margin:0}body{width:1080px;height:140px;background:transparent;font-family:M,sans-serif}
  .c{position:absolute;left:36px;top:36px;background:rgba(6,14,34,.78);color:#fff;font-weight:800;font-size:30px;padding:12px 22px;border-radius:12px}
  .h{position:absolute;right:36px;top:36px;background:rgba(6,14,34,.78);color:#fff;font-weight:800;font-size:28px;padding:12px 20px;border-radius:12px}</style></head>
  <body><div class="c">🎥 Video: ${esc(agency)}</div><div class="h">@getnearapp</div></body></html>`;
}

// YouTube answers some player clients with "the page needs to be reloaded" for signed-in sessions: try a few.
// The JS challenge solver (yt-dlp-ejs + deno) unlocks the real formats; --remote-components is the fallback source for it
async function download(url, raw) {
  let lastErr;
  const ejs = ['--remote-components', 'ejs:github'];
  for (const client of ['default', 'web_safari', 'mweb', 'tv', 'web_embedded', 'ios']) {
    try {
      await run('yt-dlp', [...ytdlpArgs(), ...ejs, '--extractor-args', `youtube:player_client=${client}`,
        '-f', 'bv*[height<=1080]+ba/b[height<=1080]/bv*+ba/b', '-S', 'ext', '--merge-output-format', 'mp4',
        '--download-sections', `*0-${MAX_SECONDS + 2}`, '-o', raw, url]);
      console.log(`  downloaded (player client: ${client})`); return;
    } catch (e) { lastErr = e; console.log(`  (client ${client} failed: ${e.message.split('\n').find(l => /ERROR/.test(l)) || e.message.slice(0, 120)})`); fs.rmSync(raw, { force: true }); }
  }
  try { console.log(execFileSync('yt-dlp', [...ytdlpArgs(), ...ejs, '-v', '--list-formats', url], { stdio: ['ignore', 'pipe', 'pipe'] }).toString().slice(-3000)); }
  catch (e) { console.log(String(e.stderr || e.message).slice(-3000)); }
  throw lastErr;
}

export async function makeClip({ url, dryRun } = {}) {
  const date = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  step('Finding agency videos');
  let videos = url ? [] : await recentAgencyVideos();
  if (url) {
    const meta = JSON.parse(execFileSync('yt-dlp', [...ytdlpArgs(), '-J', url], { maxBuffer: 64e6 }).toString());
    videos = [{ agency: CHANNELS.find(c => c[1] === meta.channel_id)?.[0] || meta.channel, id: meta.id, url, published: new Date().toISOString(), title: meta.title, description: (meta.description || '').slice(0, 400), views: meta.view_count || 0 }];
  }
  console.log(`  ${videos.length} recent videos`);
  if (!videos.length) { console.log('No agency videos — nothing to post.'); return null; }
  // videos already posted or rejected by the frame check are not offered again
  const seenFile = path.join(ROOT, 'state', 'clips-seen.txt');
  const seen = new Set(fs.existsSync(seenFile) ? fs.readFileSync(seenFile, 'utf8').split('\n').map(l => l.split(/\s/)[0]).filter(Boolean) : []);
  const markSeen = (id, why) => { fs.mkdirSync(path.dirname(seenFile), { recursive: true }); fs.appendFileSync(seenFile, `${id}  ${why}\n`); };
  if (!url) videos = videos.filter(v => !seen.has(v.id));
  const picks = await pick(videos);
  if (!picks.length) { console.log('Nothing share-worthy right now — not posting.'); return null; }
  let p, v, dir, raw, dur, check;
  for (const cand of picks) {
    p = cand; v = videos[cand.index];
    console.log(`\n  pick: ${v.agency}: ${v.title} — ${p.why}\n  cover: [${p.kicker}] ${p.line1} / ${p.line2}`);
    dir = path.join(ROOT, 'out', 'clips', `${date}-${v.id}`);
    fs.mkdirSync(dir, { recursive: true });
    step('Downloading');
    raw = path.join(dir, 'raw.mp4');
    try { await download(v.url, raw); } catch (e) { console.log(`  download failed: ${e.message.slice(0, 300)}`); continue; }
    dur = Math.min(MAX_SECONDS, parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', raw]).toString().trim()) || MAX_SECONDS);
    step('Checking frames');
    const frames = [];
    for (let i = 0; i < 6; i++) {
      const f = path.join(dir, `f${i}.jpg`);
      await run('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(((i + 0.5) * dur) / 6), '-i', raw, '-frames:v', '1', '-vf', 'scale=720:-2', f]);
      frames.push(f);
    }
    check = await framesOk(frames);
    console.log(`  frames: ${check.ok ? 'ok' : 'REJECTED'} — ${check.why}`);
    if (check.ok) break;
    markSeen(v.id, 'rejected'); fs.rmSync(dir, { recursive: true, force: true }); check = null;
  }
  if (!check) { console.log('No candidate passed — not posting.'); return null; }
  const coverFrame = path.join(dir, 'cover-frame.jpg');
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(((Math.max(0, Math.min(5, check.cover ?? 1)) + 0.5) * dur) / 6), '-i', raw, '-frames:v', '1', coverFrame]);

  step('Rendering');
  const cover = await shoot(coverHTML(coverFrame, p, v.agency), path.join(dir, '01-cover.jpg'), 1080, 1350);
  const chip = await shoot(chipHTML(v.agency), path.join(dir, 'chip.png'), 1080, 140);
  const video = path.join(dir, '02-video.mp4');
  // 4:5 frame: blurred copy fills the background, the clip sits sharp in the middle, credit chip on top
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-t', String(dur), '-i', raw, '-i', chip, '-filter_complex',
    '[0:v]scale=1080:1350:force_original_aspect_ratio=increase,crop=1080:1350,boxblur=24:2,eq=brightness=-0.12[bg];'
    + '[0:v]scale=1080:1350:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2[v1];[v1][1:v]overlay=0:0,fps=30,format=yuv420p[v]',
    '-map', '[v]', '-map', '0:a?', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-c:a', 'aac', '-b:a', '160k', '-ar', '44100', '-movflags', '+faststart', video]);
  const post = { id: `${date}-clip`, agency: v.agency, source: v.url, title: v.title, ...p, cover, video };
  writeJSON(path.join(dir, 'post.json'), post);
  console.log(`✔ ${cover}\n✔ ${video}`);

  if (dryRun) { console.log('(dry run) not posted'); return post; }
  const { publishCarousel } = await import('./publish.mjs');
  await publishCarousel([cover, video], p.caption, post.id);
  markSeen(v.id, 'posted');
  return post;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const i = args.indexOf('--url');
  await makeClip({ url: i >= 0 ? args[i + 1] : null, dryRun: args.includes('--dry-run') });
}
