// Carousel posts (+ a story teaser for each): write → render JPEG slides → post.
//   node pipeline/carousel.mjs brief|world|feature [--dry-run] [--topic "..."]
// brief = morning South Florida news, world = US + world tonight, feature = rotating culture/opinion/follow-up post.
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { ROOT, readJSON, writeJSON, step } from './util.mjs';
import { fetchNews } from './news.mjs';
import { getPhoto } from './photos.mjs';

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

The cover is a scroll-stopping hook in this exact stacked style (all caps on the image):
  top: small setup line (e.g. "STUDIES SHOW", "POLICE SAY", "NOBODY TALKS ABOUT", "MIAMI IS FURIOUS")
  main: big line that opens the curiosity gap (e.g. "WHAT THE AVERAGE")
  highlight: 1–3 punchy words in giant blue letters (e.g. "FLORIDA MAN")
  bottom: the payoff that forces the swipe (e.g. "LOOKS LIKE")
  The hook must be true to the slides — never promise something the post doesn't deliver, never claim a study/number that isn't in the sources.
  blur: true when the cover photo should be blurred with a big "?" (mystery hooks), else false.

Every cover and slide needs a photo:
  {"type":"place","query":"Wikimedia Commons search for a real photo of the PLACE or THING (e.g. 'Brightline train Miami', 'Miami International Airport terminal', 'Palmetto Expressway traffic')","prompt":"fallback AI photo description"}
  or {"type":"ai","prompt":"vivid description of an illustrative photo (e.g. 'police cruiser lights reflecting on a wet Hialeah street at night')"}
  Use "place" for locations, landmarks, vehicles, buildings. Use "ai" for crime/people/abstract scenes. Never use a real photo of a person to illustrate a news story.

