// Publish to Instagram via the Graph API: Reels (publishReel), carousels (publishCarousel), stories (publishStory).
//   node pipeline/publish.mjs out/001-rudest-cities.mp4 [episodes/001-rudest-cities]
import fs from 'node:fs';
import path from 'node:path';
import { readJSON, ROOT } from './util.mjs';
import { serveFilePublicly, serveFilesPublicly } from './tunnel.mjs';

const VERSION = 'v23.0';

export async function publishReel(videoFile, caption) {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  const igUser = process.env.INSTAGRAM_USER_ID;
  if (!token || !igUser) throw new Error('Set INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_USER_ID in .env');

  // Instagram-Login tokens (IGAA…) use graph.instagram.com; Facebook-Login tokens (EAA…) use graph.facebook.com
  const host = token.startsWith('IG') ? 'graph.instagram.com' : 'graph.facebook.com';
  const api = `https://${host}/${VERSION}`;

  let create, tunnel;
  try {
    if (host === 'graph.instagram.com') {
      // Instagram Login only accepts a public video_url → serve the file through a temporary tunnel
      console.log('▶ Instagram: opening temporary public link');
      tunnel = await serveFilePublicly(videoFile);
      console.log('▶ Instagram: creating Reel container');
      create = await call(`${api}/${igUser}/media`, {
        media_type: 'REELS', video_url: tunnel.url, caption, share_to_feed: 'true', access_token: token,
      });
    } else {
      console.log('▶ Instagram: creating Reel container');
      create = await call(`${api}/${igUser}/media`, {
        media_type: 'REELS', upload_type: 'resumable', caption, share_to_feed: 'true', access_token: token,
      });
      console.log('▶ Instagram: uploading video');
      const data = fs.readFileSync(videoFile);
      const up = await fetch(create.uri || `https://rupload.facebook.com/ig-api-upload/${VERSION}/${create.id}`, {
        method: 'POST',
        headers: { Authorization: `OAuth ${token}`, offset: '0', file_size: String(data.length) },
        body: data,
      });
      if (!up.ok) throw new Error(`Upload failed ${up.status}: ${await up.text()}`);
    }

    console.log('▶ Instagram: waiting for processing');
    let done = false;
    for (let i = 0; i < 90 && !done; i++) {
      const s = await (await fetch(`${api}/${create.id}?fields=status_code,status&access_token=${token}`)).json();
      if (s.status_code === 'FINISHED') done = true;
      else if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new Error('Processing failed: ' + JSON.stringify(s));
      else await new Promise(r => setTimeout(r, 10000));
    }
    if (!done) throw new Error('Instagram processing timed out');
  } finally {
    tunnel?.close();
  }

  return finish(api, igUser, token, create.id, path.basename(videoFile));
}

// Carousel of 2–10 JPEGs (Instagram only accepts JPEG for images).
export async function publishCarousel(imageFiles, caption, label) {
  const { api, igUser, token } = auth();
  const tunnel = await serveFilesPublicly(imageFiles);
  try {
    console.log(`▶ Instagram: creating carousel (${imageFiles.length} slides)`);
    const children = [];
    for (const url of tunnel.urls) {
      const c = await call(`${api}/${igUser}/media`, { image_url: url, is_carousel_item: 'true', access_token: token });
      children.push(c.id);
    }
    for (const id of children) await waitReady(api, token, id);
    const create = await call(`${api}/${igUser}/media`, {
      media_type: 'CAROUSEL', children: children.join(','), caption, access_token: token,
    });
    await waitReady(api, token, create.id);
    return await finish(api, igUser, token, create.id, label || path.basename(path.dirname(imageFiles[0])));
  } finally {
    tunnel.close();
  }
}

// Story from a 9:16 JPEG or MP4 (≤60 s).
export async function publishStory(file, label) {
  const { api, igUser, token } = auth();
  const tunnel = await serveFilePublicly(file);
  try {
    const video = file.endsWith('.mp4');
    console.log(`▶ Instagram: creating story (${video ? 'video' : 'image'})`);
    const create = await call(`${api}/${igUser}/media`, {
      media_type: 'STORIES', [video ? 'video_url' : 'image_url']: tunnel.url, access_token: token,
    });
    await waitReady(api, token, create.id);
    return await finish(api, igUser, token, create.id, `story:${label || path.basename(file)}`);
  } finally {
    tunnel.close();
  }
}

function auth() {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  const igUser = process.env.INSTAGRAM_USER_ID;
  if (!token || !igUser) throw new Error('Set INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_USER_ID in .env');
  const host = token.startsWith('IG') ? 'graph.instagram.com' : 'graph.facebook.com';
  return { api: `https://${host}/${VERSION}`, igUser, token };
}

async function waitReady(api, token, id) {
  for (let i = 0; i < 90; i++) {
    const s = await (await fetch(`${api}/${id}?fields=status_code,status&access_token=${token}`)).json();
    if (!s.status_code || s.status_code === 'FINISHED') return;
    if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new Error('Processing failed: ' + JSON.stringify(s));
    await new Promise(r => setTimeout(r, 5000));
  }
  throw new Error('Instagram processing timed out');
}

async function finish(api, igUser, token, creationId, label) {
  const pub = await call(`${api}/${igUser}/media_publish`, { creation_id: creationId, access_token: token });
  const info = await (await fetch(`${api}/${pub.id}?fields=permalink&access_token=${token}`)).json();
  console.log(`✔ Posted: ${info.permalink || pub.id}`);
  fs.appendFileSync(path.join(ROOT, 'posted.log'), `${new Date().toISOString()}\t${label}\t${info.permalink || pub.id}\n`);
  return info.permalink || pub.id;
}

async function call(url, params) {
  const res = await fetch(url, { method: 'POST', body: new URLSearchParams(params) });
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(`${url.split('?')[0]} → ${JSON.stringify(json.error || json)}`);
  return json;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [video, epDir] = process.argv.slice(2);
  if (!video) { console.error('Usage: node pipeline/publish.mjs out/<id>.mp4 [episodes/<id>]'); process.exit(1); }
  const dir = epDir || path.join(ROOT, 'episodes', path.basename(video, '.mp4'));
  await publishReel(video, readJSON(path.join(dir, 'episode.json')).igCaption);
  await publishStory(video).catch(e => console.log(`(story skipped: ${e.message})`));
}
