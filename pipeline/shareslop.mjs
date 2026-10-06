// Shareslop (owner, Oct 6: "stuff like @lostmydaddy / @ragebaitnews … people share to couples/friends"): ONE image with a huge
// two-color headline, posted as a short Reel with a trending song (Instagram Audio API, like the map Reels).
// Stories are REAL (worldwide weird news, studies, surveys, wild arrests; South Florida every few posts) — the headline is punchy
// and provocative but true to its source. The picture is an AI-staged scene with invented people (never a real/famous person).
//   node pipeline/shareslop.mjs [--count 3] [--dry-run]
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { ROOT, run, step, writeJSON } from './util.mjs';
import { chatJSON } from './llm.mjs';
import { fetchNews, searchNews } from './news.mjs';
import { aiImage } from './photos.mjs';

const SEEN = path.join(ROOT, 'state', 'shareslop-seen.txt');
const BLUE = '#1769FF'; // Near blue (owner, Oct 6)
// owner, Oct 6: real shareslop = what one person sends the other as a hint ("do this for me", "see? I told you") — studies,
// surveys and facts about couples, partners, friends and daily habits; these stay shareable for weeks, so the search window is wide
const QUERIES = ['study finds couples', 'study partners who', 'study men who', 'study women who', 'boyfriend study', 'girlfriend study',
  'husband wife study', 'cuddling study', 'kissing study', 'massage study', 'flowers study women', 'couples who happier', 'relationship researchers',
  'dating survey', 'sleep study partner', 'friendship study', 'texting study', 'date night study', 'study finds health benefit', 'Florida man'];
const key = t => t.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ').slice(0, 7).join(' ');

async function candidates() {
  const seen = new Set((fs.existsSync(SEEN) ? fs.readFileSync(SEEN, 'utf8') : '').split('\n').map(l => l.split('\t')[0]).filter(Boolean));
  const lists = await Promise.all([
    ...QUERIES.map(q => searchNews(q, { days: 30, max: 10 }).catch(() => [])),
  ]);
  const out = [], dup = new Set();
  for (const i of lists.flat()) {
    const k = key(i.title);
    if (!i.title || seen.has(k) || dup.has(k)) continue;
    dup.add(k); out.push(i);
  }
  return out.slice(0, 160);
}

async function write(items, recent) {
  return chatJSON([{ role: 'system', content: 'You run a viral SHARE page (style: @lostmydaddy — e.g. "SPITTING IN HIS MOUTH BOOSTS HIS IMMUNE SYSTEM"): ONE picture with a huge headline '
    + 'that one person SENDS TO THEIR PARTNER, crush or best friend as a hint or a demand — "do this for me 👀", "see, science says so", "you need to start doing this", "this is literally you". '
    + 'The share IS the joke: the headline gives the sender an excuse to ask for something (cuddles, massages, compliments, flowers, food, sleep, attention, gym time, a trip) or to call the other person out. '
    + 'From these REAL headlines pick the ONE whose finding works best as that hint. Best: studies/surveys about what partners should do for each other and what it does for them '
    + '("MEN WHO GET A DAILY HUG LIVE LONGER", "WOMEN WHO GET FLOWERS RANDOMLY ARE HAPPIER, STUDY FINDS", "COUPLES WHO NAP TOGETHER FIGHT LESS"), habits that make someone more attractive, '
    + 'friend-group callouts. Phrase the headline as the HINT (subject = the person being sent it: "HIM", "HER", "YOUR GIRLFRIEND", "MEN WHO…"), short and a little cheeky. '
    + 'If nothing works as a hint, pick the closest relationship/friendship finding; never generic news.\n'
    + 'HARD RULES (the account must stay safe): the headline must be TRUE to the source headline — provocative wording is fine, inventing facts is not '
    + '(a study "suggests"/"finds", not "proves"; never health advice the source doesn\'t give). Never about a real celebrity or public figure, '
    + 'never names a private person or victim, nothing about deaths, kids, sexual assault, race, ethnicity, religion, nationality or politics. '
    + `Don't repeat these recent angles: ${recent.join(' | ') || 'none'}.\n`
    + 'Write: "headline": 5–11 words, ALL CAPS, the hint (true to the finding); '
    + '"hot": 1–3 consecutive words copied exactly from the headline to color blue (the ask/the payoff); '
    + '"image": a photorealistic staged scene that SHOWS THE HINT BEING FULFILLED (the person the headline is about receiving it and visibly loving it, e.g. "his nervous system wants a back massage" → a man face-down on a couch, eyes closed, blissed out, while his girlfriend massages his shoulders, warm lamp light), exaggerated like a viral meme photo — describe exactly who is where doing what; or one that ACTS OUT the headline literally, mid-action, absurd and a little uncomfortable like a viral meme photo (e.g. for "spitting boosts immunity": a woman pouring water into a man\'s open mouth in a park while people around sneeze into tissues) — never just people staring shocked at a phone; invented ordinary people, no text, no real people; '
    + '"caption": 2 short lines retelling the story plainly with the key fact + "Source: <outlet>" + a share line that fits that tells them to SEND it (e.g. "Send this to your man 👀", "Send this to her. Just do it 😭", "Leave this on his phone 👀", "Tag who owes you this"); '
    + '"hashtags": 3 hashtags; "angle": 3-word label of the topic. '
    + 'First draft 4 different options from different headlines, score each "send": 1–10 = how likely a real person forwards it to their partner/friend as a hint ("send this to him" energy; animals, generic science or trivia score ≤4), then return ONLY the best one with its score. '
    + 'Reply JSON {"send": n, "index": n, "headline": "", "hot": "", "image": "", "caption": "", "hashtags": [], "angle": ""}.' },
  { role: 'user', content: items.map((i, n) => `${n}. [${i.source}] ${i.title}`).join('\n') }], 'write');
}

