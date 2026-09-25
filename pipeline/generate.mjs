// Write the next episode: concept + script + labels + camera shots, as episode.json
// Two passes: a draft, then a harsh editor pass that kills anything generic or AI-sounding.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, readJSON, writeJSON } from './util.mjs';
import { fetchLocalTalk, ownerLines } from './locals.mjs';

const VOICE = `WHO IS TALKING
You are a born-and-raised Miami local with a big mouth, recording a voiceover on your phone. You've sat in traffic on the
Palmetto at 5:40pm, waited 25 minutes for a ventanita cafecito, paid $40 to park in South Beach, watched someone parallel
park a Lambo into a hydrant. You talk like a person, not a brand. Natural rhythm, contractions, you interrupt yourself, you go on little tangents.
You say "bro", "I swear", "no, seriously", "I'm not even joking" — sparingly, when it lands.

COMEDIC STYLE (most important): think Shane Gillis. Borrow HOW he's funny, never his actual jokes or his edgy/racial material.
- Laid-back and conversational, like telling a buddy a story at the bar. Unhurried. He's not performing, he's just talking.
- NOT rapid-fire one-liners. Each place gets ONE bit that builds: start from a real, mundane observation, then commit to it
  and take it further and further (2–3 escalations, often into a specific little scenario or "imagine the guy who…" run),
  then end on a flat, understated button. The laugh comes from committing to the bit, not from a zinger.
- Everyman who's part of the problem: self-deprecating, a little dumb on purpose ("I don't know, man"), admits when
  something's actually kind of great, clearly LOVES the place he's roasting ("and I love it. I'd die for that Publix.").
- Quick act-outs of a TYPE of person by what they do and say (the valet guy, the HOA lady, the guy in the lifted F-150):
  "and the valet guy goes, 'Thirty dollars.' Thirty dollars, bro. For you to drive it forty feet." Never mimic accents.
- Doesn't announce jokes, no "you won't believe", no winking. Honest asides ("which, fair", "that's not even a joke,
  that happened to me"). Obsessive about tiny specific details.

WHAT MAKES IT NOT GENERIC
- Every item needs ONE hyper-specific, real detail a local would recognize: a street, exit, intersection, store, bridge,
  parking garage, time of day, price, sound, smell. e.g. "the Publix on Alton Road at 6pm", "the 836 merge by the airport",
  "the Brickell Avenue bridge going up while you're late", "Dadeland Mall parking lot on a Saturday", "the Las Olas valet line".
- Tell it like something that happened: "I watched a guy…", "my cousin got…", "last Sunday I…", "you ever…".
  Then twist it into a punchline. Mini-story > description.
- Numbers make it feel real: "$19 for a smoothie", "three lanes, no signal", "forty-five minutes to go four miles".
  (Hot takes can be loosely based on real surveys/stats, but NEVER say "studies show" or cite anything.)
- Escalate: each item worse than the last. #1 gets the longest, most committed bit.

CLARITY: every sentence must make sense heard ONCE at speed. Normal grammar, plain words. Clever-but-confusing = cut.

RETENTION (people scroll in 1.5 seconds)
- HOOK (first 3 seconds): an accusation, confession or controversial claim aimed at the viewer or a specific area.
  Good: "If you live in Kendall, this video is about you and I'm not sorry." / "I lived in all five of these. Number one ruined my life."
  Bad: "Here are the top 5…" / "South Florida is wild" / anything that sounds like a listicle title.
- Open a loop in the hook that only #1 closes ("number one is gonna get me cursed out").
- RE-HOOK: right before #1, one short line that snaps attention back:
  "Okay but number two is actually illegal." / "Stay for number one, I'm dead serious." / "This next one got me blocked by my aunt."
- Outro: a question that forces a comment — picking sides, naming a place, tagging someone. Never "like and subscribe".

BANNED (instant rewrite if any appear): vibes, iconic, hidden gem, paradise, bustling, nestled, "in the heart of",
"where X meets Y", "whether you're", "let's dive", "buckle up", "not for the faint of heart", "a whole different",
"it's giving", "main character", NPC, "emotional damage", "treat X like Y", "lives rent free", chaos/chaotic, unhinged,
"hits different", "literally", "absolutely", "ultimate", "the real MVP", "we need to talk about", "let that sink in",
"no cap", rhetorical triple adjectives, and any sentence that could be about any city (if you could swap "Miami" for
"Phoenix" and it still works, it's too generic — rewrite it).

SOUNDS LIKE AI (banned sentence SHAPES — people don't talk like this):
- Contrast framing: "It's not X, it's Y." / "That's not X, that's Y." / "If not X, then Y." / "X isn't just Y, it's Z." /
  "Not because X, but because Y." / "Less X, more Y." / "X? No. Y." — say the Y part straight, or make it a real joke.
- Set-up-and-answer: "The result? …" "The worst part? …" "The catch? …" "Plot twist:" "Spoiler:" "One word:".
- Openers: "Picture this", "Imagine", "Here's the thing", "Let's be real/honest", "Welcome to", "And honestly?".
- Triples ("loud, proud and broke"), em-dashes, ending an item on a moral or a neat summary.
HOW REAL PEOPLE ARE FUNNY: a specific thing you actually saw + one exaggeration, said flat. Understatement. Petty
complaints taken way too seriously. Callbacks to an earlier item. Talking to one friend, not an audience.
  e.g. "The light at Coral Way and 27th has been red since 2019. I've aged in that turn lane."
  e.g. "My cousin moved to Doral for the schools. Now he sits on the 836 for forty minutes to get to a Chipotle."
  e.g. "Valet on Las Olas wanted thirty dollars. My car is worth forty."

SAFETY: roast places, prices, traffic, habits, HOAs, clubs, tourists, weather — never ethnic groups, nationalities,
religions, races, or real private individuals. No slurs, nothing sexual. Satire, not hate.`;

