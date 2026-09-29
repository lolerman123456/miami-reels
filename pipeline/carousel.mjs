// Carousel posts (+ a story teaser for each): write → render JPEG slides → post.
//   node pipeline/carousel.mjs brief|news|world|feature [--dry-run] [--topic "..."]
// brief = morning South Florida news, world = US + world tonight, feature = rotating culture/opinion/follow-up post.
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { ROOT, readJSON, writeJSON, step } from './util.mjs';
import { fetchNews, searchNews, fetchArticles, fetchViral } from './news.mjs';
import { getPhoto, newPost } from './photos.mjs';
import { aiTells, BANNED } from './generate.mjs';
import { wikiArticle, rentFacts, gasFacts } from './facts.mjs';
import { STYLE, REMINDER, toneLines, sanitize, memeTells, HANDLES_RULE, cleanCollabs } from './style.mjs';

const HANDLE = '@getnearapp';
const TAGS = ['#miami', '#miamidade', '#305', '#southflorida', '#miaminews', '#florida', '#dade', '#miamilife',
  '#hialeah', '#browardcounty', '#fortlauderdale', '#onlyinmiami', '#onlyindade', '#getnearmiami'];

// Feature posts rotate by New York weekday (0 = Sunday). All informational, from real sources — no jokes.
// wiki/rent: the writer first picks Wikipedia articles / Zillow rent places to pull facts from.
const FEATURES = [
  { name: 'THE WEEK IN DADE', ask: 'Recap the 5–6 biggest South Florida stories of the week from our recent posts and the headlines below, one slide each: what happened and what happens next.' },
  { name: 'DID YOU KNOW', wiki: true, ask: 'A "did you know" carousel: 5–6 genuinely surprising, true facts about ONE South Florida city, neighborhood, landmark or institution, taken from the Wikipedia sources. Each slide = one fact with the number/date/name that makes it land.' },
  { name: 'RENT CHECK', rent: true, ask: 'A rent carousel from the Zillow rent data: one slide per city/ZIP with the typical rent now vs a year ago, 5 years ago and 2015, plus the dollar and percent change. Close with the biggest jump.' },
  { name: 'THE HISTORY OF', wiki: true, ask: 'The real history of ONE South Florida place (a landmark, island, building, neighborhood or road), told in 5–6 slides from its start to today, each slide a key moment with its date. Use the Wikipedia sources.' },
  { name: 'THE FOLLOW-UP', ask: 'A follow-up carousel: pick the 4–5 biggest stories from our recent posts (listed below) that have new developments in the headlines, and say what happened next. Tag each slide UPDATE. If fewer than 4 have updates, fill with the biggest current South Florida stories.' },
  { name: 'NEW IN SOUTH FLORIDA', wiki: true, ask: 'What is being built, approved or opening in South Florida (towers, stations, parks, stadiums, big projects), from the headlines and Wikipedia sources: what it is, where, how big/tall/expensive, when it opens.' },
  { name: 'BY THE NUMBERS', wiki: true, ask: 'ONE big South Florida place or system (PortMiami, MIA, Brightline, the Everglades, Hard Rock Stadium, I-95, a famous building) told through 5–6 real numbers from the Wikipedia sources, one number per slide with what it means.' },
];

const KINDS = {
  // owner: no roundups. Each news carousel is ONE big story told in depth, slides connected.
  brief: { kicker: 'THE DADE BRIEF ☕', feed: 'local', pick: 'the single biggest South Florida (Miami-Dade, Broward, Palm Beach, the Keys) story that many people here will care about: a major crime, disaster, big money, prices/rent, a big development, a major court case. Never a small business closing, a minor traffic item or a neighborhood-only story.', ask: 'The morning news carousel: ONE South Florida story told in depth across 5–6 connected slides (what happened, the key details and numbers, why it happened, who it affects here, what happens next).' },
  // several a day (control.json carousels.news = [hours]): the most viral South Florida story right now, one per post
  news: { kicker: 'MIAMI NEWS 🚨', feed: 'local', pick: 'the single most viral South Florida story right now: the one people are sharing, commenting on and arguing about (a shocking crime or arrest, a wild video, a disaster, a celebrity moment in Miami, a big price or rent shock, a major court case, a huge development). Never a small business closing, a minor traffic item, a routine meeting or a neighborhood-only story. It must be a DIFFERENT story from the ones we already posted (listed below).', ask: 'A news carousel: ONE viral South Florida story told in depth across 5–6 connected slides (what happened, the key details and numbers, how it started, who it affects here, what happens next).' },
  world: { kicker: 'NEWS FROM AROUND THE WORLD 🌎', feed: 'world', pick: 'the single most serious story in the world today: the deadliest, most dangerous or most consequential (war, disaster, attack, crisis). Pick the one with the most facts in the headlines.', ask: 'The night news carousel: ONE world story, the most serious one today, told in depth across 5–6 connected slides (what happened, the scale in numbers, how it started, who is affected, what the world is doing, what happens next, and a Florida/US angle only if there honestly is one).' },
  feature: { feed: 'local' },
  // TikTok-first: things people can actually go to in the next 7 days (the raves Reel was our top post)
  // everyday share bait (owner): food deals, free stuff, giveaways, food drives — things people send to a friend
  deals: { kicker: 'FREE & CHEAP IN MIAMI 🍔', feed: 'local', ask: 'A "deals and free stuff" carousel for South Florida: the 5–6 best deals, freebies, giveaways and community food drives/distributions happening now or in the next 7 days (fast-food app deals and free-item days, national food day deals, free events, giveaways, church or food bank food drives with the place, date and time). One slide each (5–6 slides): what you get, the price or "FREE", WHO by name (the chain, brand, church or group; never "participating chains"), where (city for local ones), the exact dates, and how to get it (app, code, bring ID, first come). Only deals and drives stated in the headlines, still valid now or upcoming; never guess a price or date. Tags are DEALS. Tag the chain or organization if it is in the collaborators list. Caption ends with "send this to someone who needs it".' },
  upcoming: { kicker: 'THIS WEEK IN MIAMI 🎟️', feed: 'local', ask: 'An "upcoming in South Florida" carousel: the 5–6 best things happening in the next 7 days that people can actually go to (concerts, festivals, parties, openings, free events, big games, pop-ups). One slide each: what it is, the exact date and time, the venue and city, the price if known, and one line on why it is worth going. Use events whose dates are in the headlines and fall within the next 7 days (or ongoing ones, like an exhibit or season that is open this week); skip anything already over. Always return 5–6 slides. Order by date. Headlines name the event; tags are EVENTS. Caption ends asking who they are taking (tag a friend).' },
};

