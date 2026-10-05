// Publish to Instagram via the Graph API: Reels (publishReel), carousels (publishCarousel), stories (publishStory).
//   node pipeline/publish.mjs out/001-rudest-cities.mp4 [episodes/001-rudest-cities]
import fs from 'node:fs';
import path from 'node:path';
import { readJSON, ROOT, run } from './util.mjs';
import { serveFilePublicly, serveFilesPublicly } from './tunnel.mjs';

const VERSION = 'v23.0';

export async function publishReel(videoFile, caption, { collaborators = [] } = {}) {
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
      create = await withCollabs(collaborators, extra => call(`${api}/${igUser}/media`, {
        media_type: 'REELS', video_url: tunnel.url, caption, share_to_feed: 'true', access_token: token, ...extra,
      }));
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

// Map Reels with a trending song (owner, Oct 5): the Instagram Audio API only works with a Facebook-Login token
// (FB_ACCESS_TOKEN, NEAR Social Publisher app, Jacobo's account with access to the "NEAR APP" Page linked to @getnearapp).
// Picks a trending song from /ig_audio not used in the last 20 music posts, keeps the voice on top (song at 14%, owner Oct 5).
export async function publishReelWithMusic(videoFile, caption, { collaborators = [] } = {}) {
  const token = process.env.FB_ACCESS_TOKEN;
  if (!token) throw new Error('FB_ACCESS_TOKEN not set');
  const api = `https://graph.facebook.com/${VERSION}`;
  const pages = await (await fetch(`${api}/me/accounts?fields=instagram_business_account&access_token=${token}`)).json();
  const igUser = (pages.data || []).map(p => p.instagram_business_account?.id).find(Boolean);
  if (!igUser) throw new Error('No Instagram account linked to the token\'s Pages: ' + JSON.stringify(pages.error || pages).slice(0, 200));
  const list = await (await fetch(`${api}/ig_audio?audio_type=music&user_id=${igUser}&access_token=${token}`)).json();
  const songs = list.audio || list.data || [];
  if (!songs.length) throw new Error('No trending audio: ' + JSON.stringify(list.error || list).slice(0, 200));
  const logFile = path.join(ROOT, 'posted.log');
  const used = new Set((fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : '').split('\n').filter(l => l.includes('\taudio:')).slice(-20).map(l => l.split('\taudio:')[1].split('\t')[0]));
  const song = songs.slice(0, 15).find(a => !used.has(String(a.audio_id))) || songs[0];
  console.log(`▶ Instagram: trending song "${song.title}" by ${song.display_artist || '?'} (${song.audio_id})`);
  const audio = JSON.stringify({ audio_id: String(song.audio_id), audio_volume: 14, video_volume: 100 });
  // Oct 5: the resumable upload of the full-quality file failed ("ProcessingFailedError"); send a compressed copy
  // (same settings as the public watch link) through a temporary public link instead, like the Instagram-Login path
  const small = path.join((await import('node:os')).tmpdir(), path.basename(videoFile, '.mp4') + '-ig.mp4'); // outside out/ so later steps don't pick it up
  await run('ffmpeg', ['-loglevel', 'error', '-y', '-i', videoFile, '-c:v', 'libx264', '-preset', 'veryfast', '-b:v', '4500k', '-maxrate', '5500k',
    '-bufsize', '11M', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-movflags', '+faststart', small]);
  let create, tunnel;
  try {
    console.log('▶ Instagram: opening temporary public link');
    tunnel = await serveFilePublicly(small);
    console.log('▶ Instagram: creating Reel container (with music)');
    create = await withCollabs(collaborators, extra => call(`${api}/${igUser}/media`, {
      media_type: 'REELS', video_url: tunnel.url, caption, share_to_feed: 'true', audio_configuration: audio, access_token: token, ...extra,
    }));
    console.log('▶ Instagram: waiting for processing');
    await waitReady(api, token, create.id);
  } finally { tunnel?.close(); }
  const link = await finish(api, igUser, token, create.id, path.basename(videoFile));
  fs.appendFileSync(logFile, `${new Date().toISOString()}\taudio:${song.audio_id}\t${song.title} — ${song.display_artist || ''}\t${path.basename(videoFile, '.mp4')}\n`);
  return link;
}

// Music Reels: post with a trending song when the Audio API is set up (control.json "igMusic" not false + FB_ACCESS_TOKEN),
// else (or if it fails) hand them to the owner like before. Returns true if posted.
export async function postMusicReel(videoFile, episode) {
  let on = true;
  try { on = readJSON(path.join(ROOT, 'control.json')).igMusic !== false; } catch {}
  if (!on || !process.env.FB_ACCESS_TOKEN) { console.log(`  (music Reel not auto-posted: igMusic=${on}, FB_ACCESS_TOKEN ${process.env.FB_ACCESS_TOKEN ? 'set' : 'missing'})`); return false; }
  try { await publishReelWithMusic(videoFile, episode.igCaption, { collaborators: episode.collaborators }); return true; }
  catch (e) { console.log(`  (music post failed: ${e.message.slice(0, 300)}; handing it to the owner)`); return false; }
}

// Carousel of 2–10 JPEGs (Instagram only accepts JPEG for images).
export async function publishCarousel(imageFiles, caption, label, { collaborators = [] } = {}) {
  const { api, igUser, token } = auth();
  const tunnel = await serveFilesPublicly(imageFiles);
  try {
    console.log(`▶ Instagram: creating carousel (${imageFiles.length} slides)`);
    const children = [];
    for (const url of tunnel.urls) {
      // a slide can also be a video (hook + clip posts): Instagram fetches it the same way
      const media = /\.mp4$/i.test(url) ? { media_type: 'VIDEO', video_url: url } : { image_url: url };
      const c = await call(`${api}/${igUser}/media`, { ...media, is_carousel_item: 'true', access_token: token });
      children.push(c.id);
    }
    for (const id of children) await waitReady(api, token, id);
    const create = await withCollabs(collaborators, extra => call(`${api}/${igUser}/media`, {
      media_type: 'CAROUSEL', children: children.join(','), caption, access_token: token, ...extra,
    }));
    await waitReady(api, token, create.id);
    return await finish(api, igUser, token, create.id, label || path.basename(path.dirname(imageFiles[0])));
  } finally {
    tunnel.close();
  }
}

// Story from a 9:16 JPEG or MP4 (≤60 s).
export async function publishStory(file, label) {
  // owner (Sep 29): they repost other people's stories, so the bot only adds one every so often
  // (control.json "storiesPerDay" / "storyGapHours"; leave storiesPerDay out for a story with every post)
  let c = {};
  try { c = readJSON(path.join(ROOT, 'control.json')); } catch {}
  if (c.storiesPerDay != null) {
    const ny = d => new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const log = fs.existsSync(path.join(ROOT, 'posted.log')) ? fs.readFileSync(path.join(ROOT, 'posted.log'), 'utf8') : '';
    const stories = log.split('\n').filter(l => l.split('\t')[1]?.startsWith('story:')).map(l => Date.parse(l.split('\t')[0])).filter(Boolean);
    const today = stories.filter(t => ny(t) === ny(Date.now()));
    const gap = (c.storyGapHours ?? 5) * 3600e3;
    if (today.length >= c.storiesPerDay) { console.log(`(story skipped: already ${today.length} today, limit ${c.storiesPerDay})`); return null; }
    if (stories.length && Date.now() - Math.max(...stories) < gap) { console.log(`(story skipped: last one was under ${c.storyGapHours ?? 5}h ago)`); return null; }
  }
  const { api, igUser, token } = auth();
  if (file.endsWith('.mp4')) {
    // stories max out at 60 s: post a trimmed, lighter copy of longer Reels
    const short = file.replace(/\.mp4$/, '.story.mp4');
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', file, '-t', '58', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22',
      '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', short]);
    file = short;
  }
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

// Invite collaborators (up to 3 usernames); if Instagram rejects them, post without instead of failing.
async function withCollabs(list, make) {
  const users = [...new Set(list || [])].filter(Boolean).slice(0, 3);
  if (!users.length) return make({});
  try {
    const r = await make({ collaborators: JSON.stringify(users) });
    console.log(`  collaborator invites: ${users.map(u => '@' + u).join(', ')}`);
    return r;
  } catch (e) {
    console.log(`  (collaborators rejected: ${e.message.slice(0, 160)}; posting without)`);
    return make({});
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

// Owner's rule: keep feed posts at least an hour apart, including ones the owner posts by hand from the app.
// Before publishing, look at the account's latest post; if it's under MIN_GAP old, wait out the rest.
// Posts we didn't make (manual ones) are added to posted.log so the record stays complete.
const MIN_GAP = Number(process.env.MIN_POST_GAP_MIN || 60) * 60e3;
async function spacing(api, igUser, token) {
  try {
    const j = await (await fetch(`${api}/${igUser}/media?fields=timestamp,permalink&limit=5&access_token=${token}`)).json();
    const posts = (j.data || []).map(p => ({ t: Date.parse(p.timestamp.replace(/([+-]\d\d)(\d\d)$/, '$1:$2')), url: p.permalink })).filter(p => p.t);
    const logFile = path.join(ROOT, 'posted.log');
    const log = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : '';
    for (const p of posts.filter(p => p.url && !log.includes(p.url.replace(/\/$/, '')) && Date.now() - p.t < 2 * 86400e3).reverse())
      fs.appendFileSync(logFile, `${new Date(p.t).toISOString()}\tmanual (posted from the app)\t${p.url}\n`);
    const last = Math.max(0, ...posts.map(p => p.t));
    const wait = last + MIN_GAP - Date.now();
    if (wait > 0) {
      console.log(`⏸ last post on the account was ${Math.round((Date.now() - last) / 60e3)} min ago; waiting ${Math.ceil(wait / 60e3)} min to keep posts an hour apart`);
      await new Promise(r => setTimeout(r, wait));
    }
  } catch (e) { console.log(`  (couldn't check the last post time: ${e.message}; posting now)`); }
}

async function finish(api, igUser, token, creationId, label) {
  if (!String(label).startsWith('story:')) await spacing(api, igUser, token);
  // a freshly created container sometimes isn't visible yet ("Media Not Found", subcode 2207006) → retry a few times
  let pub;
  for (let i = 0; ; i++) {
    try { pub = await call(`${api}/${igUser}/media_publish`, { creation_id: creationId, access_token: token }); break; }
    catch (e) { if (i >= 3 || !/2207006|Media Not Found/.test(e.message)) throw e; await new Promise(r => setTimeout(r, 15000)); }
  }
  const info = await (await fetch(`${api}/${pub.id}?fields=permalink&access_token=${token}`)).json();
  console.log(`✔ Posted: ${info.permalink || pub.id}`);
  fs.appendFileSync(path.join(ROOT, 'posted.log'), `${new Date().toISOString()}\t${label}\t${info.permalink || pub.id}\n`);
  return info.permalink || pub.id;
}

// Instagram sometimes can't download one file from the temporary tunnel link ("Media download has failed", 2207052 /
// 9004): retry a few times before failing the whole post (Sep 30: one slide out of 8 sank the 12pm carousel).
async function call(url, params) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { method: 'POST', body: new URLSearchParams(params) });
    const json = await res.json();
    if (res.ok && !json.error) return json;
    const err = json.error || json;
    if (attempt < 4 && (err.error_subcode === 2207052 || err.code === 9004 || err.is_transient)) {
      console.log(`  (Instagram couldn't fetch the media, retry ${attempt}/3)`);
      await new Promise(r => setTimeout(r, attempt * 10000));
      continue;
    }
    throw new Error(`${url.split('?')[0]} → ${JSON.stringify(err)}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [video, epDir] = process.argv.slice(2);
  if (!video) { console.error('Usage: node pipeline/publish.mjs out/<id>.mp4 [episodes/<id>]'); process.exit(1); }
  const dir = epDir || path.join(ROOT, 'episodes', path.basename(video, '.mp4'));
  const ep = readJSON(path.join(dir, 'episode.json'));
  const { wantsMusic, handToOwner, postToTikTok } = await import('./buffer.mjs');
  const ai = ep.scenes?.some(s => s.image);
  if (wantsMusic(ep)) { // posted with a trending song via the Audio API, else the owner posts it; TikTok gets a Buffer reminder
    if (await postMusicReel(video, ep)) await publishStory(video).catch(e => console.log(`(story skipped: ${e.message})`));
    else await handToOwner(video, ep);
    const logTxt = fs.existsSync(path.join(ROOT, 'posted.log')) ? fs.readFileSync(path.join(ROOT, 'posted.log'), 'utf8') : '';
    if (!logTxt.includes(`tiktok:${path.basename(dir)}\t`)) await postToTikTok({ video: video, text: ep.igCaption, label: path.basename(dir), ai }); // already reminded when it rendered
    process.exit(0);
  }
  await publishReel(video, ep.igCaption, { collaborators: ep.collaborators });
  await publishStory(video).catch(e => console.log(`(story skipped: ${e.message})`));
  if (ep.tiktok) await postToTikTok({ video, text: ep.igCaption, label: path.basename(dir), ai }); // TikTok: upcoming/viral only
}