const FORMAT = `FORMAT
- Top 3 countdown (#3 → #1) — fewer places, deeper bits. "Ranking three neighborhoods by…" / "X vs Y" framings are fine.
- Each item line MUST start with "Number three," / "Number two," and the last with "And number one...".
- LENGTH: 160–200 spoken words total (≈60–70 seconds). Hook 12–22 words. Items 40–55 words each (observation → escalate
  2–3 times → understated button; #1 the longest). Outro 8–14 words.
- "text" is exactly what the narrator says (write numbers/symbols as words: "nineteen dollars", "I ninety-five").
  "caption" is the same line as it should appear on screen (digits, $, I-95). Always include caption when they differ.
- On-screen: "overlay" = place name in caps. "sub" = ≤24-char gut-punch tagline (not a summary — a jab).
  "alert" (optional, use on one or two items, one of them #1) = ≤18-char red banner that slams in, e.g. "THIS ONE'S ILLEGAL 🚨", "I GOT BLOCKED 💀".

LOCATIONS: only real South Florida places (Miami-Dade, Broward, Palm Beach, Keys) with ACCURATE lat/lon of the exact spot
you mention (the actual intersection, mall, bridge, beach). h = aim height above ground in meters (towers 60–120, low areas 5–20).

SHOTS: type is dive (hook only), orbit, push, zoomin, pullout (outro only). range: 500–900 low-rise/beaches,
1400–1800 high-rise skylines (Brickell, Downtown, Sunny Isles, Fort Lauderdale beach — closer puts the camera inside buildings),
1500–2500 wide areas/highways. pitch -25 to -40 (-32 or steeper near skyscrapers). Vary heading 0–359. Orbit: add degrees (50–120) and dir (1 or -1).

OUTPUT strictly this JSON:
{
  "title": "…",
  "igCaption": "2–3 punchy lines in the same voice, a question that forces a comment, '(satire)', then 10–14 hashtags",
  "scenes": [
    { "kind": "hook", "text": "…", "overlay": ["LINE 1 ≤18 chars", "LINE 2 ≤18 chars"], "emojis": ["4 emojis"],
      "location": {"name": "…", "lat": 0, "lon": 0, "h": 0}, "shot": {"type": "dive", "range": 1600, "pitch": -32, "heading": 200} },
    { "kind": "item", "rank": 3, "text": "…", "caption": "…", "overlay": "PLACE", "sub": "…", "emoji": "1 emoji", "alert": "optional",
      "location": {…}, "shot": {…} },
    … #2, #1 …,
    { "kind": "outro", "text": "…", "overlay": "SHORT CTA + EMOJI", "sub": "…", "location": {…}, "shot": {"type": "pullout", …} }
  ]
}`;

const EDITOR = `You are a ruthless short-form video editor. You get a draft Reel script (JSON). Rewrite it so it sounds like a real,
funny Miami local — not AI. Go line by line:
1. Delete every banned phrase and every sentence that could be about any other city. Replace with a specific local detail.
2. Every item must be ONE committed bit: a concrete detail (street/exit/store/price/time) → escalates 2–3 times → flat
   understated button. If an item is a string of one-liners or zingers, rewrite it into one bit that builds. Keep it laid-back.
3. The hook must stop a thumb in 1.5 seconds: an accusation, confession or controversial claim. Open a loop only #1 closes.
4. Make sure there's a short re-hook right before #1. #1 gets the longest, most committed bit.
5. Read it out loud in your head: it should sound like a guy talking, not a writer. Natural rhythm (a longer storytelling
   sentence is fine), contractions, no filler. No listicle voice, no zinger after every sentence.
   CLARITY BEATS CLEVER: a 14-year-old must get every sentence on first listen. Plain words, normal grammar, no weird
   metaphors, no word salad, no fragments that only make sense on paper. If a joke needs explaining, cut it.
6. Keep all JSON fields, lat/lon, shots, and the length rules (160–200 spoken words, 3 items). Keep text/caption in sync.
Return ONLY the corrected JSON.

${VOICE}

${FORMAT}`;