const SYSTEM = `You write carousel posts for @getnearapp, a South Florida Instagram account: local news, real facts and useful information, community first. You're the friend who always knows what's going on and explains it clearly.

Rules:
- Facts: use ONLY facts in the headlines/sources given to you. Never invent names, numbers, dates, quotes or outcomes. If a detail isn't in the sources, leave it out.
- Crime/accusations: say "police say"/"according to" as the source did; don't name people who haven't been charged.
- Informative first. Interesting because of the facts. Humor only as the house style allows (one dry line from the fact, never quirky lists).
- Every news slide credits its outlet in "source" (outlet name exactly as given; "Wikipedia" or "Zillow" for those).
- Headlines: specific and clear, ≤ 70 characters, sentence case, with the key number/name. Body: 1–2 sentences, ≤ 190 characters, that EXPLAIN the headline with hard specifics (a number, a name, a place, a date, a price, a comparison like "vs 90 minutes by car"). Never vague filler like "this could change things", "it's a big deal", "many people", "experts say", "in the future". Each body picks up from the previous slide (it uses what the reader just learned) and sets up the next headline.
- Write like a person talking normally, not AI. Banned: "It's not X, it's Y", "That's not X, that's Y", "If not X, then Y", "X isn't just Y", "The result? …", "Plot twist", "Here's the thing", "Let's be real", "Welcome to", em-dashes, neat morals, triples, and never mention "sources" in the text.
- STORY: if the post is about ONE topic (anything except the daily brief/world roundups), the slides are ONE continuous story.
  Each slide picks up where the previous one ended and adds the next piece: what happened → how it compares → why it's
  happening → who it affects here → where it leaves South Florida / what's next. Write slide 2+ so they read as a
  continuation ("That's…", "The jump comes as…", "For drivers in Miami-Dade…", "It puts Florida…"), never as standalone
  facts that repeat the topic name each time. This applies to every post, including the daily brief and world carousels.
  The HEADLINES themselves chain: slide 1's headline states the news; every later headline starts with a transition that
  links to the slide before it, e.g. "THAT'S 12 CENTS MORE THAN LAST WEEK", "THAT ALSO MEANS A FILL-UP COSTS $18.90 MORE",
  "WHICH PUTS FLORIDA NEAR ITS 12-MONTH HIGH", "THE REASON: CRUDE COSTS AND MIDEAST CONFLICT", "AND DIESEL IS WORSE AT $6.34", "SO WHAT HAPPENS NEXT?",
  "FOR DRIVERS IN MIAMI-DADE, THAT MEANS…". Read only the headlines in order and they must tell the whole story. EVERY headline after the first starts with a linking phrase (THAT'S, THAT ALSO MEANS, WHICH, THE REASON:, AND, SO, FOR …, ON TOP OF THAT).
  Include the why (causes named in the headlines/sources) and who it affects when the sources have it, not only numbers.
- SECTOR: pick ONE section label for the post from: ECONOMY, TRAFFIC, WEATHER, REAL ESTATE, CRIME, DEVELOPMENT, TRANSIT,
  HISTORY, SPORTS, HEALTH, EDUCATION, CITY HALL, WORLD, USA. Single-topic posts use that same label on every slide.
  Never use labels like UPDATE, FACT, MONEY, NEWS.
- Caption: 1–2 informative lines, then a real question for the comments. Don't list sources in the caption (we add them).

The cover is a scroll-stopping hook in this exact stacked style (all caps on the image):
  top: small setup line (e.g. "POLICE SAY", "DID YOU KNOW", "NOBODY TALKS ABOUT", "RENT IN")
  main: big line that opens the curiosity gap (e.g. "WHAT THE AVERAGE")
  highlight: 1–3 punchy words in giant blue letters (e.g. "FLORIDA MAN")
  bottom: the payoff that forces the swipe (e.g. "LOOKS LIKE")
  The four lines must read as ONE sentence with a payoff, e.g. "GAS IN FLORIDA / JUST HIT / $4.22 / UP $1.26 FROM LAST YEAR" or "THIS TOWER IN MIAMI / WILL BE THE / TALLEST IN FLORIDA / AT 1,049 FEET". Never repeat a word across lines (not "GAS ... GAS").
  Build the hook around the single most clickable story or idea in the post (a specific shocking detail, not a summary like "stories to know").
  The hook must be true to the slides — never promise something the post doesn't deliver, never claim a study/number that isn't in the sources.
  blur: true when the cover photo should be blurred with a big "?" (mystery hooks), else false.

Every cover and slide needs a photo: {"query":"Wikimedia Commons search for a real stock photo (place, landmark, road, building, vehicle, object, scene — e.g. 'Brightline train Miami', 'Palmetto Expressway traffic', 'police car Miami-Dade', 'Cuban coffee cafecito')","prompt":"AI photo description, used only if no stock photo looks good (e.g. 'police cruiser lights reflecting on a wet Hialeah street at night')"}
  Stock photos are preferred (AI images are budgeted), so write queries likely to find a real, good-looking photo. Never plan a real photo of a person to illustrate a news story.

Return JSON: {"sector":"ECONOMY","cover":{"top":"...","main":"...","highlight":"...","bottom":"...","blur":false,"photo":{...},"emojis":["2-4 emojis"],"logos":["domains of the brands/orgs in the post, list posts only, max 6"]},"slides":[{"tag":"SECTOR label from the list","headline":"...","highlight":"2-3 word phrase copied exactly from the headline to color blue","body":"...","place":"neighborhood/city or country, optional","source":"outlet or empty for opinion slides","photo":{...},"color":"#hex brand/team color when the slide is about one brand, team or org (Dolphins #008E97, Dunkin #FF671F), else omit","emoji":"1 emoji for the slide","chip":"key fact ≤16 chars: date, price or number (TUE 9/29, $52+, FREE, 7-0 VOTE)","logo":"official website domain of the brand/team/org the slide is about (dunkindonuts.com, miamidolphins.com, miamidade.gov), else omit; never for people"}],"caption":"...","hashtags":["2 specific hashtags for this post"],"collaborators":["handles from the COLLABORATORS list, or empty"]}
3 to 7 slides. EVERY slide must have tag, headline, highlight, body, photo, emoji and chip. Slides must look alive (owner's rule): brand colors, logos, emojis and fact chips wherever they fit.`;

const nyDate = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

function recentPosts(days = 7) {
  const dir = path.join(ROOT, 'posts');
  if (!fs.existsSync(dir)) return [];
  const since = nyDate(new Date(Date.now() - days * 864e5));
  return fs.readdirSync(dir).filter(d => d.slice(0, 10) >= since && !d.endsWith('-preview')).sort()
    .map(d => { try { return readJSON(path.join(dir, d, 'post.json')); } catch { return null; } }).filter(Boolean);
}

