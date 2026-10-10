// Photos for carousel slides — stock first, AI only when stock would look bad.
//   1. Wikimedia Commons (free license, credited on the slide). A cheap vision check picks the best candidate
//      or rejects them all if none fits / looks good.
//   2. OpenAI image — when stock is missing or boring, within today's AI budget (AI_IMAGES_PER_DAY, default 10).
//   3. A generic South Florida stock photo, so a slide never goes without an image.
// Real photos are for places/things; people in news stories are never illustrated with a real photo.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './util.mjs';

const UA = 'getnearapp-bot/1.0 (https://github.com/lolerman123456/miami-reels)';
const OK_LICENSE = /^(CC0|Public domain|PD|CC BY(-SA)?( [0-9.]+)?)/i;
const BUDGET_FILE = path.join(ROOT, 'state', 'ai-images.txt');
const FALLBACKS = ['Miami skyline', 'Miami Beach aerial', 'Brickell skyline', 'Biscayne Bay Miami'];
const used = new Set(); // don't reuse one photo twice in a post
let aiThisPost = 0;     // at most AI_IMAGES_PER_POST (default 4) per carousel (owner: AI instead of boring stock)
export function newPost() { used.clear(); aiThisPost = 0; }

export async function getPhoto(spec, dir, name, { context = '', aiFirst = false } = {}) {
  if (!spec) return null;
  const attempt = async (fn, ...a) => { try { return await fn(...a); } catch (e) { console.log(`  (${fn.name} failed for ${name}: ${e.message.slice(0, 160)})`); return null; } };
  const simple = spec.query?.replace(/\b(miami|dade|florida|south|broward|palm beach|fort lauderdale|fl)\b/gi, '').replace(/\s+/g, ' ').trim();
  // owner asked for AI images on this post: AI first, no budget caps
  if (process.env.AI_PHOTOS === '1' && spec.prompt) { const p = await attempt(aiPhoto, spec.prompt, dir, name); if (p) return p; }
  // news carousels (owner, Sep 29: stock looks bland): eye-catching AI image first, stock only as a fallback
  if (aiFirst && spec.prompt && aiBudgetLeft() > 0) { const p = await attempt(aiPhoto, spec.prompt, dir, name); if (p) return p; }
  return (spec.query && await attempt(stockPhoto, spec.query, dir, name, context))
    || (simple && simple !== spec.query && simple.split(' ').length >= 1 && await attempt(stockPhoto, simple, dir, name, context))
    || (spec.prompt && aiBudgetLeft() > 0 && aiThisPost < Number(process.env.AI_IMAGES_PER_POST ?? 4) && await attempt(aiPhoto, spec.prompt, dir, name))
    || (spec.prompt && aiBudgetLeft() > 0 && await attempt(aiPhoto, spec.prompt, dir, name)) // over the normal caps (owner: never post a slide without a picture); hard stop at +30/day
    // AI budget spent (owner Oct 3: $2/day): take the best-matching free stock photo without the picky looks check
    || (spec.query && await attempt(stockPhoto, spec.query, dir, name, context, true))
    || (simple && simple !== spec.query && await attempt(stockPhoto, simple, dir, name, context, true))
    || await properNames(spec.query, dir, name, context)
    || await properNames(context, dir, name, context) // the slide's own headline names the venue ("Chucho Valdés at the Arsht Center")
    || null; // no photo: the slide uses the plain dark background instead of a random, off-topic stock picture
}

