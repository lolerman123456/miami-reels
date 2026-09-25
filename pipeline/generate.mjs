// Write the next map Reel: an informational South Florida explainer (no jokes, no fake rankings).
// 1. plan  — pick a topic + which sources to pull (news, Wikipedia articles, Zillow rent data)
// 2. write — a script that may ONLY use facts from those sources, with exact coordinates for each place
// 3. check — a fact-checker removes any number/claim not in the sources
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, readJSON, writeJSON } from './util.mjs';
import { fetchNews } from './news.mjs';
import { wikiArticle, rentFacts } from './facts.mjs';
import { STYLE, REMINDER, toneLines, sanitize, memeTells } from './style.mjs';

const FORMATS = `FORMATS (pick the one that fits the best available material):
- NEW BUILD: something being built, approved or opening in South Florida (tallest towers, stadiums, stations, bridges, big
  projects). What it is, where, how tall/big/expensive, when it opens, what was there before, what it changes.
- HISTORY: the real story of one place (a landmark, island, building, neighborhood, road). How it started, key moments, what it is now.
- DID YOU KNOW: 4–5 genuinely surprising facts about one city, neighborhood or landmark.
- RENT CHECK: what typical rent costs right now in 4–5 South Florida cities/ZIPs vs a year ago, 5 years ago and 2015 (Zillow data).
- BY THE NUMBERS: one big place or system (PortMiami, MIA, Brightline, the Everglades, I-95, a stadium) told through its numbers.`;

const NARRATOR = `WHO IS TALKING
A South Florida local who knows a lot about the area, talking to camera like a good explainer video. Clear, calm,
conversational, informative. No roasting, no hype, no meme jokes. Interesting, specific information said normally, with the
occasional dry line that comes straight out of a fact.

HOW IT SOUNDS
- Plain spoken English, contractions, normal sentences. Like explaining something cool to a friend.
- Go in depth: every scene gives real substance — a number, a date, a name, a before/after, a comparison that makes the number
  feel real ("that's taller than anything in Florida", "that's about seven hundred dollars more than five years ago").
- Flow like a story: context → the interesting fact → why it matters or what it means for people who live here.
- HOOK (first 3 seconds): the single most surprising real fact or a direct question, e.g. "This tower going up in downtown Miami
  is about to be the tallest building in Florida." / "Rent in Brickell is up over fourteen hundred dollars since 2015."
- Outro: a real question people will answer in the comments (would you live there, did you know this, what should we cover next).

FACTS — THE MOST IMPORTANT RULE
- Use ONLY facts that appear in the SOURCES you're given. Never invent a number, date, height, price, name or quote.
- If a source says "about" or "planned", keep that wording. If you're not sure, leave it out.
- Never mention "sources" in the script; state facts plainly like a person who knows them.
- Numbers are spoken as words in "text" ("one thousand forty-nine feet", "three thousand eight hundred dollars a month").

BANNED — sounds like AI: "It's not X, it's Y", "That's not X, that's Y", "If not X, then Y", "X isn't just Y",
"The result? …", "Here's the thing", "Let's be real", "Picture this", "Imagine", "Welcome to", "Plot twist", em-dashes,
triples, neat morals, and these words: vibes, iconic, hidden gem, paradise, bustling, nestled, "in the heart of", game-changer,
"a testament to", "boasts", "stands as", literally, absolutely, ultimate.`;

