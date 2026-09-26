// Scene images: a scene with "image": {"prompt": "...", "focus": ["the garage", "the roof"]} shows an AI render on a white
// background instead of the map, and the camera glides from the full picture into each focus spot while the narrator talks.
// Generated once per episode into <episode>/images/scene-<i>.png; focus spots are found by a vision pass (normalized x/y/zoom).
import fs from 'node:fs';
import path from 'node:path';

const KEY = () => process.env.OPENAI_API_KEY;

export async function ensureImages(epDir, episode) {
  let changed = false;
  for (const [i, s] of episode.scenes.entries()) {
    if (!s.image?.prompt) continue;
    const rel = `images/scene-${i}.png`;
    const file = path.join(epDir, rel);
    if (!fs.existsSync(file)) {
      if (!KEY()) throw new Error('OPENAI_API_KEY needed to render scene images');
      console.log(`  scene ${i}: rendering image`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, await render(s.image.prompt));
      delete s.image.path; changed = true; // new picture → find the focus spots again
    }
    if (s.image.focus?.length && !s.image.path) { s.image.path = await locate(file, s.image.focus); changed = true; }
    if (s.image.file !== rel) { s.image.file = rel; changed = true; }
  }
  if (changed) fs.writeFileSync(path.join(epDir, 'episode.json'), JSON.stringify(episode, null, 2) + '\n');
  return episode;
}

async function render(prompt) {
  const full = `${prompt}. Clean 3D architectural render, soft studio lighting, pure white seamless background, no text, no logos, no people, no watermark.`;
  for (const model of [process.env.OPENAI_IMAGE_MODEL, 'gpt-image-1'].filter(Boolean)) {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST', headers: { Authorization: `Bearer ${KEY()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: full, size: '1024x1536', quality: 'high', n: 1 }),
    });
    if (!res.ok) { console.log(`  (image model ${model}: ${res.status} ${(await res.text()).slice(0, 200)})`); continue; }
    const b64 = (await res.json()).data?.[0]?.b64_json;
    if (b64) return Buffer.from(b64, 'base64');
  }
  throw new Error('image generation failed');
}

// where each focus spot sits in the picture → camera keyframes [{x, y, zoom}] (x/y = 0..1 of the image)
async function locate(file, focus) {
  const start = [{ x: 0.5, y: 0.5, zoom: 1 }];
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { Authorization: `Bearer ${KEY()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL || 'gpt-5.5', response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: [
          { type: 'text', text: `For each of these parts of the building in the image, give the center as fractions of the image width/height (0 = left/top, 1 = right/bottom) and a zoom (1.6–2.6) that frames that part nicely. Parts: ${JSON.stringify(focus)}. Reply JSON {"spots":[{"part":"…","x":0.5,"y":0.5,"zoom":2}]}` },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${fs.readFileSync(file).toString('base64')}` } },
        ] }] }),
    });
    const spots = JSON.parse((await res.json()).choices[0].message.content).spots || [];
    const ok = spots.filter(p => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1).map(p => ({ x: p.x, y: p.y, zoom: Math.min(2.8, Math.max(1.4, p.zoom || 2)) }));
    console.log(`  focus spots: ${spots.map(p => `${p.part} (${(+p.x).toFixed(2)}, ${(+p.y).toFixed(2)})`).join(', ')}`);
    return [...start, ...ok];
  } catch (e) {
    console.log(`  (focus lookup failed: ${e.message}) — plain slow zoom`);
    return [...start, { x: 0.5, y: 0.45, zoom: 1.5 }];
  }
}
