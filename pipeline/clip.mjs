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
  ['Palm Beach County Sheriff\'s Office', 'UCSNqKQOHU13DSsb0dskeJQA'],
  // statewide (owner, Oct 2: "more crazy", 4 a day) — the Florida sheriffs whose bodycam goes viral
  ['Volusia Sheriff\'s Office', 'UCf6knOGCVA6bqEB1EwdrYrw'],
  ['Polk County Sheriff\'s Office', 'UC9A_wj7G-zjcyELg32NVntw'],
  ['Brevard County Sheriff\'s Office', 'UCD0Hhji5wUmIsHkePQFOBcA'],
  ['Pinellas County Sheriff\'s Office', 'UCoeSYnnPKATQPHe_AJW6ZAg'],
  ['Marion County Sheriff\'s Office', 'UC6hlPotOVDSj6zNevNON0LA'],
  ['Orange County Sheriff\'s Office', 'UC_rDxhSLCiwHo4jBBdUwd_A'],
  ['Lee County Sheriff\'s Office', 'UCR5aSsmi0J0mp3uO4pfyF5Q'],
  ['Osceola County Sheriff\'s Office', 'UCOij53snR6I7KTIcbaDZa-A'],
  ['Florida Fish and Wildlife (FWC)', 'UCkDj8yIrlrHB1hkU93uEZQg'],
  ['Jacksonville Sheriff\'s Office', 'UCu7DiFkpfeNUGIQNs_czJXg'],
  ['Collier County Sheriff\'s Office', 'UCmTd9dBHVK4R6x_25AGdSvg'],
  ['Lake County Sheriff\'s Office', 'UCVvmNy7eZzEuZxVYSDxb4Vw'],
  ['Manatee County Sheriff\'s Office', 'UCa09caxXzsxrobn1xGF1VuA'],
  ['Indian River County Sheriff\'s Office', 'UCTRtJe3b8FoBmuoVzw4y5VA'],
  ['Citrus County Sheriff\'s Office', 'UCybuwLy4DIvh_dOt6GeacBw'],
  ['Flagler County Sheriff\'s Office', 'UCJgQBK-0dhTYayolB-swPzA'],
  ['Bay County Sheriff\'s Office', 'UCvLKPfk3ZCQxrF3nC_N6BZQ'],
  ['St. Johns County Sheriff\'s Office', 'UC7afBe33n-XSRqN9JU4eNYQ'],
  ['Escambia County Sheriff\'s Office', 'UCmNjE4cybjpmJgH9IrkGUqA'],
];
// TV stations' channels — only for the video slide inside news carousels (owner, Oct 2: "any station clip", credited;
// they can file copyright claims, owner accepted that). Never used for the standalone clip slots.
export const STATIONS = [
  ['WSVN 7News', 'UCnquIO-KeazvWWR38jvdu0A'],
  ['WPLG Local 10', 'UCgVZ0mrM3liHNhRYC5Mchgg'],
  ['NBC 6 South Florida', 'UCBgcPSn61UQ4l_-FvcEgLQA'],
  ['CBS News Miami', 'UCXJryYh6xcW5iEeJGzK191A'],
  ['WPTV News', 'UC0bCUnP5RrkJZUtd3bBz6Kw'],
  ['WPBF 25 News', 'UCeD5NwvPbEZKcu02_v8tUZQ'],
];
const KICKERS = ['CAUGHT ON CAMERA', 'BODYCAM', 'DASHCAM', 'CHASE', 'ARRESTED', 'BUSTED', 'RESCUE', 'WILD FLORIDA', 'CRAZY'];
const MIN_CRAZY = 7; // owner, Oct 2: "viral videos need to be more crazy" — 1–10 score from the full-video look
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
export async function recentAgencyVideos({ days = 14, channels = CHANNELS } = {}) {
  const out = [];
  let rssDown = false;
  for (const [agency, id] of channels) {
    try {
      let got = rssDown ? null : await rssVideos(agency, id, days);
      if (!got) { rssDown = true; got = await pageVideos(agency, id, days); } // YouTube's RSS sometimes 404s for every channel
      out.push(...got);
    } catch (e) { console.log(`  (${agency}: ${e.message})`); }
  }
  if (rssDown) console.log('  (YouTube RSS down — read the channels\' Videos pages instead)');
  return out.sort((a, b) => Date.parse(b.published) - Date.parse(a.published));
}