function html(headline, hot, img) {
  const words = headline.trim().split(/\s+/);
  const hotWords = String(hot || '').toUpperCase().split(/\s+/).filter(Boolean);
  let start = -1;
  for (let i = 0; hotWords.length && i + hotWords.length <= words.length; i++)
    if (hotWords.every((w, j) => words[i + j].replace(/[^A-Z0-9']/gi, '') === w.replace(/[^A-Z0-9']/gi, ''))) { start = i; break; }
  const body = words.map((w, i) => start >= 0 && i >= start && i < start + hotWords.length ? `<span class="hot">${w}</span>` : w).join(' ');
  const font = fs.readFileSync(path.join(ROOT, 'assets/fonts/Oswald-var.woff2')).toString('base64');
  const mont = fs.readFileSync(path.join(ROOT, 'assets/fonts/Montserrat-900.woff2')).toString('base64');
  return `<html><head><meta charset="utf-8"><style>
@font-face { font-family: 'Oswald'; font-weight: 200 700; src: url('data:font/woff2;base64,${font}'); }
@font-face { font-family: 'Mont'; font-weight: 900; src: url('data:font/woff2;base64,${mont}'); }
* { margin: 0; box-sizing: border-box; }
body { width: 1080px; height: 1920px; background: #000; overflow: hidden; position: relative; }
.photo { position: absolute; inset: 0; background: url('data:image/png;base64,${fs.readFileSync(img).toString('base64')}') center 30% / cover; }
.fade { position: absolute; left: 0; right: 0; bottom: 0; height: 1150px; background: linear-gradient(to bottom, rgba(0,0,0,0), rgba(0,0,0,.82) 42%, #000 72%); }
.box { position: absolute; left: 34px; right: 34px; bottom: 400px; text-align: center; }
.brand { display: flex; align-items: center; gap: 18px; justify-content: center; margin-bottom: 22px; }
.brand i { flex: 1; height: 3px; background: rgba(255,255,255,.75); }
.brand b { font: 900 40px 'Mont'; color: #fff; letter-spacing: 1px; }
.brand b span { background: ${BLUE}; color: #fff; padding: 2px 14px; border-radius: 8px; margin-left: 8px; }
h1 { font: 700 150px/0.98 'Oswald'; color: #fff; text-transform: uppercase; letter-spacing: -1px; word-spacing: 4px; }
.hot { color: ${BLUE}; text-shadow: 0 0 18px rgba(23,105,255,.45); -webkit-text-stroke: 2px #4d8dff; }
</style></head><body><div class="photo"></div><div class="fade"></div>
<div class="box"><div class="brand"><i></i><b>GET<span>NEAR</span></b><i></i></div><h1 id="h">${body}</h1></div></body></html>`;
}

