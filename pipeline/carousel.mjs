// Carousel posts (+ a story teaser for each): write → render JPEG slides → post.
//   node pipeline/carousel.mjs brief|world|feature [--dry-run] [--topic "..."]
// brief = morning South Florida news, world = US + world tonight, feature = rotating culture/opinion/follow-up post.
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { ROOT, readJSON, writeJSON, step } from './util.mjs';
import { fetchNews } from './news.mjs';

const HANDLE = '@getnearapp';
const TAGS = ['#miami', '#miamidade', '#305', '#southflorida', '#miaminews', '#florida', '#dade', '#miamilife',
  '#hialeah', '#browardcounty', '#fortlauderdale', '#onlyinmiami', '#onlyindade', '#getnearmiami'];

// Feature posts rotate by New York weekday (0 = Sunday)
const FEATURES = [
  { name: 'THIS OR THAT', ask: 'A "this or that" debate carousel: 5 South Florida matchups (e.g. Palmetto vs I-95 at 5pm, Versailles vs La Carreta, Brickell vs Wynwood, Publix sub vs Pollo Tropical). One slide per matchup with a savage one-line case for each side. Readers comment their picks.' },
  { name: 'HOT TAKE', ask: 'One spicy South Florida hot take, argued over 5 slides (the claim, 3 pieces of evidence from lived local experience, the verdict). Opinion and jokes only — no invented statistics.' },
  { name: 'MEANWHILE IN FLORIDA', ask: 'The 5 wildest/weirdest Florida stories from the headlines below (animals, "Florida Man", bizarre crimes, weather chaos). Tell them straight but with a wink.' },
  { name: 'YOU KNOW YOU\'RE FROM DADE WHEN', ask: 'A culture carousel: 6 hyper-specific, affectionate "you know you\'re from Dade when…" moments (cafecito at 3pm, the ventanita, Publix subs, hurricane-prep panic buying, the 5 o\'clock rain, parking at Dadeland on a Saturday). Celebrate the culture; never mock any ethnic group.' },
  { name: 'THE FOLLOW-UP', ask: 'A follow-up carousel: pick the 4–5 biggest stories from our recent posts (listed below) that have new developments in today\'s headlines, and tell readers what happened next. Tag each slide UPDATE. If fewer than 4 have updates, fill with today\'s biggest South Florida stories.' },
  { name: 'SOUTH FLORIDA STARTER PACK', ask: 'A "starter pack" carousel: 5 South Florida neighborhoods or cities (Kendall, Hialeah, Brickell, Doral, Fort Lauderdale…) with 3-4 funny, specific starter-pack items each. Roast places and habits, never ethnic groups.' },
  { name: 'THE WEEK IN DADE', ask: 'Recap the 5–6 biggest South Florida stories of the week from our recent posts and today\'s headlines, one slide each, with a closing "what\'s next".' },
];

const KINDS = {
  brief: { kicker: 'THE DADE BRIEF ☕', feed: 'local', ask: 'The morning news carousel: the 5–6 most talked-about South Florida (Miami-Dade, Broward, Palm Beach, the Keys) stories from the headlines below. Prioritize what locals will share and argue about: traffic, weather, crime, prices, rent, development, Brightline, airports, sports, viral moments. Skip national stories unless they hit South Florida directly.' },
  world: { kicker: 'TONIGHT IN THE WORLD 🌎', feed: 'world', ask: 'The night news carousel: the 3 biggest US stories and the 3 biggest world stories from the headlines below, one per slide, explained in one breath for someone scrolling in bed. Add a Miami/Florida angle when there honestly is one.' },
  feature: { feed: 'local' },
};