async function rssVideos(agency, id, days) {
  const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`);
  if (!res.ok) return null;
  const xml = await res.text();
  const out = [];
  for (const e of xml.split('<entry>').slice(1)) {
    const vid = /<yt:videoId>([^<]+)/.exec(e)?.[1];
    const published = /<published>([^<]+)/.exec(e)?.[1];
    if (!vid || Date.now() - Date.parse(published) > days * 864e5) continue;
    out.push({ agency, id: vid, url: `https://www.youtube.com/watch?v=${vid}`, published,
      title: clean(/<media:title>([^<]*)/.exec(e)?.[1]), description: clean(/<media:description>([^<]*)/.exec(e)?.[1]).slice(0, 400),
      views: +(/<media:statistics views="(\d+)"/.exec(e)?.[1] || 0) });
  }
  return out;
}

// fallback: the channel's Videos tab (ytInitialData lockups: title, "32K" views, "3d ago")
async function pageVideos(agency, id, days) {
  const html = await (await fetch(`https://www.youtube.com/channel/${id}/videos`, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en' } })).text();
  const m = /var ytInitialData = (\{.*?\});<\/script>/s.exec(html);
  if (!m) return [];
  const lockups = [];
  const walk = o => { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === 'object') { if (o.lockupViewModel) lockups.push(o.lockupViewModel); Object.values(o).forEach(walk); } };
  walk(JSON.parse(m[1]));
  const UNIT = { m: 60e3, min: 60e3, h: 36e5, d: 864e5, w: 6048e5, mo: 2592e6, y: 31536e6 };
  const num = s => { const r = /([\d.]+)\s*([KMB])?/i.exec(s || ''); return r ? Math.round(+r[1] * ({ K: 1e3, M: 1e6, B: 1e9 }[String(r[2]).toUpperCase()] || 1)) : 0; };
  const out = [];
  for (const lv of lockups) {
    const md = lv.metadata?.lockupMetadataViewModel;
    const parts = (md?.metadata?.contentMetadataViewModel?.metadataRows || []).flatMap(r => (r.metadataParts || []).map(p => p.text?.content || ''));
    const age = parts.map(t => /(\d+)\s*(mo|min|m|h|d|w|y)\w*\s+ago/i.exec(t)).find(Boolean);
    if (!lv.contentId || !md || !age) continue;
    const ms = +age[1] * UNIT[age[2].toLowerCase()];
    if (ms > days * 864e5) continue;
    out.push({ agency, id: lv.contentId, url: `https://www.youtube.com/watch?v=${lv.contentId}`, published: new Date(Date.now() - ms).toISOString(),
      title: md.title?.content || '', description: '', views: num(parts.find(t => !/ago/i.test(t))) });
  }
  return out;
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
  + 'no ceremonies, meetings, interviews/officer profiles, promotions, PSAs, recruiting, budget talks or other PR — only footage people would actually share: '
  + 'bodycam/dashcam (including traffic stops with a funny, heated or wild exchange — e.g. Traffic Thursdays/Traffic Tuesday episodes), chases, arrests, '
  + 'busts with seized cash/drugs/guns, rescues, wild moments, big fraud takedowns announced by prosecutors. Say "accused"/"charged" unless convicted; '
  + 'never name or show a victim.';

async function pick(videos) {
  const r = await chat([{ role: 'system', content: 'You run a South Florida news page like @onlyindade. Pick the agency videos that would go most viral as a '
    + '"hook + video" post. The owner wants CRAZY: jaw-dropping, wild, "no way this happened" footage (chases, bodycam meltdowns, '
    + 'wild arrests, gators/pythons, insane rescues, outrageous traffic stops) — skip anything mild or merely informative. '
    + 'View counts are a strong signal. Florida-wide is fine; South Florida first when equally crazy. ' + RULES + ' Write the cover like onlyindade: 2 short punchy lines in plain words, the second line is the shock '
    + '(e.g. "MIAMI-DADE DEPUTIES" / "STOP A WRONG-WAY DRIVER ON I-95"), no clickbait lies, only what the title/description supports. '
    + 'Only actual footage counts (bodycam, dashcam, surveillance, helicopter, phone video) — never a sheriff/official talking to camera, even about a wild case. Rank up to 6 candidates, best first (fewer or none only if nothing qualifies). The cover can quote the best line from the title. '
    + 'Return JSON {"picks": [{"index": number, "kicker": "one of CAUGHT ON CAMERA, BODYCAM, DASHCAM, CHASE, ARRESTED, BUSTED, RESCUE, WILD FLORIDA, CRAZY", "line1": "≤28 chars", '
    + '"line2": "≤40 chars, the shock", "caption": "2–4 short lines: what happened (accused/charged wording), where, credit line \\"🎥 Video: <agency>\\", then 3 hashtags", "why": "…"}]}' },
  { role: 'user', content: videos.map((v, i) => `${i}. [${v.agency}] ${v.title} (${v.published.slice(0, 10)}, ${v.views} views) — ${v.description}`).join('\n') }]);
  return (r.picks || []).filter(x => videos[x.index]);
}

// Watch the whole video (frames every few seconds + the transcript): safety check, how crazy it is, the best ≤58 s
// moment to cut, the cover frame, and the hook written from what actually happens (not just the title)
// news-carousel video slide (owner, Oct 2: "add the actual surveillance footage"): news footage of the story is the point,
// so only block what Instagram won't take or we never show
const STORY_RULES = 'This is the video slide of a news carousel about this story; real news footage (surveillance, bodycam, phone video, the scene, '
  + 'a TV report) is fine even when it shows a crime happening. ok=false only for gore/blood, graphic injuries, a dead body, nudity, a child\'s face, '
  + 'or footage that is not about this story. "crazy" can be any value.';
async function analyze(frames, transcript, v, p, mode = 'clip') {
  const content = [{ type: 'text', text: `Frames from "${v.title}" (${v.agency}), each labeled with its time in seconds, plus the transcript. `
    + 'We repost footage on a South Florida news page like @onlyindade. ' + (mode === 'story' ? STORY_RULES : 'Slide 1 = hook cover, slide 2 = the clip. ' + RULES)
    + ` Draft hook: [${p.kicker}] ${p.line1} / ${p.line2}. Pick the single craziest continuous moment, ${Math.round(MAX_SECONDS * 0.6)}–${MAX_SECONDS} s long, `
    + 'starting right before the action (skip intros, title cards, interviews, talking heads; in a TV report, cut the part that shows the actual surveillance/bodycam/phone footage, not the anchor or reporter). '
    + 'Reply JSON {"ok": true|false, "why": "…", "crazy": 1-10 (10 = everyone would share it), "start": seconds, "end": seconds, '
    + '"cover": seconds of the most gripping frame (no victim/child/gore), "kicker": one of CAUGHT ON CAMERA | BODYCAM | DASHCAM | CHASE | ARRESTED | BUSTED | RESCUE | WILD FLORIDA | CRAZY, "line1": "≤28 chars", "line2": "≤40 chars, the shock", '
    + '"caption": "2–4 short lines: what happens (accused/charged wording), where, \\"🎥 Video: <agency>\\", then 3 hashtags"}' }];
  for (const f of frames) {
    content.push({ type: 'text', text: `t=${f.t}s` });
    content.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${fs.readFileSync(f.file).toString('base64')}`, detail: 'low' } });
  }
  content.push({ type: 'text', text: `Transcript:\n${transcript || '(none)'}` });
  return chat([{ role: 'user', content }]);
}

// auto/official English subtitles → "[t] text" lines (best effort)
async function transcriptOf(url, dir) {
  try {
    await run('yt-dlp', [...ytdlpArgs(), '--remote-components', 'ejs:github', '--skip-download', '--write-subs', '--write-auto-subs',
      '--sub-langs', 'en.*,en', '--sub-format', 'vtt', '-o', path.join(dir, 'subs'), url], { quiet: true });
    const f = fs.readdirSync(dir).find(n => n.startsWith('subs') && n.endsWith('.vtt'));
    if (!f) return '';
    const out = []; let t = null, last = '';
    for (const line of fs.readFileSync(path.join(dir, f), 'utf8').split('\n')) {
      const m = /^(\d+):(\d+):(\d+)\.\d+ -->/.exec(line);
      if (m) { t = +m[1] * 3600 + +m[2] * 60 + +m[3]; continue; }
      const txt = line.replace(/<[^>]+>/g, '').trim();
      if (t == null || !txt || txt === last || /^(WEBVTT|Kind:|Language:)/.test(txt)) continue;
      out.push(`[${t}] ${txt}`); last = txt;
    }
    return out.join('\n').slice(0, 14000);
  } catch { return ''; }
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
        '--download-sections', '*0-900', '-o', raw, url]);
      console.log(`  downloaded (player client: ${client})`); return;
    } catch (e) { lastErr = e; console.log(`  (client ${client} failed: ${e.message.split('\n').find(l => /ERROR/.test(l)) || e.message.slice(0, 120)})`); fs.rmSync(raw, { force: true }); }
  }
  try { console.log(execFileSync('yt-dlp', [...ytdlpArgs(), ...ejs, '-v', '--list-formats', url], { stdio: ['ignore', 'pipe', 'pipe'] }).toString().slice(-3000)); }
  catch (e) { console.log(String(e.stderr || e.message).slice(-3000)); }
  throw lastErr;
}

// download + watch one agency video: safety check, crazy score and the best ≤58 s moment. null if the download failed.
async function watch(v, p, dir, mode = 'clip') {
  fs.mkdirSync(dir, { recursive: true });
  step('Downloading');
  const raw = path.join(dir, 'raw.mp4');
  try { await download(v.url, raw); } catch (e) { console.log(`  download failed: ${e.message.slice(0, 300)}`); return null; }
  const total = parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', raw]).toString().trim()) || MAX_SECONDS;
  step(`Watching (${Math.round(total)} s)`);
  const every = Math.max(2, Math.ceil(total / 48));
  const frames = [];
  for (let t = 1; t < total - 0.5; t += every) {
    const file = path.join(dir, `f${String(frames.length).padStart(2, '0')}.jpg`);
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(t), '-i', raw, '-frames:v', '1', '-vf', 'scale=480:-2', file]);
    if (fs.existsSync(file)) frames.push({ t, file });
  }
  const transcript = await transcriptOf(v.url, dir);
  const check = await analyze(frames, transcript, v, p, mode);
  console.log(`  ${check.ok ? 'ok' : 'REJECTED'} · crazy ${check.crazy}/10 · ${check.start}–${check.end} s — ${check.why}`);
  const start = Math.max(0, Math.min(total - 5, +check.start || 0));
  const dur = Math.min(MAX_SECONDS, Math.max(10, (+check.end || start + MAX_SECONDS) - start), total - start);
  return { check, raw, total, start, dur };
}

// 4:5 frame: blurred copy fills the background, the clip sits sharp in the middle (zoomed 1.25× so wide footage
// fills more of the post), credit chip on top
async function renderVideo(raw, start, dur, agency, out, dir) {
  const chip = await shoot(chipHTML(agency), path.join(dir, 'chip.png'), 1080, 140);
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(start), '-t', String(dur), '-i', raw, '-i', chip, '-filter_complex',
    '[0:v]scale=1080:1350:force_original_aspect_ratio=increase,crop=1080:1350,boxblur=24:2,eq=brightness=-0.12[bg];'
    + '[0:v]scale=1080:1350:force_original_aspect_ratio=decrease,scale=iw*1.25:-2,crop=min(iw\\,1080):ih[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2[v1];[v1][1:v]overlay=0:0,fps=30,format=yuv420p[v]',
    '-map', '[v]', '-map', '0:a?', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-c:a', 'aac', '-b:a', '160k', '-ar', '44100', '-movflags', '+faststart', out]);
  return out;
}

// News carousels (owner, Oct 2): when an agency released video of THIS story (bodycam, arrest, press conference with
// footage), put it in the carousel as slide 2. Returns { file, agency, url } or null. Needs YOUTUBE_COOKIES.
export async function videoForStory(story, dir) {
  if (!process.env.YOUTUBE_COOKIES) return null;
  try {
    const videos = await recentAgencyVideos({ days: 10, channels: [...CHANNELS, ...STATIONS] });
    if (!videos.length) return null;
    const r = await chat([{ role: 'system', content: 'Which official agency video (if any) shows THIS exact news story — the same incident, arrest or case? '
      + 'Real footage of it: the police/agency video, or a TV station report that shows the actual footage (surveillance, bodycam, phone video, the scene) — prefer the one with the most actual footage; never a different case, never generic PR. '
      + 'Reply JSON {"index": number or -1, "why": "…"}' },
      { role: 'user', content: `STORY: ${story}\n\nVIDEOS:\n${videos.map((v, i) => `${i}. [${v.agency}] ${v.title} (${v.published.slice(0, 10)}) — ${v.description}`).join('\n')}` }]);
    const v = videos[r.index];
    if (!(r.index >= 0) || !v) { console.log('  (no agency video of this story)'); return null; }
    console.log(`  story video: ${v.agency}: ${v.title} — ${r.why}`);
    const vdir = path.join(dir, 'video');
    const w = await watch(v, { kicker: '', line1: story.slice(0, 28), line2: '' }, vdir, 'story');
    if (!w?.check?.ok) return null;
    const file = await renderVideo(w.raw, w.start, w.dur, v.agency, path.join(dir, 'story-video.mp4'), vdir);
    fs.rmSync(vdir, { recursive: true, force: true });
    return { file, agency: v.agency, url: v.url };
  } catch (e) { console.log(`  (story video skipped: ${e.message.slice(0, 200)})`); return null; }
  finally { fs.rmSync(path.join(ROOT, '.yt-cookies.txt'), { force: true }); }
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
  // talking heads are never clips (the 6pm slot on Oct 2 wasted all its tries on Polk "Morning briefing" desk videos)
  const TALK = /\b(briefing|press conference|news conference|meeting|ceremony|awards?|graduation|interview|podcast|budget|council|commission|town hall|recruit|hiring|join the team|wrap[- ]?up|case update|found guilty|sentenced|birthday|anniversary|memorial|remember)\b/i;
  if (!url) videos = videos.filter(v => !seen.has(v.id) && !TALK.test(v.title));
  const picks = await pick(videos);
  if (!picks.length) { console.log('Nothing share-worthy right now — not posting.'); return null; }
  let p, v, dir, w, start = 0, dur, check;
  for (const cand of picks) {
    p = cand; v = videos[cand.index];
    console.log(`\n  pick: ${v.agency}: ${v.title} — ${p.why}\n  draft cover: [${p.kicker}] ${p.line1} / ${p.line2}`);
    dir = path.join(ROOT, 'out', 'clips', `${date}-${v.id}`);
    w = await watch(v, p, dir);
    check = w?.check;
    if (check?.ok && (url || check.crazy >= MIN_CRAZY)) {
      ({ start, dur } = w);
      for (const k of ['kicker', 'line1', 'line2', 'caption']) if (check[k]) p[k] = check[k];
      if (!KICKERS.includes(String(p.kicker).toUpperCase())) p.kicker = 'CAUGHT ON CAMERA';
      break;
    }
    if (w) markSeen(v.id, check.ok ? `not crazy enough (${check.crazy})` : 'rejected');
    fs.rmSync(dir, { recursive: true, force: true }); check = null;
  }
  if (!check) { console.log('No candidate passed — not posting.'); return null; }
  const raw = w.raw;
  console.log(`  cut: ${start}–${(start + dur).toFixed(1)} s\n  cover: [${p.kicker}] ${p.line1} / ${p.line2}`);
  const coverFrame = path.join(dir, 'cover-frame.jpg');
  const coverAt = Number.isFinite(+check.cover) ? Math.max(0, +check.cover) : start + dur / 3;
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(coverAt), '-i', raw, '-frames:v', '1', coverFrame]);

  step('Rendering');
  const cover = await shoot(coverHTML(coverFrame, p, v.agency), path.join(dir, '01-cover.jpg'), 1080, 1350);
  const video = await renderVideo(raw, start, dur, v.agency, path.join(dir, '02-video.mp4'), dir);
  const post = { id: `${date}-clip-${v.id}`, agency: v.agency, source: v.url, title: v.title, start, ...p, crazy: check.crazy, cover, video };
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