const FORMAT = `FORMAT
- Scenes: hook, then 3–5 "item" scenes (each one place or one fact, NO ranks, never say "number one"), then outro.
- LENGTH: 140–190 spoken words total (≈55–70 seconds). Hook 12–22 words. Items 25–45 words each. Outro 8–16 words.
- "text" = exactly what the narrator says. "caption" = same line for the screen (digits, $, ft). Include caption when they differ.
- On-screen: "overlay" = place name in caps (≤18 chars). "badge" = the key stat for that scene, ≤14 chars
  ("1,049 FT", "$3,831/MO", "OPENS 2028", "BUILT 1925", "+61% SINCE '15"). "sub" = ≤26-char line of context.

LOCATIONS: real Florida spots (South Florida preferred). When a source gives coordinates for a place, use EXACTLY those. Otherwise give the accurate
lat/lon of the exact building/landmark. h = aim height in meters (towers 60–150, low areas 5–20).

SHOTS: type is dive (hook only), orbit, push, zoomin, pullout (outro only). range: 500–900 low-rise/beaches,
1400–1800 high-rise skylines (Brickell, Downtown, Sunny Isles, Fort Lauderdale beach — closer puts the camera inside buildings),
1500–2500 wide areas/highways. pitch -25 to -40 (-32 or steeper near skyscrapers). Vary heading 0–359. Orbit: add degrees (50–120) and dir (1 or -1).

OUTPUT strictly this JSON:
{
  "title": "…",
  "sources": ["outlet or Wikipedia article or 'Zillow Observed Rent Index'", …],
  "igCaption": "2–4 informative lines with the most interesting facts, a question for the comments, then 10–14 hashtags",
  "scenes": [
    { "kind": "hook", "text": "…", "overlay": ["LINE 1 ≤18 chars", "LINE 2 ≤18 chars"], "emojis": ["4 emojis"],
      "location": {"name": "…", "lat": 0, "lon": 0, "h": 0}, "shot": {"type": "dive", "range": 1600, "pitch": -32, "heading": 200} },
    { "kind": "item", "text": "…", "caption": "…", "overlay": "PLACE", "badge": "KEY STAT", "sub": "…", "emoji": "1 emoji",
      "location": {…}, "shot": {…} },
    …,
    { "kind": "outro", "text": "…", "overlay": "SHORT CTA + EMOJI", "sub": "…", "location": {…}, "shot": {"type": "pullout", …} }
  ]
}`;

const CHECKER = `You are a fact-checker for a short informational video. You get SOURCES and a draft script (JSON).
For every claim in "text", "caption", "badge", "sub", "overlay" and "igCaption" — especially every number, date, height, price,
ranking ("tallest", "first", "biggest") and name — confirm it is supported by the SOURCES.
- Supported: keep it (match the source's exact number; keep hedges like "about", "planned", "expected").
- Not supported or contradicted: fix it to what the source says, or remove it and smooth the sentence.
- NEVER mention sources, "sourced", "these sources", "based on", "according to the data" in text/caption — the viewer never sees the sources. Just state the fact plainly, or cut it.
- Keep the voice normal and conversational; cut quirky lists or personification jokes; one dry fact-based line is fine. Keep all JSON fields, locations and shots. Keep 140–190 spoken words.
Return ONLY the corrected JSON, plus a field "removed": ["short notes of anything you had to fix or cut"].`;

