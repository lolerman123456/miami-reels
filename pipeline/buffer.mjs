// Buffer hand-off for Reels that should go out with trending music (the Instagram API can't add music).
// An episode with "music": true isn't posted through the Graph API. Instead it lands in the owner's Buffer as an
// Instagram Reel *reminder* (schedulingType: notification) at the slot time. Buffer pings the owner's phone, they open
// it in Instagram, add a trending sound, and post. Needs the BUFFER_API_KEY secret (Buffer → Settings → API).
//   node pipeline/buffer.mjs out/<id>.mp4 episodes/<id>      → send one now
import fs from 'node:fs';
import path from 'node:path';
import { readJSON, ROOT, run } from './util.mjs';

const API = 'https://api.buffer.com';
const REPO = process.env.GITHUB_REPOSITORY || 'lolerman123456/miami-reels';

export const wantsBuffer = episode => !!episode?.music && !!process.env.BUFFER_API_KEY;

async function gql(query, variables = {}) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.BUFFER_API_KEY}` },
    body: JSON.stringify({ query, variables }),
  });
  const j = await res.json();
  if (!res.ok || j.errors) throw new Error(`Buffer API: ${JSON.stringify(j.errors || j).slice(0, 300)}`);
  return j.data;
}

async function instagramChannel() {
  if (process.env.BUFFER_CHANNEL_ID) return process.env.BUFFER_CHANNEL_ID;
  const { account } = await gql('query { account { organizations { id } } }');
  for (const org of account.organizations) {
    const { channels } = await gql('query($o: OrganizationId!) { channels(input: { organizationId: $o }) { id name service } }', { o: org.id });
    const ig = channels.find(c => c.service === 'instagram' && /getnear/i.test(c.name || '')) || channels.find(c => c.service === 'instagram');
    if (ig) return ig.id;
  }
  throw new Error('no Instagram channel connected in Buffer');
}

// Buffer fetches the video from a public URL: the repo's public "videos" release.
async function publicUrl(file) {
  const name = path.basename(file);
  const url = `https://github.com/${REPO}/releases/download/videos/${name}`;
  const head = await fetch(url, { method: 'HEAD', redirect: 'follow' }).catch(() => null);
  if (!head?.ok) {
    if (!process.env.GH_TOKEN) throw new Error(`${name} isn't in the videos release and GH_TOKEN isn't set to upload it`);
    await run('gh', ['release', 'upload', 'videos', file, '--clobber', '-R', REPO]);
  }
  return url;
}

export async function sendReelToBuffer(file, episode, { at = new Date(Date.now() + 3 * 60e3) } = {}) {
  const channelId = await instagramChannel();
  const url = await publicUrl(file);
  const data = await gql(`mutation($input: CreatePostInput!) { createPost(input: $input) {
      ... on PostActionSuccess { post { id dueAt } } ... on MutationError { message } } }`, {
    input: {
      channelId, text: episode.igCaption || '', schedulingType: 'notification', mode: 'customScheduled',
      dueAt: at.toISOString(), needsApproval: false,
      assets: [{ video: { url, metadata: { thumbnailOffset: 1500 } } }],
      metadata: { instagram: { type: 'reel', shouldShareToFeed: true } },
    },
  });
  const r = data.createPost;
  if (!r?.post) throw new Error(`Buffer rejected the post: ${r?.message || JSON.stringify(r)}`);
  console.log(`✔ Sent to Buffer as a reminder for ${new Date(r.post.dueAt || at).toISOString()} (owner adds music and posts)`);
  fs.appendFileSync(path.join(ROOT, 'posted.log'), `${new Date().toISOString()}\tbuffer:${path.basename(file)}\tsent to Buffer (owner posts with music)\n`);
  return r.post.id;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [video, epDir] = process.argv.slice(2);
  if (!video) { console.error('Usage: node pipeline/buffer.mjs out/<id>.mp4 [episodes/<id>]'); process.exit(1); }
  const ep = readJSON(path.join(epDir || path.join(ROOT, 'episodes', path.basename(video, '.mp4')), 'episode.json'));
  await sendReelToBuffer(video, ep);
}