Return JSON: {"cover":{"top":"...","main":"...","highlight":"...","bottom":"...","blur":false,"photo":{...}},"slides":[{"tag":"ONE-WORD LABEL (e.g. TRAFFIC, WEATHER, CRIME, MONEY, UPDATE, WEIRD, SPORTS, WORLD, USA, CULTURE)","headline":"...","highlight":"2-3 word phrase copied exactly from the headline to color blue","body":"...","place":"neighborhood/city or country, optional","source":"outlet or empty for opinion slides","photo":{...}}],"caption":"...","hashtags":["5-8 extra niche hashtags"]}
3 to 7 slides.`;

const nyDate = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

function recentPosts(days = 7) {
  const dir = path.join(ROOT, 'posts');
  if (!fs.existsSync(dir)) return [];
  const since = nyDate(new Date(Date.now() - days * 864e5));
  return fs.readdirSync(dir).filter(d => d.slice(0, 10) >= since && !d.endsWith('-preview')).sort()
    .map(d => { try { return readJSON(path.join(dir, d, 'post.json')); } catch { return null; } }).filter(Boolean);
}

export async function writeCarousel(kind, { topic, preview } = {}) {
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
    if (post?.cover?.highlight && n >= 3 && n <= 8) break;
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
  post.id = `${post.date}-${kind}${topic ? '-custom' : ''}${preview ? '-preview' : ''}`;
  const dir = path.join(ROOT, 'posts', post.id);
  fs.mkdirSync(dir, { recursive: true });
  step('Finding photos');
  for (const [i, item] of [post.cover, ...post.slides].entries()) {
    const photo = await getPhoto(item.photo, dir, i ? `photo-${i}` : 'photo-cover');
    if (photo) { item.photoFile = path.basename(photo.file); item.credit = photo.credit; }
    console.log(`  ${i ? '#' + i : 'cover'}: ${photo ? photo.credit : 'no photo'}`);
  }
  writeJSON(path.join(dir, 'post.json'), post);
  console.log(`✔ ${kicker}: ${[post.cover.top, post.cover.main, post.cover.highlight, post.cover.bottom].filter(Boolean).join(' / ')}`);
  for (const s of post.slides) console.log(`   [${s.tag}] ${s.headline}${s.source ? ` (${s.source})` : ''}`);
  return dir;
}

// ---------- rendering (template: full-bleed photo, stacked caps, blue highlight, blue handle bar) ----------
const BLUE = '#1769FF';
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const font = (file, weight, style = 'normal') => `@font-face { font-family: 'Montserrat'; font-weight: ${weight}; font-style: ${style};
  src: url('data:font/woff2;base64,${fs.readFileSync(path.join(ROOT, 'assets/fonts', file)).toString('base64')}'); }`;
const CSS = `
${font('Montserrat-700.woff2', 700)} ${font('Montserrat-800.woff2', 800)} ${font('Montserrat-900.woff2', 900)} ${font('Montserrat-800i.woff2', 800, 'italic')}
* { margin: 0; box-sizing: border-box; }
body { width: 1080px; height: var(--h); overflow: hidden; background: #000; color: #fff; font-family: 'Montserrat', 'Noto Color Emoji', sans-serif; }
.bg { position: absolute; inset: 0; background-size: cover; background-position: center; }
.shade { position: absolute; inset: 0; }
.caps { font-weight: 900; text-transform: uppercase; letter-spacing: -1px; line-height: .98; text-shadow: 0 4px 24px rgba(0,0,0,.45); }
.blue { color: ${BLUE}; }
.bar { position: absolute; left: 0; right: 0; bottom: 0; height: 118px; background: ${BLUE}; display: flex; align-items: center;
  justify-content: space-between; padding: 0 56px; font-weight: 800; }
.brand { font-style: italic; font-size: 42px; }
.more { font-size: 34px; display: flex; align-items: center; gap: 22px; }
.credit { position: absolute; right: 20px; top: 20px; font-size: 19px; font-weight: 700; color: rgba(255,255,255,.85);
  background: rgba(0,0,0,.45); padding: 6px 12px; border-radius: 8px; max-width: 700px; }
.tag { display: inline-block; padding: 10px 22px; border-radius: 10px; font-weight: 900; font-size: 30px; letter-spacing: 1px; }
`;
const arrow = `<svg width="64" height="24" viewBox="0 0 64 24"><path d="M0 12h58M48 2l12 10-12 10" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const bar = right => `<div class="bar"><span class="brand">getnearapp</span><span class="more">${right}</span></div>`;
// widest size (px) that fits `text` on one line of `width` px in Montserrat Black caps
const fit1 = (text, max, width = 980) => Math.min(max, Math.floor(width / (String(text).length * 0.74 + 0.3)));

function dataUrl(dir, file) {
  if (!file || !fs.existsSync(path.join(dir, file))) return null;
  const ext = path.extname(file).slice(1).replace('jpg', 'jpeg');
  return `data:image/${ext};base64,${fs.readFileSync(path.join(dir, file)).toString('base64')}`;
}

function coverHTML(post, dir, h) {
  const c = post.cover; const img = dataUrl(dir, c.photoFile);
  return `
    ${img ? `<div class="bg" style="background-image:url('${img}');${c.blur ? 'filter:blur(26px);transform:scale(1.12)' : ''}"></div>` : `<div class="bg" style="background:radial-gradient(circle at 50% 30%, #2a3a66, #05070d)"></div>`}
    <div class="shade" style="background:linear-gradient(to bottom, rgba(0,0,0,.05) 30%, rgba(0,0,0,.35) 55%, rgba(0,0,0,.9) 88%)"></div>
    ${c.blur ? `<div class="caps" style="position:absolute;left:0;right:0;top:${h * 0.22}px;text-align:center;font-size:${h > 1400 ? 300 : 250}px">?</div>` : ''}
    ${c.credit && !c.blur ? `<div class="credit">${esc(c.credit)}</div>` : ''}
    <div style="position:absolute;left:40px;right:40px;bottom:${h > 1400 ? 220 : 150}px;text-align:center">
      ${c.top ? `<div class="caps" style="font-size:${fit1(c.top, 68)}px;margin-bottom:10px">${esc(c.top)}</div>` : ''}
      ${c.main ? `<div class="caps" style="font-size:${fit1(c.main, 104)}px">${esc(c.main)}</div>` : ''}
      <div class="caps blue" style="font-size:${fit1(c.highlight, 168)}px;margin:4px 0">${esc(c.highlight)}</div>
      ${c.bottom ? `<div class="caps" style="font-size:${fit1(c.bottom, 104)}px">${esc(c.bottom)}</div>` : ''}
    </div>
    ${bar(h > 1400 ? `new post on our page ${arrow}` : `swipe for more ${arrow}`)}`;
}

function slideHTML(s, i, n, dir) {
  const img = dataUrl(dir, s.photoFile);
  const hl = String(s.headline || ''); const k = s.highlight ? hl.toLowerCase().indexOf(String(s.highlight).toLowerCase()) : -1;
  const headline = k >= 0 ? `${esc(hl.slice(0, k))}<span class="blue">${esc(hl.slice(k, k + s.highlight.length))}</span>${esc(hl.slice(k + s.highlight.length))}` : esc(hl);
  const size = Math.max(52, Math.min(84, Math.floor(84 * Math.sqrt(48 / Math.max(48, hl.length)))));
  const red = /CRIME|BREAKING|UPDATE/.test(s.tag || '');
  return `
    ${img ? `<div class="bg" style="background-image:url('${img}');bottom:auto;height:760px"></div>` : `<div class="bg" style="background:radial-gradient(circle at 50% 20%, #2a3a66, #05070d)"></div>`}
    <div class="shade" style="background:linear-gradient(to bottom, rgba(0,0,0,0) 25%, rgba(0,0,0,.6) 45%, #000 57%)"></div>
    ${s.credit ? `<div class="credit">${esc(s.credit)}</div>` : ''}
    <div style="position:absolute;left:60px;right:60px;top:560px">
      <span class="tag" style="background:${red ? '#FF3B3B' : BLUE}">${esc(s.tag || 'NEWS')}</span>
      <div class="caps" style="font-size:${size}px;margin-top:26px">${headline}</div>
      <div style="margin-top:26px;font-size:36px;font-weight:700;line-height:1.35;color:rgba(255,255,255,.88)">${esc(s.body)}</div>
      <div style="margin-top:24px;font-size:28px;font-weight:800;color:rgba(255,255,255,.6)">${[s.place ? '📍 ' + esc(s.place) : '', s.source ? 'Source: ' + esc(s.source) : ''].filter(Boolean).join('  ·  ')}</div>
    </div>
    ${bar(i + 1 < n ? `${i + 1}/${n} ${arrow}` : `${i + 1}/${n}`)}`;
}

function ctaHTML(post, dir) {
  const img = dataUrl(dir, post.cover.photoFile);
  return `
    ${img ? `<div class="bg" style="background-image:url('${img}');filter:blur(30px) brightness(.45);transform:scale(1.15)"></div>` : ''}
    <div style="position:absolute;left:60px;right:60px;top:300px;text-align:center">
      <div style="font-size:150px">📍</div>
      <div class="caps" style="font-size:120px;margin-top:20px">STAY <span class="blue">NEAR.</span></div>
      <div style="margin-top:40px;font-size:42px;font-weight:700;line-height:1.35">Follow <b class="blue" style="font-weight:900">@getnearapp</b> for what South Florida is actually talking about.</div>
      <div style="margin-top:50px;font-size:34px;font-weight:800;color:rgba(255,255,255,.75)">Got an only-in-Miami moment?<br>Tag us or DM us to get featured.</div>
    </div>
    ${bar(`follow for more ${arrow}`)}`;
}

async function launch() {
  const local = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  return puppeteer.launch({
    headless: true, args: ['--no-sandbox'],
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
    const slides = [await shoot(coverHTML(post, dir, 1350), path.join(dir, '00-cover.jpg'), 1350)];
    for (let i = 0; i < n; i++) slides.push(await shoot(slideHTML(post.slides[i], i, n, dir), path.join(dir, `${String(i + 1).padStart(2, '0')}.jpg`), 1350));
    slides.push(await shoot(ctaHTML(post, dir), path.join(dir, '99-cta.jpg'), 1350));
    const story = await shoot(coverHTML(post, dir, 1920), path.join(dir, 'story.jpg'), 1920);
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
    : await writeCarousel(kind, { topic: ti >= 0 ? args[ti + 1] : null, preview: args.includes('--dry-run') });
  const { post, slides, story } = await renderCarousel(dir);
  if (args.includes('--dry-run') || args.includes('--render-only')) console.log(`(dry run) ${slides.length} slides in ${path.relative(ROOT, dir)}`);
  else {
    const { publishCarousel, publishStory } = await import('./publish.mjs');
    await publishCarousel(slides, post.igCaption, post.id);
    await publishStory(story, post.id).catch(e => console.log(`(story skipped: ${e.message})`));
  }
}