// AI-sounding sentence shapes (checked on the spoken script; any hit → rewrite). Also used by carousel.mjs.
const AI_TELLS = [
  /\b(it|that|this)(['’]s| is) not\b[^.!?]{0,60}[,;—-]\s*(it|that|this)(['’]s| is)\b/i,
  /\b(it|that|this)(['’]s| is)n['’]t\b[^.!?]{0,60}[,;—-]\s*(it|that|this)(['’]s| is)\b/i,
  /\bisn['’]t just\b/i, /\bif not\b[^.!?]{0,40},\s*then\b/i, /\bnot because\b[^.!?]{0,60}\bbut because\b/i,
  /\bless \w+[^.!?]{0,30}\bmore \w+/i, /\b(the (result|catch|worst part|best part|twist))\?/i,
  /\b(plot twist|spoiler|one word|picture this|here['’]s the thing|let['’]s be (real|honest)|welcome to|and honestly\?)/i, /—/,
];
export const aiTells = text => AI_TELLS.filter(r => r.test(text)).map(r => (text.match(r) || [''])[0]);

export const BANNED = /\b(vibes?|iconic|hidden gem|paradise|bustling|nestled|in the heart of|whether you're|let's dive|buckle up|faint of heart|it's giving|main character|npcs?|emotional damage|lives rent free|chaos|chaotic|unhinged|hits different|literally|absolutely|ultimate|real mvp|let that sink in|no cap|game[- ]changer|a testament to|boasts|stands as)\b/i;

export async function generateEpisode({ topic } = {}) {
  const epRoot = path.join(ROOT, 'episodes');
  const existing = fs.existsSync(epRoot) ? fs.readdirSync(epRoot).filter(d => fs.existsSync(path.join(epRoot, d, 'episode.json'))).sort() : [];
  const past = existing.map(d => readJSON(path.join(epRoot, d, 'episode.json')).title);
  const num = String(Math.max(0, ...existing.map(d => parseInt(d, 10) || 0)) + 1).padStart(3, '0');

  // 1. plan
  const news = await fetchNews('local', { hours: 72, max: 80 }).catch(() => []);
  const plan = await chat([{ role: 'system', content: `You plan informational Instagram Reels for @getnearapp, a South Florida account.\n\n${FORMATS}\n\n` +
    'Pick ONE topic people in South Florida will find genuinely interesting and share. Prefer a fresh news hook (a new tower, project, opening, ' +
    'price change) when the headlines have one; otherwise pick an evergreen HISTORY / DID YOU KNOW / RENT CHECK / BY THE NUMBERS topic. ' +
    'Don\'t repeat past videos. Return JSON: {"format":"…","angle":"one sentence","wikipedia":["up to 5 exact English Wikipedia article titles to pull facts from"],' +
    '"rent":["up to 6 South Florida city names or 5-digit ZIPs for Zillow rent data, only for rent topics"],"news":[indexes of the relevant headlines]}' },
    { role: 'user', content: `Today: ${new Date().toDateString()}\n${topic ? `The account owner asked for: ${topic}\n` : ''}` +
      `Past videos:\n${past.map(t => '- ' + t).join('\n') || '(none)'}\n\nRecent South Florida headlines:\n${news.map((n, i) => `${i}. ${n.source} — ${n.title}${n.summary ? ' — ' + n.summary : ''}`).join('\n')}` }]);
  console.log(`  plan: [${plan.format}] ${plan.angle}`);

  // 2. gather sources
  const sources = [];
  for (const i of plan.news || []) if (news[i]) sources.push(`NEWS (${news[i].source}, ${new Date(news[i].date).toDateString()}): ${news[i].title}${news[i].summary ? ' — ' + news[i].summary : ''}`);
  for (const t of (plan.wikipedia || []).slice(0, 5)) {
    const w = await wikiArticle(t).catch(e => { console.log(`  (wikipedia "${t}": ${e.message})`); return null; });
    if (w) sources.push(`WIKIPEDIA "${w.title}"${w.lat ? ` — coordinates ${w.lat}, ${w.lon}` : ''}:\n${w.text}`);
  }
  if (plan.rent?.length) (await rentFacts(plan.rent).catch(e => { console.log(`  (rent data: ${e.message})`); return []; })).forEach(r => sources.push(`RENT DATA: ${r}`));
  console.log(`  sources: ${sources.length} (${sources.map(s => s.split(/[:\n]/)[0]).join('; ').slice(0, 300)})`);
  if (!sources.length) throw new Error('No sources found for the planned topic');
  const SOURCES = `SOURCES (the only facts you may use):\n\n${sources.join('\n\n')}`;

  // 3. write → fact-check, retry on AI-sounding copy or bad length
  let episode;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const draft = await chat([{ role: 'system', content: `${NARRATOR}\n\n${STYLE}\n\n${toneLines()}\n\n${FORMAT}` },
      { role: 'user', content: `Format: ${plan.format}\nAngle: ${plan.angle}\n${topic ? `Owner's request: ${topic}\n` : ''}\n${SOURCES}\n\nWrite the episode.\n${REMINDER}` }]);
    episode = sanitize(await chat([{ role: 'system', content: `${CHECKER}\n\n${STYLE}` }, { role: 'user', content: `${SOURCES}\n\nDRAFT:\n${JSON.stringify(draft)}\n\n${REMINDER}` }]));
    if (episode.removed?.length) console.log(`  fact-check fixed: ${episode.removed.join(' | ').slice(0, 400)}`);
    const spoken = (episode.scenes || []).map(s => s.text).join(' ');
    const words = spoken.split(/\s+/).length;
    try { validate(episode); } catch (e) { console.log(`  attempt ${attempt}: ${e.message}`); continue; }
    const bad = spoken.match(BANNED) || spoken.match(/\b(sourced|these sources|the sources|based on (the|these) (sources|data))\b/i); const tells = [...aiTells(spoken), ...memeTells(spoken)];
    if ((bad || tells.length) && attempt < 3) { console.log(`  attempt ${attempt}: sounds like AI (${[bad?.[0], ...tells].filter(Boolean).join(' | ')}) — rewriting`); continue; }
    if ((words < 120 || words > 210) && attempt < 3) { console.log(`  attempt ${attempt}: ${words} words — rewriting`); continue; }
    console.log(`  script: ${words} words`);
    break;
  }
  // last resort: park any scene with a bad location on the nearest good one instead of failing the run
  const good = episode.scenes?.find(s => inFlorida(s.location));
  if (good) for (const s of episode.scenes) if (!inFlorida(s.location)) { console.log(`  (moved "${s.location?.name}" camera to ${good.location.name})`); s.location = { ...good.location }; }
  validate(episode);
  delete episode.removed;
  for (const s of episode.scenes) delete s.rank;
  episode.format = plan.format;
  const credit = (episode.sources || []).length ? `\n\nSources: ${episode.sources.join(', ')}` : '';
  const cap = episode.igCaption || ''; const h = cap.search(/(^|\s)#\w/);
  episode.igCaption = h >= 0 ? `${cap.slice(0, h).trim()}${credit}\n\n${cap.slice(h).trim()}` : cap + credit;

  const slug = episode.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  episode.id = `${num}-${slug}`;
  const dir = path.join(epRoot, episode.id);
  writeJSON(path.join(dir, 'episode.json'), episode);
  console.log(`✔ New episode: ${episode.title} → ${path.relative(ROOT, dir)}`);
  for (const s of episode.scenes) console.log(`   ${s.kind}${s.badge ? ' [' + s.badge + ']' : ''}: ${s.text}`);
  return dir;
}

async function chat(messages) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-5.5', response_format: { type: 'json_object' }, messages }),
      });
      if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
      return JSON.parse((await res.json()).choices[0].message.content);
    } catch (e) {
      if (attempt >= 3) throw e;
      console.log(`  (OpenAI attempt ${attempt} failed: ${e.message.slice(0, 120)} — retrying)`);
    }
  }
}

const inFlorida = l => l && l.lat > 24.3 && l.lat < 31.1 && l.lon > -87.7 && l.lon < -79.8;

function validate(ep) {
  if (!ep?.title || !Array.isArray(ep.scenes) || ep.scenes.length < 4) throw new Error('Bad episode: ' + JSON.stringify(ep).slice(0, 300));
  for (const s of ep.scenes) {
    const { lat, lon } = s.location || {};
    if (!inFlorida(s.location)) throw new Error(`Location outside Florida: ${JSON.stringify(s.location)}`);
    if (!s.text || !s.shot?.type) throw new Error('Scene missing text/shot: ' + JSON.stringify(s));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const i = process.argv.indexOf('--topic');
  await generateEpisode({ topic: i > 0 ? process.argv[i + 1] : null });
}