const SYSTEM = `You write carousel posts for @getnearapp, a South Florida Instagram account in the spirit of Only in Dade: local, fast, funny, a little savage, community first. You're the friend who knows everything happening in Dade.

Rules:
- News: only use facts that are in the headlines/summaries given to you. Never invent names, numbers, quotes or outcomes. If a detail isn't in the source, leave it out.
- Crime/accusations: say "police say"/"according to" as the source did; don't name people who haven't been charged; never mock victims.
- Satire targets places, traffic, prices, HOAs, tourists, weather, situations — never ethnic groups, nationalities, religions, races, or private people. No slurs, nothing explicit.
- Every news slide credits its outlet in "source" (use the outlet name exactly as given).
- Headlines: punchy, ≤ 70 characters, sentence case. Body: 1–2 short sentences, ≤ 200 characters, conversational.
- Caption: a 1–2 line hook, then a question that invites comments. Don't list sources in the caption (we add them).

Return JSON: {"cover":{"headline":"≤ 60 chars","emoji":"one emoji"},"slides":[{"tag":"ONE-WORD LABEL (e.g. TRAFFIC, WEATHER, CRIME, MONEY, UPDATE, WEIRD, SPORTS, WORLD, USA, CULTURE)","emoji":"one emoji","headline":"...","body":"...","place":"neighborhood/city or country, optional","source":"outlet or empty for opinion slides"}],"caption":"...","hashtags":["5-8 extra niche hashtags"]}
3 to 7 slides.`;

const nyDate = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

function recentPosts(days = 7) {
  const dir = path.join(ROOT, 'posts');
  if (!fs.existsSync(dir)) return [];
  const since = nyDate(new Date(Date.now() - days * 864e5));
  return fs.readdirSync(dir).filter(d => d.slice(0, 10) >= since).sort()
    .map(d => { try { return readJSON(path.join(dir, d, 'post.json')); } catch { return null; } }).filter(Boolean);
}

