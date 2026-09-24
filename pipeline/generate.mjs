// Write tomorrow's episode: concept + script + labels + camera shots, as episode.json
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, readJSON, writeJSON } from './util.mjs';

const PROMPT = `You write viral, satirical Instagram Reels for a South Florida page. Every video is ~30 seconds of
3D drone-style footage over real places (Google Earth style) with a narrator, big captions and emoji pop-ups.

STYLE
- Savage, funny, clickbait, zero corporate tone. Roast places, habits, traffic, prices, rent, HOAs, clubs, tourists, weather, drivers, iguanas, Publix, I-95, Brightline, etc.
- Hot takes can be loosely "justified" by real-world vibes or indirect stats, but NEVER cite sources or say "studies show".
- Roast places and behaviors, never ethnic groups, nationalities, religions, races, or real private people. Keep it Instagram-safe (no slurs, no explicit content).
- The first 3 seconds are everything: the hook must be a shocking, controversial, borderline-offensive-to-locals one-liner that
  makes people stop scrolling and argue in the comments (e.g. "If you live in number one, I'm sorry. Actually no I'm not.").
- Be savage, not cute. Punchlines should sting. Item #1 must be the harshest roast.
- For countdowns, each item line MUST start with "Number five," / "Number four," … and the last one with "And number one..."
- Formats that work: "Top 5 …" countdowns (#5 → #1), "X vs Y", "Places locals will never go", "Rating neighborhoods by …", "POV …". Prefer Top 5.

LENGTH: total narration 75–95 words. Each item line 12–18 words. Hook 8–14 words. Outro 5–9 words (a comment-bait CTA).

LOCATIONS: only well-known, real South Florida places (Miami-Dade, Broward, Palm Beach, Keys) with ACCURATE lat/lon of a visually
interesting spot (skyline, beach, marina, landmark). h = height above ground in meters to aim at (tall towers 60–120, low areas 5–20).

SHOTS: type is one of dive (hook only), orbit, push, zoomin, pullout (outro). range meters: 500–900 for low-rise areas/beaches,
1400–1800 for high-rise skylines (Brickell, Downtown, Sunny Isles, Fort Lauderdale beach towers — closer puts the camera inside buildings),
1500–2500 for wide areas. pitch -25 to -40 (use -32 or steeper around skyscrapers). heading 0–359 (vary it). For orbit add degrees (50–120) and dir (1 or -1).

OUTPUT strictly this JSON:
{
  "title": "…",
  "igCaption": "caption with emojis, a comment-bait question, '(satire)', and 10–14 hashtags",
  "scenes": [
    { "kind": "hook", "text": "spoken words", "overlay": ["LINE 1 (≤18 chars)", "LINE 2 (≤18 chars)"], "emojis": ["4 big emojis"],
      "location": {"name": "…", "lat": 0, "lon": 0, "h": 0}, "shot": {"type": "dive", "range": 1600, "pitch": -32, "heading": 200} },
    { "kind": "item", "rank": 5, "text": "spoken words (write numbers/symbols as spoken words)", "caption": "same line as it should appear on screen, with digits/symbols",
      "overlay": "PLACE NAME", "sub": "≤24 char roast tagline", "emoji": "1 emoji",
      "location": {…}, "shot": {…} },
    … items #4 to #1 …,
    { "kind": "outro", "text": "…", "overlay": "SHORT CTA WITH EMOJI", "sub": "short line", "location": {…}, "shot": {"type": "pullout", …} }
  ]
}`;

export async function generateEpisode({ topic } = {}) {
  const epRoot = path.join(ROOT, 'episodes');
  const existing = fs.existsSync(epRoot) ? fs.readdirSync(epRoot).filter(d => fs.existsSync(path.join(epRoot, d, 'episode.json'))).sort() : [];
  const past = existing.map(d => readJSON(path.join(epRoot, d, 'episode.json')).title);
  const num = String(existing.length + 1).padStart(3, '0');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-5.5',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: PROMPT },
        { role: 'user', content: `Today is ${new Date().toDateString()}. Past videos (don't repeat the concept):\n${past.map(t => '- ' + t).join('\n') || '(none)'}\n\n${topic ? `Today's topic/angle (from the account owner, follow it): ${topic}\n\n` : ''}Write today's episode.` },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const episode = JSON.parse((await res.json()).choices[0].message.content);
  validate(episode);

  const slug = episode.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  episode.id = `${num}-${slug}`;
  const dir = path.join(epRoot, episode.id);
  writeJSON(path.join(dir, 'episode.json'), episode);
  console.log(`✔ New episode: ${episode.title} → ${path.relative(ROOT, dir)}`);
  return dir;
}

function validate(ep) {
  if (!ep.title || !Array.isArray(ep.scenes) || ep.scenes.length < 3) throw new Error('Bad episode: ' + JSON.stringify(ep).slice(0, 300));
  for (const s of ep.scenes) {
    const { lat, lon } = s.location || {};
    if (!(lat > 24.3 && lat < 27.2 && lon > -82.2 && lon < -79.9)) throw new Error(`Location outside South Florida: ${JSON.stringify(s.location)}`);
    if (!s.text || !s.shot?.type) throw new Error('Scene missing text/shot: ' + JSON.stringify(s));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await generateEpisode();