// AI-sounding sentence shapes (checked on the spoken script; any hit → rewrite)
const AI_TELLS = [
  /\b(it|that|this)(['’]s| is) not\b[^.!?]{0,60}[,;—-]\s*(it|that|this)(['’]s| is)\b/i,
  /\b(it|that|this)(['’]s| is)n['’]t\b[^.!?]{0,60}[,;—-]\s*(it|that|this)(['’]s| is)\b/i,
  /\bisn['’]t just\b/i, /\bif not\b[^.!?]{0,40},\s*then\b/i, /\bnot because\b[^.!?]{0,60}\bbut because\b/i,
  /\bless \w+[^.!?]{0,30}\bmore \w+/i, /\b(the (result|catch|worst part|best part|twist))\?/i,
  /\b(plot twist|spoiler|one word|picture this|here['’]s the thing|let['’]s be (real|honest)|welcome to|and honestly\?)/i, /—/,
];
export const aiTells = text => AI_TELLS.filter(r => r.test(text)).map(r => (text.match(r) || [''])[0]);

export const BANNED = /\b(vibes?|iconic|hidden gem|paradise|bustling|nestled|in the heart of|whether you're|let's dive|buckle up|faint of heart|it's giving|main character|npcs?|emotional damage|lives rent free|chaos|chaotic|unhinged|hits different|literally|absolutely|ultimate|real mvp|let that sink in|no cap)\b/i;

export async function generateEpisode({ topic } = {}) {
  const epRoot = path.join(ROOT, 'episodes');
  const existing = fs.existsSync(epRoot) ? fs.readdirSync(epRoot).filter(d => fs.existsSync(path.join(epRoot, d, 'episode.json'))).sort() : [];
  const past = existing.map(d => readJSON(path.join(epRoot, d, 'episode.json')).title);
  const num = String(existing.length + 1).padStart(3, '0');

  const talk = await fetchLocalTalk().catch(() => []);
  const mine = ownerLines();
  const ask = `Today is ${new Date().toDateString()}. Past videos (don't repeat the concept or the same places as #1):\n${past.map(t => '- ' + t).join('\n') || '(none)'}\n\n` +
    (topic ? `Today's topic/angle from the account owner — follow it: ${topic}\n\n` : 'Pick a concept that will start fights in the comments.\n\n') +
    (talk.length ? `What real locals posted this week (raw material: steal the frustrations and the way they talk, never copy
a post word for word, never mention Reddit or users; skip politics, immigration, religion, and anything about a private person):\n${talk.map(t => '- ' + t).join('\n')}\n\n` : '') +
    (mine.length ? `Lines the account owner wrote — this is the voice to match:\n${mine.map(t => '- ' + t).join('\n')}\n\n` : '') +
    'Write the episode.';

  let episode;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const draft = await chat([{ role: 'system', content: `${VOICE}\n\n${FORMAT}` }, { role: 'user', content: ask }]);
    episode = await chat([{ role: 'system', content: EDITOR }, { role: 'user', content: JSON.stringify(draft) }]);
    const spoken = episode.scenes.map(s => s.text).join(' ');
    const bad = spoken.match(BANNED);
    const words = spoken.split(/\s+/).length;
    try { validate(episode); } catch (e) { console.log(`  attempt ${attempt}: ${e.message}`); continue; }
    if (bad) { console.log(`  attempt ${attempt}: banned phrase "${bad[0]}" — rewriting`); continue; }
    const tells = aiTells(spoken);
    if (tells.length && attempt < 3) { console.log(`  attempt ${attempt}: sounds like AI (${tells.join(' | ')}) — rewriting`); continue; }
    if (words < 140 || words > 220) { console.log(`  attempt ${attempt}: ${words} words — rewriting`); continue; }
    console.log(`  script: ${words} words`);
    break;
  }
  validate(episode);

  const slug = episode.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  episode.id = `${num}-${slug}`;
  const dir = path.join(epRoot, episode.id);
  writeJSON(path.join(dir, 'episode.json'), episode);
  console.log(`✔ New episode: ${episode.title} → ${path.relative(ROOT, dir)}`);
  for (const s of episode.scenes) console.log(`   ${s.rank ? '#' + s.rank : s.kind}: ${s.text}`);
  return dir;
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

function validate(ep) {
  if (!ep?.title || !Array.isArray(ep.scenes) || ep.scenes.length < 3) throw new Error('Bad episode: ' + JSON.stringify(ep).slice(0, 300));
  for (const s of ep.scenes) {
    const { lat, lon } = s.location || {};
    if (!(lat > 24.3 && lat < 27.2 && lon > -82.2 && lon < -79.9)) throw new Error(`Location outside South Florida: ${JSON.stringify(s.location)}`);
    if (!s.text || !s.shot?.type) throw new Error('Scene missing text/shot: ' + JSON.stringify(s));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const i = process.argv.indexOf('--topic');
  await generateEpisode({ topic: i > 0 ? process.argv[i + 1] : null });
}