// A brand's logo from its site icon (apple-touch-icon or Google's favicon service); kept only if it is big enough to look sharp.
export async function getLogo(domain, dir, name) {
  domain = String(domain || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '').trim();
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) return null;
  const sharp = (await import('sharp')).default;
  // our own logo library first (assets/logos/<domain>.png: clean, full-size logos for the chains we post about most)
  const ALIAS = { 'dunkin.com': 'dunkindonuts.com', 'burgerking.com': 'bk.com', 'chickfila.com': 'chick-fil-a.com', 'pilotcompany.com': 'pilotflyingj.com' };
  const key = ALIAS[domain.replace(/^www\./, '').toLowerCase()] || domain.replace(/^www\./, '').toLowerCase();
  const lib = path.join(ROOT, 'assets/logos', `${key}.png`);
  if (fs.existsSync(lib)) { const file = `${name}.png`; fs.copyFileSync(lib, path.join(dir, file)); return file; }
  let best = null;
  for (const url of [`https://www.${domain.replace(/^www\./, '')}/apple-touch-icon.png`, `https://${domain}/apple-touch-icon.png`, `https://www.google.com/s2/favicons?domain=${domain}&sz=256`]) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, redirect: 'follow', signal: AbortSignal.timeout(12000) });
      if (!res.ok || !/image/.test(res.headers.get('content-type') || '')) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      const m = await sharp(buf).metadata();
      if (m.width >= 96 && (!best || m.width > best.w)) best = { buf, w: m.width };
    } catch {}
  }
  if (!best) { console.log(`  (no sharp logo for ${domain})`); return null; }
  const file = `${name}.png`;
  await sharp(best.buf).resize(480, 480, { fit: 'inside', kernel: 'lanczos3' }).png().toFile(path.join(dir, file));
  return file;
}

async function newsPhoto(p, dir, name) {
  try {
    const res = await fetch(p.url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 20000) return null; // tiny placeholder/logo
    const file = path.join(dir, `${name}.jpg`); fs.writeFileSync(file, buf);
    return { file, credit: p.credit, kind: 'news' };
  } catch { return null; }
}

// deals/upcoming: pick the 6–7 most specific items from the broad search, then search each one by name so every slide can
// say exactly who, what, where, when and how much (the first preview said "participating chains").
async function digDeeper(news, what) {
  const plan = await chat([{ role: 'system', content: `From these headlines, pick the 6–7 most shareable specific ${what}. Reply JSON {"items":[{"name":"…","search":"a Google News search that finds the details"}]}.` },
    { role: 'user', content: news.slice(0, 120).map(n => `- ${n.date ? new Date(n.date).toDateString() : '?'} — ${n.source} — ${n.title}`).join('\n') }]).catch(() => ({ items: [] }));
  const more = [];
  for (const it of (plan.items || []).slice(0, 7)) more.push(...await searchNews(it.search, { days: 14, max: 8 }).catch(() => []));
  news.unshift(...more);
  console.log(`  details: ${(plan.items || []).map(i => i.name).join('; ')} (${more.length} headlines)`);
}

