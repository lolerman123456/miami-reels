// Photos for carousel slides.
//   place → a real, freely licensed photo from Wikimedia Commons (credited on the slide)
//   ai    → an OpenAI image (illustrative scenes; labelled "AI illustration")
// Real photos are only used for places/things, never to illustrate people in a news story.
import fs from 'node:fs';
import path from 'node:path';

const UA = 'getnearapp-bot/1.0 (https://github.com/lolerman123456/miami-reels)';
const OK_LICENSE = /^(CC0|Public domain|PD|CC BY(-SA)? [0-9.]+|CC BY(-SA)?)/i;
const used = new Set(); // don't reuse one photo twice in a post

export async function getPhoto(spec, dir, name) {
  if (!spec) return null;
  const tries = spec.type === 'place' ? [placePhoto, aiPhoto] : [aiPhoto, placePhoto];
  for (const t of tries) {
    try { const p = await t(spec, dir, name); if (p) return p; } catch (e) { console.log(`  (${t.name} failed for ${name}: ${e.message.slice(0, 200)})`); }
  }
  return null;
}

async function placePhoto(spec, dir, name) {
  if (!spec.query) return null;
  const url = 'https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({
    action: 'query', generator: 'search', gsrsearch: `${spec.query} filetype:bitmap`, gsrnamespace: '6', gsrlimit: '12',
    prop: 'imageinfo', iiprop: 'url|extmetadata|size', iiurlwidth: '1600', format: 'json',
  });
  const data = await (await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) })).json();
  const pages = Object.values(data.query?.pages || {}).sort((a, b) => a.index - b.index);
  for (const p of pages) {
    const ii = p.imageinfo?.[0]; const m = ii?.extmetadata || {};
    const license = m.LicenseShortName?.value || '';
    if (!ii || used.has(p.title) || ii.width < 1000 || ii.height < 700 || !OK_LICENSE.test(license)) continue;
    if (/logo|map|diagram|chart|seal|flag|coat of arms|\.svg|\.gif/i.test(p.title)) continue;
    const img = await fetch(ii.thumburl || ii.url, { headers: { 'User-Agent': UA } });
    if (!img.ok) continue;
    const file = path.join(dir, `${name}.jpg`);
    fs.writeFileSync(file, Buffer.from(await img.arrayBuffer()));
    used.add(p.title);
    const artist = (m.Artist?.value || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 40) || 'Wikimedia Commons';
    return { file, credit: `Photo: ${artist} / ${license}` };
  }
  return null;
}

async function aiPhoto(spec, dir, name) {
  if (!spec.prompt || !process.env.OPENAI_API_KEY) return null;
  const prompt = `${spec.prompt}. Photorealistic editorial photo, natural light, shot on a phone camera, South Florida setting. ` +
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
    return { file, credit: 'AI illustration' };
  }
  return null;
}