export async function render(post, dir) {
  const local = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'],
    ...(process.env.PUPPETEER_EXECUTABLE_PATH ? { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH } : !process.env.CI && fs.existsSync(local) ? { executablePath: local } : {}) });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1920 });
    await page.setContent(html(post.headline, post.hot, post.imageFile), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    // shrink the headline until it fits in ~640 px (3–5 lines)
    await page.evaluate(() => { const h = document.getElementById('h'); let s = 150; while (h.offsetHeight > 640 && s > 70) { s -= 4; h.style.fontSize = s + 'px'; } });
    const jpg = path.join(dir, 'slide.jpg');
    await page.screenshot({ path: jpg, type: 'jpeg', quality: 93 });
    return jpg;
  } finally { await browser.close(); }
}

async function makeOne(n, items, recent, dryRun) {
  step(`Shareslop ${n}`);
  const w = await write(items, recent);
  const item = items[w?.index];
  if (!item || !w.headline || !w.image) throw new Error('writer returned nothing usable: ' + JSON.stringify(w).slice(0, 200));
  items.splice(w.index, 1); // not twice in one run
  if (!(+w.send >= 7)) throw new Error(`best option only scored ${w.send}/10 for sharing ("${w.headline}") — skipped`);
  const id = `${new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })}-${String(Date.now()).slice(-6)}`;
  const dir = path.join(ROOT, 'out', 'shareslop', id);
  fs.mkdirSync(dir, { recursive: true });
  console.log(`  [${item.source}] ${item.title}\n  → ${w.headline}  (hot: ${w.hot})`);
  const img = await aiImage(w.image, dir, 'image', 'people');
  if (!img) throw new Error('no image');
  const post = { id, source: item.source, sourceTitle: item.title, headline: w.headline.toUpperCase(), hot: w.hot, image: w.image, imageFile: img.file, angle: w.angle,
    caption: `${w.caption}\n\n${(w.hashtags || []).slice(0, 3).map(h => '#' + String(h).replace(/^#/, '')).join(' ')}`.trim() };
  const jpg = await render(post, dir);
  // a 7 s Reel of the still (Reels need video; the song is added by Instagram) — silent track so the song mixes in cleanly
  const mp4 = path.join(dir, `shareslop-${id}.mp4`);
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-loop', '1', '-i', jpg, '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', '7',
    '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', mp4]);
  writeJSON(path.join(dir, 'post.json'), { ...post, video: path.basename(mp4) });
  fs.mkdirSync(path.dirname(SEEN), { recursive: true });
  fs.appendFileSync(SEEN, `${key(item.title)}\t${post.angle || ''}\t${id}\n`);
  if (dryRun) { console.log(`  (dry run) ${dir}`); return post; }
  const { publishReelWithMusic } = await import('./publish.mjs');
  await publishReelWithMusic(mp4, post.caption, { audioVolume: 70 }); // no voice → the song carries it
  return post;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const count = Math.max(1, Math.min(5, +(args[args.indexOf('--count') + 1]) || 1));
  const items = await candidates();
  console.log(`${items.length} candidate headlines`);
  const recent = (fs.existsSync(SEEN) ? fs.readFileSync(SEEN, 'utf8').trim().split('\n').slice(-15) : []).map(l => l.split('\t')[1]).filter(Boolean);
  let ok = 0;
  for (let n = 1; n <= count; n++) {
    try { const p = await makeOne(n, items, recent, dryRun); recent.push(p.angle); ok++; }
    catch (e) { console.log(`  (shareslop ${n} failed: ${e.message.slice(0, 300)})`); }
  }
  if (!ok) process.exit(1);
}