export async function writeCarousel(kind, { topic, preview } = {}) {
  const spec = KINDS[kind];
  if (!spec) throw new Error(`Unknown carousel kind "${kind}" (brief|news|world|feature|upcoming|deals)`);
  let storyPhotos = [];
  const weekday = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })).getDay();
  const feature = kind === 'feature' ? FEATURES[weekday] : null;
  const kicker = feature ? `${feature.name}` : spec.kicker;

  step(`Writing ${kind} carousel${feature ? ` (${feature.name})` : ''}`);
  const news = await fetchNews(spec.feed);
  const extra = [];
  if (topic) {
    // owner's topic: pull topic-specific headlines + any matching data source
    const found = await searchNews(`${topic} Florida`).catch(() => []);
    news.unshift(...found);
    if (/\b(gas|fuel|pump|gallon)\b/i.test(topic)) (await gasFacts().catch(() => [])).forEach(g => extra.push(`EIA GAS PRICE DATA: ${g}`));
    if (/\brent\b/i.test(topic)) (await rentFacts(['Miami', 'Hialeah', 'Fort Lauderdale', '33131', 'Doral', 'West Palm Beach']).catch(() => [])).forEach(r => extra.push(`ZILLOW RENT DATA: ${r}`));
    console.log(`  topic sources: ${found.length} headlines, ${extra.length} data`);
  }
  // brief/world: pick ONE story, then pull every headline about it so the slides can go deep
  if (spec.pick && !topic) {
    // news: add what people are sharing/searching right now (local subreddits, Google Trends Florida) as [TRENDING] signals
    const trending = kind === 'news' ? await fetchViral().catch(() => []) : [];
    if (trending.length) console.log(`  trending: ${trending.length} (${trending.slice(0, 4).map(t => t.title.slice(0, 40)).join('; ')})`);
    const TREND = trending.length ? `\n\nTRENDING RIGHT NOW (what South Florida is sharing and searching; a signal only, not a source):\n${trending.map(t => `- ${t.source}: ${t.title}${t.summary ? ' — ' + t.summary : ''}`).join('\n')}\n\nPrefer a headline story that is ALSO trending above. A trending item with no news headline can be picked only if the searches will find real reporting on it; never a private person, a lost pet, a personal post or an unconfirmed Reddit claim.` : '';
    const choice = await chat([{ role: 'system', content: `Pick ${spec.pick} Return JSON {"story":"one sentence","search":["2–4 Google News searches to find more reporting on that exact story"],"wikipedia":["0–2 exact English Wikipedia titles for background (a country, a conflict, a place)"],"photos":[indexes of headlines marked [PHOTO] that are about this exact story, best first]}` },
      { role: 'user', content: `Headlines:\n${news.map((n, i) => `${i}. ${n.source} — ${n.title}${n.image ? ' [PHOTO]' : ''}${n.summary ? ' — ' + n.summary : ''}`).join('\n')}\n\nAlready posted (pick something else unless there is a big new development):\n${recentPosts(2).map(p => '- ' + [p.cover?.main, p.cover?.highlight].filter(Boolean).join(' ') + ': ' + (p.slides || []).map(x => x.headline).join('; ')).join('\n') || '(none)'}${TREND}` }]);
    console.log(`  story: ${choice.story}`);
    // the outlets' own news photos (mugshots, scenes, people in the story) are what make people stop scrolling
    storyPhotos = (choice.photos || []).map(i => news[i]).filter(n => n?.image).slice(0, 3).map(n => ({ url: n.image, credit: `Photo: ${n.source}` }));
    if (storyPhotos.length) console.log(`  news photos: ${storyPhotos.map(p => p.credit).join(', ')}`);
    const more = [];
    for (const q of (choice.search || []).slice(0, 4)) more.push(...await searchNews(q, { days: 3, max: 15 }).catch(() => []));
    news.splice(0, news.length, ...more, ...news);
    for (const t of (choice.wikipedia || []).slice(0, 2)) { const w = await wikiArticle(t, { chars: 3000 }).catch(() => null); if (w) extra.push(`WIKIPEDIA "${w.title}" (background):\n${w.text}`); }
    topic = `ONE story, in depth: ${choice.story}. Use only headlines about this story.`;
  }
  if (kind === 'deals' && !topic) {
    const qs = ['free food deal this week', "McDonald's deal this week", 'Chick-fil-A free', 'fast food deals this week', 'national food day deals free', 'Miami free giveaway this weekend', 'South Florida food drive this week', 'Feeding South Florida food distribution', 'Miami free event this week', 'Starbucks Dunkin deal this week'];
    const found = [];
    for (const q of qs) found.push(...await searchNews(q, { days: 7, max: 12 }).catch(() => []));
    news.splice(0, news.length, ...found, ...news.slice(0, 15));
    console.log(`  deal sources: ${found.length} headlines`);
    for (const a of await fetchArticles('deals', { chars: 3000 }).catch(() => [])) extra.push(`ARTICLE (${a.source}, ${new Date(a.date).toDateString()}): ${a.title}\n${a.body}`);
    await digDeeper(news, 'deals, freebies, giveaways or food drives (name the chain or organization, e.g. "Krispy Kreme free coffee National Coffee Day")');
  }
  if (kind === 'upcoming' && !topic) {
    // event listings: search the next week's things to do across South Florida
    const qs = ['Miami events this weekend', 'things to do in Miami this week', 'Fort Lauderdale events this weekend', 'Miami concert festival this week', 'South Florida free events this weekend', 'Miami new opening pop-up'];
    const found = [];
    for (const q of qs) found.push(...await searchNews(q, { days: 10, max: 15 }).catch(() => []));
    news.splice(0, news.length, ...found, ...news.slice(0, 20));
    console.log(`  event sources: ${found.length} headlines`);
    for (const a of await fetchArticles('events', { chars: 3000 }).catch(() => [])) extra.push(`ARTICLE (${a.source}, ${new Date(a.date).toDateString()}): ${a.title}\n${a.body}`);
    await digDeeper(news, 'events or openings in South Florida in the next 7 days (name the event and venue, e.g. "Rolling Loud Miami 2026 dates tickets")');
  }
  if (feature?.wiki || feature?.rent) {
    const plan = await chat([{ role: 'system', content: 'Plan the fact sources for a South Florida Instagram carousel. Return JSON {"wikipedia":["up to 4 exact English Wikipedia article titles"],"rent":["up to 6 South Florida city names or 5-digit ZIPs"]}. Only fill "rent" for rent posts.' },
      { role: 'user', content: `Carousel: ${feature.name}\n${topic || feature.ask}\nDon't repeat these recent posts:\n${recentPosts().map(p => '- ' + (p.kicker || '') + ': ' + p.slides.map(x => x.headline).join('; ')).join('\n')}` }]);
    for (const t of (plan.wikipedia || []).slice(0, 4)) { const w = await wikiArticle(t, { chars: 5000 }).catch(() => null); if (w) extra.push(`WIKIPEDIA "${w.title}":\n${w.text}`); }
    if (feature.rent) (await rentFacts(plan.rent?.length ? plan.rent : ['Miami', 'Hialeah', 'Fort Lauderdale', '33131', '33139', 'West Palm Beach']).catch(() => [])).forEach(r => extra.push(`ZILLOW RENT DATA: ${r}`));
    console.log(`  fact sources: ${extra.map(e => e.split(/[:\n]/)[0]).join('; ')}`);
  }
  const recent = recentPosts();
  const ask = [
    topic ? `${spec.pick ? spec.ask + '\n' : ''}The account owner asked for this — follow it: ${topic}` : (feature ? feature.ask : spec.ask),
    kind === 'world' ? 'COVER: the small top line is always "NEWS FROM AROUND THE WORLD" (we add it). Leave "top" empty and make main + highlight + bottom a complete sentence on their own, with its own subject, e.g. main "A NOR\'EASTER PUTS", highlight "50 MILLION", bottom "FROM MAINE TO VIRGINIA IN ITS PATH".' : '',
    'PHOTOS must stop the scroll: ask for striking, dramatic, specific pictures (the actual person, scene, vehicle, building or moment). Optionally, on AT MOST ONE slide or the cover, and only when it adds meaning, add "mark" to draw on the photo: "circle" (point out the key detail), "arrow" (point at it), "x" (something destroyed, cancelled, banned or a public figure who lost/was ousted), or "stamp: WANTED" / "stamp: ON THE RUN" / "stamp: ARRESTED" / "stamp: CLOSED" / "stamp: SOLD OUT" style labels (few words). Be creative but never mark a private person, a victim or a child, and most posts need no mark.',
    `Today (New York): ${new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric' })}`,
    ['deals', 'upcoming'].includes(kind) ? 'LIST POST: ignore the rule that headlines chain with transitions (no "THAT\'S…", "AND…", "SO…"). Each headline names the thing itself, e.g. "DUNKIN\': FREE COFFEE TUESDAY" or "KAROL G POP-UP IN WYNWOOD, OCT. 3–4". Take dates, times, venues and prices from the ARTICLE texts. 5–6 DIFFERENT items: never two slides about the same place, event, restaurant or chain. For a national chain the place is "all locations" or "in the app" (only chains with South Florida locations). Prefer South Florida items; skip online shopping deals (Amazon, shipped items).' : '',
    kind === 'deals' ? `Headlines (date — outlet — headline — summary). Only use deals, freebies and drives that are still valid now or coming up in the next 7 days; skip expired ones:\n${news.map(n => `- ${n.date ? new Date(n.date).toDateString() : '?'} — ${n.source} — ${n.title}${n.summary ? ' — ' + n.summary : ''}`).join('\n')}` :
    kind === 'upcoming' ? `Headlines (date — outlet — headline — summary). Only use events whose date is stated and falls in the next 7 days:\n${news.map(n => `- ${n.date ? new Date(n.date).toDateString() : '?'} — ${n.source} — ${n.title}${n.summary ? ' — ' + n.summary : ''}`).join('\n')}` :
    `Headlines (date — outlet — headline — summary). Only use headlines from the last 3 days about THIS exact event; a search can return an older, similar event (last winter's storm, a past case): ignore those, and if two headlines disagree, leave the detail out:\n${news.map(n => `- ${n.date ? new Date(n.date).toDateString() : '?'} — ${n.source} — ${n.title}${n.summary ? ' — ' + n.summary : ''}`).join('\n')}`,
    extra.length ? `Fact sources:\n\n${extra.join('\n\n')}` : '',
    recent.length ? `Our posts from the last week (don't repeat these unless there's an update — then tag it UPDATE):\n${recent.flatMap(p => p.slides.map(s => `- ${p.date}: ${s.headline}`)).join('\n')}` : '',
  ].filter(Boolean).join('\n\n');

  let post;
  const TRIES = 5;
  for (let attempt = 1; attempt <= TRIES; attempt++) {
    post = await chat([{ role: 'system', content: `${SYSTEM}\n\n${STYLE}\n\n${toneLines()}\n\n${HANDLES_RULE()}` }, { role: 'user', content: `${ask}\n\n${REMINDER}` }]);
    const n = post?.slides?.length || 0;
    const copy = JSON.stringify([post?.caption, ...(post?.slides || []).map(x => [x.headline, x.body])]);
    const tells = [...aiTells(copy), ...memeTells(copy), ...(copy.match(BANNED) || []).slice(0, 1)];
    if (tells.length && attempt < TRIES) { console.log(`  attempt ${attempt}: sounds like AI (${tells.join(' | ')}) — rewriting`); post = null; continue; }
    const incomplete = (post?.slides || []).filter(s => !s?.headline || !s?.body || !s?.photo).length;
    const CONNECT = /^(that|that's|thats|which|and|so|but|because|the reason|for |on top|meanwhile|now|still|plus|this|it|here|what|those|even|then|since|after|as a result)/i;
    const loose = (kind === 'feature' || topic) ? (post?.slides || []).slice(1).filter(x => !CONNECT.test(String(x.headline || '').trim())).length : 0;
    if (loose > 0 && attempt < TRIES) { console.log(`  attempt ${attempt}: ${loose} headlines don't connect — rewriting`); post = null; continue; }
    const listDupes = ['deals', 'upcoming'].includes(kind) ? n - new Set((post?.slides || []).map(x => String(x.headline || '').split(/[:,]| IN | AT /i)[0].trim().toLowerCase())).size : 0;
    if ((listDupes > 0 || (['deals', 'upcoming'].includes(kind) && n < 5)) && attempt < TRIES) { console.log(`  attempt ${attempt}: list needs 5–6 different items (${n} slides, ${listDupes} repeats) — rewriting`); post = null; continue; }
    if (post?.cover?.highlight && post.cover.photo && n >= 3 && n <= 8 && !incomplete) break;
    console.log(`  attempt ${attempt}: bad shape (${n} slides, ${incomplete} incomplete${n ? '' : `, got ${JSON.stringify(post || {}).slice(0, 160)}`}) — retrying`);
    post = null;
  }
  if (!post) throw new Error('Could not write carousel');
  const checked = await chat([{ role: 'system', content: 'You fact-check an Instagram carousel (JSON) against the given headlines and sources. Fix or remove any number, date, name, "tallest/first/biggest" claim or outcome that is not supported. Keep the headline transitions that chain the slides together ("THAT ALSO MEANS…", "WHICH PUTS…"). Remove quirky lists, personification and meme-caption jokes; keep at most one dry, fact-based line per slide; keep it informative. Never mention "sources" in the text. Keep every JSON field and the same structure. Return only the corrected JSON plus "removed": [short notes].' },
    { role: 'user', content: `${ask}\n\nDRAFT:\n${JSON.stringify(post)}\n\n${STYLE}\n${REMINDER}` }]).catch(() => null);
  if (checked?.slides?.length >= 3 && checked.cover?.highlight) {
    if (checked.removed?.length) console.log(`  fact-check fixed: ${checked.removed.join(' | ').slice(0, 400)}`);
    delete checked.removed; post = checked;
  }
  // the cover must read as ONE clear sentence (the owner saw a broken one); a cheap check + fix
  const lines = c => [kind === 'world' ? 'NEWS FROM AROUND THE WORLD:' : c.top, c.main, c.highlight, c.bottom].filter(Boolean).join(' / ');
  const cv = await chat([{ role: 'system', content: 'You check an Instagram carousel cover made of stacked lines. Read them in order as one sentence. If it is not a clear, complete, grammatical sentence with a subject (or starts with a dangling verb like "PUTS"), rewrite main/highlight/bottom (and top, unless it is fixed) so it is, keeping the same facts, all caps, highlight 1–3 words. Reply JSON {"ok": true|false, "top": "", "main": "", "highlight": "", "bottom": ""}.' },
    { role: 'user', content: `${kind === 'world' ? 'The top line is fixed: NEWS FROM AROUND THE WORLD (do not include it in main).\n' : ''}Cover: ${lines(post.cover)}\nFirst slide: ${post.slides?.[0]?.headline}` }]).catch(() => null);
  if (cv && cv.ok === false && cv.main && cv.highlight) {
    console.log(`  cover fixed: "${lines(post.cover)}" → "${lines(cv)}"`);
    Object.assign(post.cover, { ...(kind === 'world' ? {} : { top: cv.top || '' }), main: cv.main, highlight: cv.highlight, bottom: cv.bottom || '' });
  }
  post = sanitize(post);
  post.collaborators = cleanCollabs(post.collaborators);
  const SECTORS = /^(DEALS|EVENTS|ECONOMY|TRAFFIC|WEATHER|REAL ESTATE|CRIME|DEVELOPMENT|TRANSIT|HISTORY|SPORTS|HEALTH|EDUCATION|CITY HALL|WORLD|USA)$/;
  const single = kind === 'feature' || !!topic;
  for (const x of post.slides) {
    if (single && post.sector) x.tag = post.sector;
    if (!SECTORS.test(String(x.tag || '').toUpperCase())) x.tag = post.sector || 'NEWS';
    x.tag = String(x.tag).toUpperCase();
  }
  post.slides = post.slides.slice(0, 7);

  const sources = [...new Set(post.slides.map(s => s.source).filter(Boolean))];
  // max 4 hashtags: 2 of the post's own + #miami #southflorida
  const tags = [...new Set([...(post.hashtags || []).map(t => '#' + String(t).replace(/^#/, '').replace(/\s/g, '')).slice(0, 2), '#miami', '#southflorida'])].slice(0, 4);
  post.igCaption = [
    post.caption,
    sources.length ? `📰 Sources: ${sources.join(', ')}` : '',
    `📍 Got an only-in-Miami moment? Tag ${HANDLE} or DM us to get featured.`,
    tags.join(' '),
  ].filter(Boolean).join('\n\n');
  post.kind = kind;
  post.kicker = kicker;
  post.date = nyDate();
  const hour = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', hour: '2-digit', hour12: false });
  post.id = `${post.date}-${kind}${kind === 'news' ? '-' + hour : ''}${topic && !spec.pick ? '-custom' : ''}${preview ? '-preview' : ''}`;
  const dir = path.join(ROOT, 'posts', post.id);
  fs.mkdirSync(dir, { recursive: true });
  step('Finding photos');
  newPost();
  // world carousels: fixed cover title, lead story's photo behind it (owner's format)
  // world: the story's own hook, with "NEWS FROM AROUND THE WORLD" as the small top line (owner's format)
  if (kind === 'world') Object.assign(post.cover, { top: 'NEWS FROM AROUND THE WORLD', blur: false });
  for (const [i, item] of [post.cover, ...post.slides].entries()) {
    const np = i < storyPhotos.length ? await newsPhoto(storyPhotos[i], dir, i ? `photo-${i}` : 'photo-cover') : null;
    const photo = np || await getPhoto(item.photo, dir, i ? `photo-${i}` : 'photo-cover',
      { context: i ? item.headline : [item.top, item.main, item.highlight, item.bottom].filter(Boolean).join(' '), aiFirst: !ALIVE.includes(kind) });
    if (photo) { item.photoFile = path.basename(photo.file); item.credit = photo.credit; }
    console.log(`  ${i ? '#' + i : 'cover'}: ${photo ? photo.credit : 'no photo'}`);
  }
  // brand/team/org logos on white cards (owner: every slideshow should look alive, like the Coffee Day one)
  for (const [i, item] of post.slides.entries()) if (item.logo) item.logoFile = await getLogo(item.logo, dir, `logo-${i + 1}`);
  post.cover.logoFiles = [];
  for (const [i, d] of (post.cover.logos || []).slice(0, 6).entries()) { const f = await getLogo(d, dir, `logo-c${i}`); if (f) post.cover.logoFiles.push(f); }
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
.chip { display: inline-block; padding: 10px 24px; border-radius: 14px; font-weight: 900; font-size: 32px; margin-left: 14px; }
.count { position: absolute; left: 24px; top: 20px; font-size: 26px; font-weight: 900; background: rgba(0,0,0,.5); padding: 6px 16px; border-radius: 20px; }
.logo { position: absolute; background: #fff; border-radius: 28px; box-shadow: 0 18px 50px rgba(0,0,0,.45); display: flex; align-items: center; justify-content: center; padding: 22px; }
.logo img { width: 100%; height: 100%; object-fit: contain; }
.bgemoji { position: absolute; right: -60px; bottom: 60px; font-size: 420px; opacity: .14; transform: rotate(-12deg); }
`;
const arrow = `<svg width="64" height="24" viewBox="0 0 64 24"><path d="M0 12h58M48 2l12 10-12 10" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const bar = right => `<div class="bar"><span class="brand">getnearapp</span><span class="more">${right}</span></div>`;
// slide themes (owner: every slideshow should look alive): the brand/team color from the writer, else the section's color
const SECTOR_COLORS = { DEALS: '#FF6B1A', EVENTS: '#8A2BE2', SPORTS: '#008E97', CRIME: '#C8102E', WEATHER: '#0A84C6', TRAFFIC: '#E0A100',
  TRANSIT: '#2F9E44', ECONOMY: '#1E9E5A', 'REAL ESTATE': '#B8860B', DEVELOPMENT: '#E8590C', HISTORY: '#8B5A2B', HEALTH: '#E03E7A',
  EDUCATION: '#5F3DC4', 'CITY HALL': '#364FC7', WORLD: '#1C7ED6', USA: '#1C3F94', NEWS: BLUE };
const hexOk = c => /^#[0-9a-f]{6}$/i.test(String(c || ''));
const shade = (hex, f) => '#' + [1, 3, 5].map(i => Math.round(parseInt(hex.slice(i, i + 2), 16) * f).toString(16).padStart(2, '0')).join('');
const themeOf = (s, post) => hexOk(s.color) ? s.color : SECTOR_COLORS[String(s.tag || post?.sector || 'NEWS').toUpperCase()] || BLUE;
// widest size (px) that fits `text` on one line of `width` px in Montserrat Black caps
const fit1 = (text, max, width = 980) => Math.min(max, Math.floor(width / (String(text).length * 0.74 + 0.3)));

function dataUrl(dir, file) {
  if (!file || !fs.existsSync(path.join(dir, file))) return null;
  const ext = path.extname(file).slice(1).replace('jpg', 'jpeg');
  return `data:image/${ext};base64,${fs.readFileSync(path.join(dir, file)).toString('base64')}`;
}

// optional graphic marker on the photo ("mark" on the cover or a slide), used sparingly and only when it adds meaning
const MARK_RED = '#FF2A2A';
const markSVG = (mark, top, h) => {
  if (!mark) return '';
  const box = `position:absolute;left:50%;top:${top}px;width:${h}px;height:${h}px;transform:translateX(-50%)`;
  const stamp = t => `<div style="position:absolute;left:50%;top:${top + h * 0.38}px;transform:translateX(-50%) rotate(-8deg);border:10px solid ${MARK_RED};color:${MARK_RED};font-family:'Montserrat';font-weight:900;font-size:${Math.round(h * 0.17)}px;letter-spacing:4px;padding:6px 26px;background:rgba(0,0,0,.35);white-space:nowrap">${esc(t)}</div>`;
  if (mark === 'x') return `<svg style="${box}" viewBox="0 0 100 100"><path d="M14 14L86 86M86 14L14 86" stroke="${MARK_RED}" stroke-width="10" stroke-linecap="round"/></svg>`;
  if (mark === 'circle') return `<svg style="${box}" viewBox="0 0 100 100"><ellipse cx="50" cy="50" rx="40" ry="34" fill="none" stroke="${MARK_RED}" stroke-width="5"/></svg>`;
  if (mark === 'arrow') return `<svg style="position:absolute;left:12%;top:${top + h * 0.1}px;width:${h * 0.5}px;height:${h * 0.5}px" viewBox="0 0 100 100"><path d="M8 8L70 70M70 70L70 34M70 70L34 70" stroke="${MARK_RED}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`;
  if (/^stamp:/i.test(mark)) return stamp(mark.slice(6).trim().toUpperCase().slice(0, 18));
  return '';
};
function coverHTML(post, dir, h) {
  const c = post.cover; const img = dataUrl(dir, c.photoFile);
  return `
    ${img ? `<div class="bg" style="background-image:url('${img}');${c.blur ? 'filter:blur(26px);transform:scale(1.12)' : ''}"></div>` : `<div class="bg" style="background:radial-gradient(circle at 50% 30%, #2a3a66, #05070d)"></div>`}
    <div class="shade" style="background:linear-gradient(to bottom, rgba(0,0,0,0) 40%, rgba(0,0,0,.3) 56%, rgba(0,0,0,.82) 84%)"></div>
    ${c.blur ? `<div class="caps" style="position:absolute;left:0;right:0;top:${h * 0.22}px;text-align:center;font-size:${h > 1400 ? 300 : 250}px">?</div>` : ''}
    ${img ? markSVG(c.mark, h * 0.08, h * 0.42) : ''}
    ${c.credit && !c.blur ? `<div class="credit">${esc(c.credit)}</div>` : ''}
    ${post.kicker && ALIVE.includes(post.kind) ? `<div style="position:absolute;left:30px;top:24px;background:${BLUE};border-radius:14px;padding:10px 22px;font-weight:900;font-size:30px;letter-spacing:1px">${esc(post.kicker)}</div>` : ''}
    <div style="position:absolute;left:40px;right:40px;bottom:${h > 1400 ? 220 : 150}px;text-align:center">
      ${(c.logoFiles || []).length && ALIVE.includes(post.kind) ? `<div style="display:flex;gap:18px;justify-content:center;margin-bottom:26px">${c.logoFiles.map(f => dataUrl(dir, f)).filter(Boolean).map(u => `<div style="background:#fff;border-radius:18px;width:${c.logoFiles.length > 4 ? 140 : 170}px;height:${c.logoFiles.length > 4 ? 100 : 120}px;padding:12px;display:flex;align-items:center;justify-content:center;box-shadow:0 10px 30px rgba(0,0,0,.4)"><img src="${u}" style="width:100%;height:100%;object-fit:contain"></div>`).join('')}</div>` : ''}
      ${(c.emojis || []).length && !(c.logoFiles || []).length && ALIVE.includes(post.kind) ? `<div style="font-size:64px;margin-bottom:14px;letter-spacing:12px">${c.emojis.slice(0, 4).map(esc).join('')}</div>` : ''}
      ${c.top ? `<div class="caps" style="font-size:${fit1(c.top, 68)}px;margin-bottom:10px">${esc(c.top)}</div>` : ''}
      ${c.main ? `<div class="caps" style="font-size:${fit1(c.main, 104)}px">${esc(c.main)}</div>` : ''}
      <div class="caps blue" style="font-size:${fit1(c.highlight, 168)}px;margin:4px 0">${esc(c.highlight)}</div>
      ${c.bottom ? `<div class="caps" style="font-size:${fit1(c.bottom, 104)}px">${esc(c.bottom)}</div>` : ''}
    </div>
    ${bar(h > 1400 ? `new post on our page ${arrow}` : `swipe for more ${arrow}`)}`;
}

// classic news look (owner likes it for news: easy on the eyes): full photo on top, black below, blue accents
function newsSlideHTML(s, i, n, dir) {
  const img = dataUrl(dir, s.photoFile);
  const hl = String(s.headline || ''); const k = s.highlight ? hl.toLowerCase().indexOf(String(s.highlight).toLowerCase()) : -1;
  const headline = k >= 0 ? `${esc(hl.slice(0, k))}<span class="blue">${esc(hl.slice(k, k + s.highlight.length))}</span>${esc(hl.slice(k + s.highlight.length))}` : esc(hl);
  const size = Math.max(52, Math.min(84, Math.floor(84 * Math.sqrt(48 / Math.max(48, hl.length)))));
  const red = /CRIME|BREAKING|UPDATE/.test(s.tag || '');
  return `
    <div class="bg" style="background:linear-gradient(to bottom, #0e1c3d 860px, #081226 100%)"></div>
    ${img ? `<div class="bg" style="background-image:url('${img}');bottom:auto;height:860px;filter:saturate(1.2) contrast(1.05)"></div>` : `<div class="bg" style="background:radial-gradient(circle at 50% 20%, #2a4a8f, #081226)"></div>`}
    <div class="shade" style="bottom:auto;height:862px;background:linear-gradient(to bottom, rgba(14,28,61,0) 38%, rgba(14,28,61,.6) 60%, rgba(14,28,61,.9) 78%, #0e1c3d 100%)"></div>
    ${img ? markSVG(s.mark, 90, 460) : ''}
    ${s.credit ? `<div class="credit">${esc(s.credit)}</div>` : ''}
    <div style="position:absolute;left:60px;right:60px;bottom:150px">
      <span class="tag" style="background:${red ? '#FF3B3B' : BLUE}">${esc(s.tag || 'NEWS')}</span>
      <div class="caps" style="font-size:${size}px;margin-top:26px">${headline}</div>
      <div style="margin-top:26px;font-size:42px;font-weight:700;line-height:1.32;color:#fff;text-shadow:0 2px 8px rgba(0,0,0,.6)">${esc(s.body)}</div>
      <div style="margin-top:24px;font-size:28px;font-weight:800;color:rgba(255,255,255,.6)">${[s.place ? '📍 ' + esc(s.place) : '', s.source ? 'Source: ' + esc(s.source) : ''].filter(Boolean).join('  ·  ')}</div>
    </div>
    ${bar(i + 1 < n ? `${i + 1}/${n} ${arrow}` : `${i + 1}/${n}`)}`;
}

// two looks (owner): deals / upcoming get the colorful Coffee Day style; news, brief, world, feature keep the classic news look
const ALIVE = ['deals', 'upcoming'];
const slideHTML = (s, i, n, dir, post) => (ALIVE.includes(post?.kind) ? aliveSlideHTML : newsSlideHTML)(s, i, n, dir, post);

function aliveSlideHTML(s, i, n, dir, post) {
  const img = dataUrl(dir, s.photoFile), logo = dataUrl(dir, s.logoFile);
  const theme = themeOf(s, post), accent = '#FFD24A';
  const hl = String(s.headline || ''); const k = s.highlight ? hl.toLowerCase().indexOf(String(s.highlight).toLowerCase()) : -1;
  const headline = k >= 0 ? `${esc(hl.slice(0, k))}<span style="color:${accent}">${esc(hl.slice(k, k + s.highlight.length))}</span>${esc(hl.slice(k + s.highlight.length))}` : esc(hl);
  const size = Math.max(52, Math.min(84, Math.floor(84 * Math.sqrt(48 / Math.max(48, hl.length)))));
  const red = /CRIME|BREAKING|UPDATE/.test(s.tag || '');
  return `
    <div class="bg" style="background:radial-gradient(circle at 50% 75%, ${theme} 0%, ${shade(theme, 0.45)} 60%, ${shade(theme, 0.22)} 100%)"></div>
    ${s.emoji ? `<div class="bgemoji">${esc(s.emoji)}</div>` : ''}
    ${img ? `<div class="bg" style="background-image:url('${img}');bottom:auto;height:700px"></div>` : ''}
    <div class="shade" style="bottom:auto;height:720px;background:linear-gradient(to bottom, rgba(0,0,0,0) 45%, ${shade(theme, 0.45)} 100%)"></div>
    ${img ? markSVG(s.mark, 90, 460) : ''}
    ${s.credit ? `<div class="credit">${esc(s.credit)}</div>` : ''}
    <div class="count">${i + 1}/${n}</div>
    ${logo ? `<div class="logo" style="right:60px;top:540px;width:300px;height:180px">${`<img src="${logo}">`}</div>` : ''}
    <div style="position:absolute;left:60px;right:60px;bottom:150px">
      <span class="tag" style="background:${red ? '#FF3B3B' : '#fff'};color:${red ? '#fff' : shade(theme, 0.6)}">${s.emoji ? esc(s.emoji) + ' ' : ''}${esc(s.tag || 'NEWS')}</span>${s.chip ? `<span class="chip" style="background:${accent};color:#111">${esc(String(s.chip).toUpperCase().slice(0, 18))}</span>` : ''}
      <div class="caps" style="font-size:${size}px;margin-top:26px">${headline}</div>
      <div style="margin-top:26px;font-size:42px;font-weight:700;line-height:1.32;color:#fff;text-shadow:0 2px 8px rgba(0,0,0,.6)">${esc(s.body)}</div>
      <div style="margin-top:24px;font-size:28px;font-weight:800;color:rgba(255,255,255,.7)">${[s.place ? '📍 ' + esc(s.place) : '', s.source ? 'Source: ' + esc(s.source) : ''].filter(Boolean).join('  ·  ')}</div>
    </div>
    ${bar(i + 1 < n ? `${i + 1}/${n} ${arrow}` : `${i + 1}/${n}`)}`;
}

function ctaHTML(post, dir) {
  const img = dataUrl(dir, post.cover.photoFile);
  return `
    ${ALIVE.includes(post.kind) ? `<div class="bg" style="background:radial-gradient(circle at 50% 30%, #3d86ff 0%, ${BLUE} 45%, #0b3fb3 100%)"></div>
    <div class="bgemoji" style="opacity:.12">📍</div>` : img ? `<div class="bg" style="background-image:url('${img}');filter:blur(30px) brightness(.6) saturate(1.2);transform:scale(1.15)"></div>` : ''}
    <div style="position:absolute;left:60px;right:60px;top:300px;text-align:center">
      <div style="font-size:150px">📍</div>
      <div class="caps" style="font-size:120px;margin-top:20px">STAY <span style="color:#FFD24A">NEAR.</span></div>
      <div style="margin-top:40px;font-size:42px;font-weight:700;line-height:1.35">Follow <b style="font-weight:900;color:#FFD24A">@getnearapp</b> for what South Florida is actually talking about.</div>
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
    for (let i = 0; i < n; i++) slides.push(await shoot(slideHTML(post.slides[i], i, n, dir, post), path.join(dir, `${String(i + 1).padStart(2, '0')}.jpg`), 1350));
    slides.push(await shoot(ctaHTML(post, dir), path.join(dir, '99-cta.jpg'), 1350));
    const story = await shoot(coverHTML(post, dir, 1920), path.join(dir, 'story.jpg'), 1920);
    return { post, slides, story };
  } finally {
    await browser.close();
  }
}

async function chat(messages) {
  // Low reasoning effort keeps it well under Node's 5-min header timeout; retry network hiccups.
  let effort = 'low';
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-5.5', response_format: { type: 'json_object' }, messages,
          ...(effort ? { reasoning_effort: effort } : {}) }),
      });
      if (res.status === 400 && effort) { const t = await res.text(); if (/reasoning/i.test(t)) { effort = null; attempt--; continue; } throw new Error(`OpenAI 400: ${t}`); }
      if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
      return JSON.parse((await res.json()).choices[0].message.content);
    } catch (e) {
      if (attempt === 3) throw e;
      console.log(`  (OpenAI attempt ${attempt} failed: ${e.message.slice(0, 120)} — retrying)`);
    }
  }
}

async function tiktokWorthy(post, kind) {
  const control = readJSON(path.join(ROOT, 'control.json'));
  const cap = control.tiktokSlideshowsPerDay ?? 3;
  const log = fs.existsSync(path.join(ROOT, 'posted.log')) ? fs.readFileSync(path.join(ROOT, 'posted.log'), 'utf8') : '';
  const today = log.split('\n').filter(l => l.includes(`tiktok:${post.date}-`)).length; // slideshows already sent today
  if (today >= cap) return console.log(`  (TikTok: already ${today} slideshows today)`), false;
  if (kind === 'upcoming' || kind === 'deals') return true;
  if (kind === 'world') return false;
  const r = await chat([{ role: 'system', content: 'Rate 1–10 how well this South Florida carousel would do on TikTok with 18–35 year olds in Miami. High: things happening now or coming up that people can go to, and genuinely viral stories people share and argue about (a wild video, a shocking local moment, a celebrity in Miami, a huge price shock). Low: politics, court procedure, routine crime, world news, dry data. Reply JSON {"score": n, "why": "short"}.' },
    { role: 'user', content: JSON.stringify({ cover: post.cover, slides: post.slides.map(x => x.headline) }) }]).catch(() => ({ score: 0 }));
  console.log(`  TikTok score ${r.score}/10: ${r.why || ''}`);
  return Number(r.score) >= (control.tiktokMinScore ?? 6);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  if (args.includes('--ai-photos')) process.env.AI_PHOTOS = '1';
  const topicArg = args.includes('--topic') ? args[args.indexOf('--topic') + 1] : null;
  const kind = args.find(a => !a.startsWith('--') && a !== topicArg) || 'brief';
  const ti = args.indexOf('--topic');
  const dir = args.includes('--render-only') ? path.resolve(ROOT, args[args.indexOf('--render-only') + 1])
    : await writeCarousel(kind, { topic: ti >= 0 ? args[ti + 1] : null, preview: args.includes('--dry-run') });
  const { post, slides, story } = await renderCarousel(dir);
  if (args.includes('--dry-run') || args.includes('--render-only')) console.log(`(dry run) ${slides.length} slides in ${path.relative(ROOT, dir)}`);
  else {
    // never post a blank carousel (owner archived one): the cover and most slides must have a picture
    const withPhoto = post.slides.filter(x => x.photoFile).length;
    if (!post.cover.photoFile || withPhoto < Math.ceil(post.slides.length / 2)) {
      console.log(`✖ Not posting: ${post.cover.photoFile ? '' : 'no cover photo, '}${withPhoto}/${post.slides.length} slides have photos`);
      process.exit(1);
    }
    const { publishCarousel, publishStory } = await import('./publish.mjs');
    await publishCarousel(slides, post.igCaption, post.id, { collaborators: post.collaborators });
    await publishStory(story, post.id).catch(e => console.log(`(story skipped: ${e.message})`));
    // TikTok (owner): only upcoming things and very viral stories. Upcoming carousels always go; others are rated and only
    // strong ones go, at most control.json tiktokSlideshowsPerDay (default 3) a day, as Buffer reminders (owner adds music).
    if (await tiktokWorthy(post, kind)) {
      const { postToTikTok } = await import('./buffer.mjs');
      await postToTikTok({ images: slides, text: post.igCaption, label: post.id, ai: [post.cover, ...post.slides].some(x => /^AI /.test(x?.credit || '')) });
    }
  }
}
