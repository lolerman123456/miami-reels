// Publish an MP4 as an Instagram Reel via the Instagram Graph API (resumable upload, no public URL needed).
//   node pipeline/publish.mjs out/001-rudest-cities.mp4 [episodes/001-rudest-cities]
import fs from 'node:fs';
import path from 'node:path';
import { readJSON, ROOT } from './util.mjs';
import { serveFilePublicly } from './tunnel.mjs';

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

  const pub = await call(`${api}/${igUser}/media_publish`, { creation_id: create.id, access_token: token });
  const info = await (await fetch(`${api}/${pub.id}?fields=permalink&access_token=${token}`)).json();
  console.log(`✔ Posted: ${info.permalink || pub.id}`);

  const logFile = path.join(ROOT, 'posted.log');
  fs.appendFileSync(logFile, `${new Date().toISOString()}\t${path.basename(videoFile)}\t${info.permalink || pub.id}\n`);
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
}
