// Real photos inside a map Reel: a scene with "photos": {"queries": ["Venetian Pool Coral Gables", "Venetian Pool grotto"]}
// first shows the 3D orbit, then (from "at", share of the scene, default 0.4) cuts to real photos of the place with a slow
// push/pan and crossfades (owner, Sep 30: "we need the pool to show"). Photos come from Wikimedia Commons (free licenses,
// credited on screen); a vision check picks the best candidate per query or skips it. Never AI images here.
// Fetched once into <episode>/photos/ and saved as photos.files [{file, credit}].
import fs from 'node:fs';
import path from 'node:path';
import { getPhoto, newPost } from './photos.mjs';

export async function ensurePhotos(epDir, episode) {
  let changed = false;
  newPost();
  for (const [i, s] of episode.scenes.entries()) {
    const want = s.photos?.queries;
    if (!want?.length || s.photos.files?.length) continue;
    const dir = path.join(epDir, 'photos');
    fs.mkdirSync(dir, { recursive: true });
    const files = [];
    const context = `${[s.overlay].flat().join(' ')}: ${s.caption || ''}`;
    for (const [j, query] of want.entries()) {
      const p = await getPhoto({ query }, dir, `scene-${i}-${j}`, { context });
      if (p?.kind === 'stock') files.push({ file: path.relative(epDir, p.file), credit: p.credit.replace(/^Photo: /, '') });
    }
    console.log(`  scene ${i}: ${files.length}/${want.length} real photos`);
    s.photos.files = files;
    changed = true;
  }
  if (changed) fs.writeFileSync(path.join(epDir, 'episode.json'), JSON.stringify(episode, null, 2) + '\n');
  return episode;
}