// Long queries ("Karol G Hard Rock Stadium Miami Gardens concert night") find nothing on Wikimedia: try the
// proper names in them ("Hard Rock Stadium", "Karol G") one by one, venues/places first.
async function properNames(query, dir, name, context) {
  const runs = (query || '').match(/\b[A-Z][\w'’.-]*(?:\s+(?:of|the|de|la|el)?\s*[A-Z][\w'’.-]*)+/g) || [];
  const venue = /stadium|center|centre|arena|park|theat(er|re)|hall|beach|museum|garden|live|club|bay|island|village|plaza|square/i;
  // a run can hold several names ("Hard Rock Stadium Adrienne Arsht Center ZeyZey"): try its 2–4 word spans,
  // ones ending in a venue word first, longer first, at most 8 searches
  const spans = new Set();
  for (const r of runs) { const w = r.trim().split(/\s+/); for (let n = Math.min(4, w.length); n >= 2; n--) for (let i = 0; i + n <= w.length; i++) spans.add(w.slice(i, i + n).join(' ')); }
  const venueEnd = q => venue.test(q.split(' ').pop()) ? 1 : 0;
  for (const q of [...spans].sort((a, b) => venueEnd(b) - venueEnd(a) || b.split(' ').length - a.split(' ').length).slice(0, 8)) {
    try { const p = await stockPhoto(q, dir, name, context, true); if (p) return p; } catch {}
  }
  return null;
}

async function candidates(query) {
  const url = 'https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({
    action: 'query', generator: 'search', gsrsearch: `${query} filetype:bitmap`, gsrnamespace: '6', gsrlimit: '15',
    prop: 'imageinfo', iiprop: 'url|extmetadata|size', iiurlwidth: '1600', format: 'json',
  });
  const data = await (await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) })).json();
  return Object.values(data.query?.pages || {}).sort((a, b) => a.index - b.index).map(p => {
    const ii = p.imageinfo?.[0]; const m = ii?.extmetadata || {};
    return ii && {
      title: p.title, url: ii.thumburl || ii.url, width: ii.width, height: ii.height, license: m.LicenseShortName?.value || '',
      artist: (m.Artist?.value || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 40) || 'Wikimedia Commons',
    };
  }).filter(c => c && !used.has(c.title) && c.width >= 1000 && c.height >= 700 && OK_LICENSE.test(c.license)
    && !/logo|map|diagram|chart|seal|flag|coat of arms|plaque|sign|postcard|lithograph|drawing|engraving|poster|\.svg|\.gif|\.tif/i.test(c.title)
    && !/curt teich|postcard|publisher/i.test(c.artist)).slice(0, 5);
}

async function stockPhoto(query, dir, name, context, anyOk = false) {
  const list = await candidates(query);
  if (!list.length) return null;
  for (const c of list) {
    const img = await fetch(c.url, { headers: { 'User-Agent': UA } }).catch(() => null);
    if (img?.ok) c.data = Buffer.from(await img.arrayBuffer());
  }
  const ok = list.filter(c => c.data);
  if (!ok.length) return null;
  const pick = await judge(ok, query, context, anyOk);
  if (pick < 0) { console.log(`  stock rejected for "${query}"`); return null; }
  const c = ok[pick];
  const file = path.join(dir, `${name}.jpg`);
  fs.writeFileSync(file, c.data);
  used.add(c.title);
  return { file, credit: `Photo: ${c.artist} / ${c.license}`, kind: 'stock' };
}

// Ask a vision model which candidate would look good behind this slide (or none). Low-detail images: fractions of a cent.
async function judge(list, query, context, lenient = false) {
  if (!process.env.OPENAI_API_KEY) return 0;
  // lenient (fallback once the AI budget is spent): any decent photo that really shows this place/subject
  const content = lenient ? [
    { type: 'text', text: `Instagram carousel slide about: "${context || query}" (South Florida). Wanted photo: "${query}".\n` +
      `Pick the candidate that really shows this exact place or subject (the right venue/city, not a different place with a similar name) and is a decent, sharp photo. No close-ups of identifiable people, no documents or old postcards. If none shows it, answer -1. Reply JSON {"pick": index}.` },
    ...list.flatMap((c, i) => [{ type: 'text', text: `Candidate ${i}: ${c.title}` }, { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${c.data.toString('base64')}`, detail: 'low' } }]),
  ] : [
    { type: 'text', text: `Instagram carousel slide about: "${context || query}". Wanted photo: "${query}".\n` +
      `Pick the ONE candidate that clearly shows that subject and looks like an attractive, sharp, modern social-media photo ` +
      `(no documents, no old/grainy/tilted snapshots, no random interiors, no close-ups of identifiable people, no vintage postcards or old illustrations, nothing BORING: no flat gray skies over generic streets, no plain parking lots or buildings with nothing happening, no photos of a different city than the story, no photo a person would scroll past — only pick one that is striking and clearly about this exact story; small price signs in the background are fine, but not a big close-up price/number that could clash with the post). ` +
      `If none is good enough, answer -1. Reply JSON {"pick": index}.` },
    ...list.flatMap((c, i) => [{ type: 'text', text: `Candidate ${i}: ${c.title}` }, { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${c.data.toString('base64')}`, detail: 'low' } }]),
  ];
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MINI_MODEL || 'gpt-5.4-mini', response_format: { type: 'json_object' },
      messages: [{ role: 'user', content }] }),
  });
  if (!res.ok) { console.log(`  (photo judge ${res.status}: ${(await res.text()).slice(0, 200)} — taking first candidate)`); return 0; }
  const pick = Number(JSON.parse((await res.json()).choices[0].message.content).pick);
  return Number.isInteger(pick) && pick < list.length ? pick : -1;
}

