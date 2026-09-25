// Photos for carousel slides — stock first, AI only when stock would look bad.
//   1. Wikimedia Commons (free license, credited on the slide). A cheap vision check picks the best candidate
//      or rejects them all if none fits / looks good.
//   2. OpenAI image — only if no good stock AND today's AI budget (AI_IMAGES_PER_DAY, default 3) isn't used up.
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
let aiThisPost = 0;     // at most AI_IMAGES_PER_POST (default 1) per carousel
export function newPost() { used.clear(); aiThisPost = 0; }

export async function getPhoto(spec, dir, name, { context = '' } = {}) {
  if (!spec) return null;
  const attempt = async (fn, ...a) => { try { return await fn(...a); } catch (e) { console.log(`  (${fn.name} failed for ${name}: ${e.message.slice(0, 160)})`); return null; } };
  return (spec.query && await attempt(stockPhoto, spec.query, dir, name, context))
    || (spec.prompt && aiBudgetLeft() > 0 && aiThisPost < Number(process.env.AI_IMAGES_PER_POST ?? 1) && await attempt(aiPhoto, spec.prompt, dir, name))
    || await attempt(stockPhoto, FALLBACKS[Math.floor(Math.random() * FALLBACKS.length)], dir, name, '', true);
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
    && !/logo|map|diagram|chart|seal|flag|coat of arms|plaque|sign|\.svg|\.gif|\.tif/i.test(c.title)).slice(0, 5);
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
  const pick = anyOk ? 0 : await judge(ok, query, context);
  if (pick < 0) { console.log(`  stock rejected for "${query}"`); return null; }
  const c = ok[pick];
  const file = path.join(dir, `${name}.jpg`);
  fs.writeFileSync(file, c.data);
  used.add(c.title);
  return { file, credit: `Photo: ${c.artist} / ${c.license}`, kind: 'stock' };
}

// Ask a vision model which candidate would look good behind this slide (or none). Low-detail images: fractions of a cent.
async function judge(list, query, context) {
  if (!process.env.OPENAI_API_KEY) return 0;
  const content = [
    { type: 'text', text: `Instagram carousel slide about: "${context || query}". Wanted photo: "${query}".\n` +
      `Pick the ONE candidate that clearly shows that subject and looks like an attractive, sharp, modern social-media photo ` +
      `(no documents, no old/grainy/tilted snapshots, no random interiors, no close-ups of identifiable people, no visible prices, numbers, signs or big text that could clash with the post's own numbers). ` +
      `If none is good enough, answer -1. Reply JSON {"pick": index}.` },
    ...list.flatMap((c, i) => [{ type: 'text', text: `Candidate ${i}: ${c.title}` }, { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${c.data.toString('base64')}`, detail: 'low' } }]),
  ];
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL || 'gpt-5.5', response_format: { type: 'json_object' },
      messages: [{ role: 'user', content }] }),
  });
  if (!res.ok) { console.log(`  (photo judge ${res.status}: ${(await res.text()).slice(0, 200)} — taking first candidate)`); return 0; }
  const pick = Number(JSON.parse((await res.json()).choices[0].message.content).pick);
  return Number.isInteger(pick) && pick < list.length ? pick : -1;
}

function aiBudgetLeft() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const usedToday = fs.existsSync(BUDGET_FILE) ? fs.readFileSync(BUDGET_FILE, 'utf8').split('\n').filter(l => l.startsWith(today)).length : 0;
  return Number(process.env.AI_IMAGES_PER_DAY ?? 3) - usedToday;
}

async function aiPhoto(description, dir, name) {
  if (!process.env.OPENAI_API_KEY) return null;
  const prompt = `${description}. Photorealistic editorial photo, natural light, shot on a phone camera, South Florida setting. ` +
    'No text, no logos, no watermarks. No identifiable real people or public figures; faces turned away, blurred or out of frame.';
  for (const model of [process.env.OPENAI_IMAGE_MODEL, 'gpt-image-1'].filter(Boolean)) {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, size: '1024x1536', quality: 'medium', n: 1 }),
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
