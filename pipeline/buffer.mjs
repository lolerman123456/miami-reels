// Buffer hand-off for Reels that should go out with trending music (the Instagram API can't add music).
// An episode with "music": true isn't posted through the Graph API. Instead it lands in the owner's Buffer as an
// Instagram Reel *reminder* (schedulingType: notification) at the slot time. Buffer pings the owner's phone, they open
// it in Instagram, add a trending sound, and post. Needs the BUFFER_API_KEY secret (Buffer → Settings → API).
//   node pipeline/buffer.mjs out/<id>.mp4 episodes/<id>      → send one now
// Every Reel also becomes a TikTok reminder (postToTikTok) when TikTok is connected in the same Buffer.
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

async function channelFor(service) {
  const env = { instagram: 'BUFFER_CHANNEL_ID', tiktok: 'BUFFER_TIKTOK_CHANNEL_ID' }[service];
  if (process.env[env]) return process.env[env];
  const { account } = await gql('query { account { organizations { id } } }');
  for (const org of account.organizations) {
    const { channels } = await gql('query($o: OrganizationId!) { channels(input: { organizationId: $o }) { id name service isDisconnected } }', { o: org.id });
    const list = channels.filter(c => c.service === service && !c.isDisconnected);
    const ch = list.find(c => /getnear|near/i.test(c.name || '')) || list[0];
    if (ch) return ch.id;
  }
  return null;
}

// Buffer fetches media from public URLs: the repo's public releases ("videos" for Reels, "tiktok" for carousel slides).
async function publicUrl(file, tag = 'videos', name = path.basename(file)) {
  const url = `https://github.com/${REPO}/releases/download/${tag}/${name}`;
  const head = await fetch(url, { method: 'HEAD', redirect: 'follow' }).catch(() => null);
  if (!head?.ok) {
    if (!process.env.GH_TOKEN) throw new Error(`${name} isn't in the ${tag} release and GH_TOKEN isn't set to upload it`);
    await run('gh', ['release', 'view', tag, '-R', REPO]).catch(() => run('gh', ['release', 'create', tag, '-R', REPO, '--title', tag, '--notes', 'Media for Buffer (TikTok cross-posts).']));
    const tmp = path.join(path.dirname(file), name);
    if (tmp !== file) fs.copyFileSync(file, tmp);
    await run('gh', ['release', 'upload', tag, tmp, '--clobber', '-R', REPO]);
  }
  return url;
}

async function create(input) {
  const data = await gql(`mutation($input: CreatePostInput!) { createPost(input: $input) {
      ... on PostActionSuccess { post { id dueAt } } ... on MutationError { message } } }`, { input });
  const r = data.createPost;
  if (!r?.post) throw new Error(`Buffer rejected the post: ${r?.message || JSON.stringify(r)}`);
  return r.post;
}
const log = (label, note) => fs.appendFileSync(path.join(ROOT, 'posted.log'), `${new Date().toISOString()}\t${label}\t${note}\n`);

export async function sendReelToBuffer(file, episode, { at = new Date(Date.now() + 3 * 60e3) } = {}) {
  const channelId = await channelFor('instagram');
  if (!channelId) throw new Error('no Instagram channel connected in Buffer');
  const url = await publicUrl(file);
  const post = await create({
    channelId, text: episode.igCaption || '', schedulingType: 'notification', mode: 'customScheduled',
    dueAt: at.toISOString(), needsApproval: false,
    assets: [{ video: { url, metadata: { thumbnailOffset: 1500 } } }],
    metadata: { instagram: { type: 'reel', shouldShareToFeed: true } },
  });
  console.log(`✔ Sent to Buffer as a reminder for ${new Date(post.dueAt || at).toISOString()} (owner adds music and posts)`);
  log(`buffer:${path.basename(file)}`, 'sent to Buffer (owner posts with music)');
  return post.id;
}

// TikTok through Buffer (TikTok connected as a Buffer channel). Owner's rule: nothing auto-posts to TikTok — music matters —
// so every Reel becomes a TikTok *reminder* in Buffer; the owner adds a trending sound in TikTok and posts.
// Carousels are skipped: Buffer can only auto-publish TikTok photo posts (no reminders for them).
// Never throws: a TikTok problem must not break the Instagram post.
export async function postToTikTok({ video, images, text = '', label, ai = false }) {
  if (!process.env.BUFFER_API_KEY) return;
  if (!video) return console.log('  (TikTok: carousels are not sent — Buffer can only auto-post TikTok photo posts)');
  try {
    const channelId = await channelFor('tiktok');
    if (!channelId) return console.log('  (TikTok: not connected in Buffer yet, skipped)');
    const post = await create({
      channelId, text: text.slice(0, 2200), needsApproval: false,
      assets: [{ video: { url: await publicUrl(video), metadata: { thumbnailOffset: 1500 } } }],
      schedulingType: 'notification', mode: 'customScheduled', dueAt: new Date(Date.now() + 3 * 60e3).toISOString(),
      metadata: { tiktok: { isAiGenerated: !!ai } },
    });
    console.log(`✔ TikTok reminder set in Buffer (owner adds music and posts) — ${post.id}`);
    log(`tiktok:${label}`, 'Buffer reminder (owner posts with music)');
  } catch (e) { console.log(`  (TikTok reminder failed: ${e.message.slice(0, 200)})`); }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [video, epDir] = process.argv.slice(2);
  if (!video) { console.error('Usage: node pipeline/buffer.mjs out/<id>.mp4 [episodes/<id>]'); process.exit(1); }
  const ep = readJSON(path.join(epDir || path.join(ROOT, 'episodes', path.basename(video, '.mp4')), 'episode.json'));
  await sendReelToBuffer(video, ep);
}