function aiBudgetLeft() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const usedToday = fs.existsSync(BUDGET_FILE) ? fs.readFileSync(BUDGET_FILE, 'utf8').split('\n').filter(l => l.startsWith(today)).length : 0;
  return Number(process.env.AI_IMAGES_PER_DAY ?? 10) - usedToday; // ~1–2¢ each (gpt-image-1-mini): cheap next to the text calls; real photos + stock still go first
}

// AI picture for a Reel scene (owner, Oct 4: costume photos in the Halloween Reel) — same budget file as carousels
export async function aiImage(description, dir, name, raw = false) { return aiPhoto(description, dir, name, raw); }

async function aiPhoto(description, dir, name, raw = false) {
  if (!process.env.OPENAI_API_KEY) return null;
  // raw: the caller's prompt as is (studio product renders for floating Reel cards), only the safety line added
  // raw 'people' (shareslop, owner Oct 6): staged shock scenes with invented people — faces allowed, never real/famous people
  const prompt = raw === 'people' ? `${description}. Looks like a REAL viral photo shot on an iPhone: candid, natural light, sharp focus, realistic skin texture and hands, attractive stylish people in their 20s, vivid but natural color, slightly wide angle. The comedy comes from real expressions and the situation, not from cartoon effects (no glowing brains, lightbulbs, sparkles, floating icons, hearts, heart-eyes or emoji). Invented ordinary people only: no celebrities, public figures or real identifiable people. No text, no captions, no logos, no watermarks.`
    : raw ? `${description}. No text, no logos, no watermarks, no real people or faces.` : `${description}. Eye-catching photorealistic editorial photo that stops the scroll: vivid saturated color, bright light (golden hour, neon or strong sun, never dull or gray), bold close or low angle, a clear striking subject with something happening, cinematic depth, South Florida setting when relevant. ` +
    'No text, no readable numbers, no price signs or price displays, no logos, no watermarks. No identifiable real people or public figures; faces turned away, blurred or out of frame.';
  // cheap first (owner: mini model, ~4-5x cheaper), full model only if the mini one fails
  for (const model of [...new Set([process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1-mini', 'gpt-image-1'])]) {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, size: '1024x1536', quality: raw === 'people' ? 'high' : 'medium', n: 1 }), // shareslop: high (owner, Oct 6: "make the images a little better")
    });
    if (!res.ok) { console.log(`  (image model ${model}: ${res.status})`); continue; }
    const b64 = (await res.json()).data?.[0]?.b64_json;
    if (!b64) continue;
    const file = path.join(dir, `${name}.png`);
    fs.writeFileSync(file, Buffer.from(b64, 'base64'));
    fs.mkdirSync(path.dirname(BUDGET_FILE), { recursive: true });
    fs.appendFileSync(BUDGET_FILE, `${new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })}\t${name}\n`);
    aiThisPost++;
    return { file, credit: 'AI illustration', kind: 'ai' };
  }
  return null;
}