export async function writeCarousel(kind, { topic } = {}) {
  const spec = KINDS[kind];
  if (!spec) throw new Error(`Unknown carousel kind "${kind}" (brief|world|feature)`);
  const weekday = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })).getDay();
  const feature = kind === 'feature' ? FEATURES[weekday] : null;
  const kicker = feature ? `${feature.name}` : spec.kicker;

  step(`Writing ${kind} carousel${feature ? ` (${feature.name})` : ''}`);
  const news = await fetchNews(spec.feed);
  const recent = recentPosts();
  const ask = [
    topic ? `The account owner asked for this — follow it: ${topic}` : (feature ? feature.ask : spec.ask),
    `Today (New York): ${new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric' })}`,
    `Headlines (outlet — headline — summary):\n${news.map(n => `- ${n.source} — ${n.title}${n.summary ? ' — ' + n.summary : ''}`).join('\n')}`,
    recent.length ? `Our posts from the last week (don't repeat these unless there's an update — then tag it UPDATE):\n${recent.flatMap(p => p.slides.map(s => `- ${p.date}: ${s.headline}`)).join('\n')}` : '',
  ].filter(Boolean).join('\n\n');

  let post;
  for (let attempt = 1; attempt <= 3; attempt++) {
    post = await chat([{ role: 'system', content: SYSTEM }, { role: 'user', content: ask }]);
    const n = post?.slides?.length || 0;
    if (post?.cover?.headline && n >= 3 && n <= 8) break;
    console.log(`  attempt ${attempt}: bad shape (${n} slides) — retrying`);
    post = null;
  }
  if (!post) throw new Error('Could not write carousel');
  post.slides = post.slides.slice(0, 7);

  const sources = [...new Set(post.slides.map(s => s.source).filter(Boolean))];
  const tags = [...new Set([...TAGS.slice(0, 8), ...(post.hashtags || []).map(t => '#' + String(t).replace(/^#/, '').replace(/\s/g, ''))])].slice(0, 20);
  post.igCaption = [
    post.caption,
    sources.length ? `📰 Sources: ${sources.join(', ')}` : '',
    `📍 Got an only-in-Miami moment? Tag ${HANDLE} or DM us to get featured.`,
    tags.join(' '),
  ].filter(Boolean).join('\n\n');
  post.kind = kind;
  post.kicker = kicker;
  post.date = nyDate();
  post.id = `${post.date}-${kind}${topic ? '-custom' : ''}`;
  const dir = path.join(ROOT, 'posts', post.id);
  writeJSON(path.join(dir, 'post.json'), post);
  console.log(`✔ ${kicker}: ${post.cover.headline}`);
  for (const s of post.slides) console.log(`   [${s.tag}] ${s.headline}${s.source ? ` (${s.source})` : ''}`);
  return dir;
}

// ---------- rendering ----------
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const FONT_URL = 'data:font/ttf;base64,' + fs.readFileSync(path.join(ROOT, 'assets/fonts/ArchivoBlack-Regular.ttf')).toString('base64');
const CSS = `
@font-face { font-family: 'Archivo Black'; src: url('${FONT_URL}'); }
* { margin: 0; box-sizing: border-box; }
body { width: 1080px; height: var(--h); overflow: hidden; background: #0b0b0f; color: #fff;
  font-family: 'Helvetica Neue', Arial, 'Noto Color Emoji', sans-serif; }
.frame { position: absolute; inset: 0; padding: 90px 80px; display: flex; flex-direction: column;
  background: radial-gradient(circle at 85% 10%, rgba(255,225,77,.18), transparent 45%),
              radial-gradient(circle at 10% 95%, rgba(255,59,59,.16), transparent 50%), #0b0b0f; }
.h { font-family: 'Archivo Black', sans-serif; letter-spacing: -1px; line-height: 1.02; }
.pill { display: inline-block; padding: 12px 26px; border-radius: 999px; font-family: 'Archivo Black', sans-serif; font-size: 34px; }
.yellow { background: #FFE14D; color: #000; } .red { background: #FF3B3B; color: #fff; }
.top { display: flex; justify-content: space-between; align-items: center; }
.count { font-family: 'Archivo Black'; font-size: 34px; color: rgba(255,255,255,.55); }
.emoji { font-family: 'Noto Color Emoji', 'Apple Color Emoji', sans-serif; }
.foot { position: absolute; left: 80px; right: 80px; bottom: 70px; display: flex; justify-content: space-between;
  font-size: 30px; color: rgba(255,255,255,.7); font-weight: 700; }
.bar { position: absolute; left: 0; top: 0; height: 14px; background: #FFE14D; }
`;

function fit(text, max, min, perLine, lines) {
  // crude auto-size for the heavy headline font
  const len = String(text).length;
  let size = max;
  while (size > min && Math.ceil(len * size * 0.6 / perLine) > lines) size -= 4;
  return size;
}

function coverHTML(post, h, story = false) {
  const date = new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'long', month: 'short', day: 'numeric' });
  return `<div class="frame" style="justify-content:center">
    <div class="bar" style="width:100%"></div>
    <div><span class="pill yellow">${esc(post.kicker)}</span></div>
    <div class="emoji" style="font-size:${story ? 220 : 170}px;margin:50px 0 30px">${esc(post.cover.emoji || '📍')}</div>
    <div class="h" style="font-size:${fit(post.cover.headline, story ? 130 : 118, 70, 920, story ? 6 : 5)}px">${esc(post.cover.headline)}</div>
    <div style="margin-top:44px;font-size:38px;font-weight:700;color:#FFE14D">${esc(date)}</div>
    <div class="foot"><span>${HANDLE}</span><span>${story ? 'NEW POST ON OUR PAGE 👆' : 'SWIPE →'}</span></div>
  </div>`;
}

function slideHTML(s, i, n) {
  return `<div class="frame">
    <div class="bar" style="width:${Math.round(((i + 1) / n) * 100)}%"></div>
    <div class="top"><span class="pill ${/UPDATE|BREAKING|CRIME/.test(s.tag) ? 'red' : 'yellow'}">${esc(s.tag || 'NEWS')}</span><span class="count">${i + 1}/${n}</span></div>
    <div class="emoji" style="font-size:150px;margin:60px 0 36px">${esc(s.emoji || '📍')}</div>
    <div class="h" style="font-size:${fit(s.headline, 92, 58, 920, 4)}px">${esc(s.headline)}</div>
    <div style="margin-top:36px;font-size:42px;line-height:1.35;color:rgba(255,255,255,.88)">${esc(s.body)}</div>
    ${s.place ? `<div style="margin-top:30px;font-size:34px;font-weight:700;color:#FFE14D">📍 ${esc(s.place)}</div>` : ''}
    <div class="foot"><span>${s.source ? 'Source: ' + esc(s.source) : HANDLE}</span><span>${s.source ? HANDLE : ''}</span></div>
  </div>`;
}

function ctaHTML() {
  return `<div class="frame" style="justify-content:center;text-align:center;align-items:center">
    <div class="bar" style="width:100%"></div>
    <div class="emoji" style="font-size:170px">📍</div>
    <div class="h" style="font-size:96px;margin-top:40px">Stay near.</div>
    <div style="margin-top:40px;font-size:44px;line-height:1.35;color:rgba(255,255,255,.9)">Follow <b style="color:#FFE14D">${HANDLE}</b> for what South Florida is actually talking about.</div>
    <div style="margin-top:50px"><span class="pill red">SEND US YOUR MIAMI MOMENTS</span></div>
    <div style="margin-top:26px;font-size:34px;color:rgba(255,255,255,.7)">Tag ${HANDLE} or DM us to get featured</div>
  </div>`;
}

async function launch() {
  const local = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  return puppeteer.launch({
    headless: true, args: ['--no-sandbox', '--allow-file-access-from-files'],
    ...(process.env.PUPPETEER_EXECUTABLE_PATH ? { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH }
      : !process.env.CI && fs.existsSync(local) ? { executablePath: local } : {}),
  });
}

export async function renderCarousel(dir) {
  const post = readJSON(path.join(dir, 'post.json'));
  step(`Rendering ${post.slides.length + 2} slides + story`);
  const browser = await launch();
  const shoot = async (html, file, height) => {
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height });
    await page.setContent(`<html><head><meta charset="utf-8"><style>${CSS}</style></head><body style="--h:${height}px">${html}</body></html>`, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: file, type: 'jpeg', quality: 92 });
    await page.close();
    return file;
  };
  try {
    const n = post.slides.length;
    const slides = [await shoot(coverHTML(post, 1350), path.join(dir, '00-cover.jpg'), 1350)];
    for (let i = 0; i < n; i++) slides.push(await shoot(slideHTML(post.slides[i], i, n), path.join(dir, `${String(i + 1).padStart(2, '0')}.jpg`), 1350));
    slides.push(await shoot(ctaHTML(), path.join(dir, '99-cta.jpg'), 1350));
    const story = await shoot(coverHTML(post, 1920, true), path.join(dir, 'story.jpg'), 1920);
    return { post, slides, story };
  } finally {
    await browser.close();
  }
}

async function chat(messages) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-5.5', response_format: { type: 'json_object' }, messages }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  return JSON.parse((await res.json()).choices[0].message.content);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const kind = args.find(a => !a.startsWith('--')) || 'brief';
  const ti = args.indexOf('--topic');
  const dir = args.includes('--render-only') ? path.resolve(ROOT, args[args.indexOf('--render-only') + 1])
    : await writeCarousel(kind, { topic: ti >= 0 ? args[ti + 1] : null });
  const { post, slides, story } = await renderCarousel(dir);
  if (args.includes('--dry-run') || args.includes('--render-only')) console.log(`(dry run) ${slides.length} slides in ${path.relative(ROOT, dir)}`);
  else {
    const { publishCarousel, publishStory } = await import('./publish.mjs');
    await publishCarousel(slides, post.igCaption, post.id);
    await publishStory(story, post.id).catch(e => console.log(`(story skipped: ${e.message})`));
  }
}
