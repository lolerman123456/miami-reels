// Buffer: TikTok reminders for every Reel (owner adds music in TikTok and posts), plus the hand-off for music Reels.
// Instagram music Reels aren't posted by the bot at all: handToOwner() logs the public video link for the owner.
// Needs the BUFFER_API_KEY secret for TikTok (Buffer → Settings → API).
import fs from 'node:fs';
import path from 'node:path';
import { readJSON, ROOT, run } from './util.mjs';

const API = 'https://api.buffer.com';
const REPO = process.env.GITHUB_REPOSITORY || 'lolerman123456/miami-reels';

export const wantsMusic = episode => !!episode?.music;

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

// Music Reels aren't auto-posted to Instagram: the owner posts them from the app with a trending sound.
// Make sure the video is in the public release and log a "music:" line; Claude's check-ins send the owner the link.
export async function handToOwner(file, episode) {
  const url = await publicUrl(file);
  console.log(`✔ Music Reel, not auto-posted: ${url} (owner posts it on Instagram with a trending sound)`);
  log(`music:${path.basename(file, '.mp4')}`, url);
  return url;
}

// TikTok through Buffer (TikTok connected as a Buffer channel). Owner's rule: nothing auto-posts to TikTok (music matters),
// so everything goes in as a TikTok *reminder*: Buffer pings the owner, they add a sound in TikTok and post.
// video → a Reel; images → a photo slideshow (carousels listed in control.json "tiktokCarousels").
// Never throws: a TikTok problem must not break the Instagram post.
export async function postToTikTok({ video, images, text = '', label, ai = false }) {
  if (!process.env.BUFFER_API_KEY) return;
  try {
    const channelId = await channelFor('tiktok');
    if (!channelId) return console.log('  (TikTok: not connected in Buffer yet, skipped)');
    const assets = video
      ? [{ video: { url: await publicUrl(video), metadata: { thumbnailOffset: 1500 } } }]
      : await Promise.all(images.slice(0, 10).map(async f => ({ image: { url: await publicUrl(f, 'tiktok', `${label}-${path.basename(f)}`) } })));
    const title = text.split('\n')[0].replace(/#\w+/g, '').trim().slice(0, 90);
    const post = await create({
      channelId, text: text.slice(0, 2200), needsApproval: false, assets,
      schedulingType: 'notification', mode: 'customScheduled', dueAt: new Date(Date.now() + 3 * 60e3).toISOString(),
      metadata: { tiktok: { ...(images ? { title } : {}), isAiGenerated: !!ai } },
    });
    console.log(`✔ TikTok reminder set in Buffer (${video ? 'video' : `${assets.length}-photo slideshow`}) — ${post.id}`);
    log(`tiktok:${label}`, 'Buffer reminder (owner posts with music)');
  } catch (e) { console.log(`  (TikTok reminder failed: ${e.message.slice(0, 200)})`); }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [video, epDir] = process.argv.slice(2);
  if (!video) { console.error('Usage: node pipeline/buffer.mjs out/<id>.mp4 [episodes/<id>]  (TikTok reminder)'); process.exit(1); }
  const ep = readJSON(path.join(epDir || path.join(ROOT, 'episodes', path.basename(video, '.mp4')), 'episode.json'));
  await postToTikTok({ video, text: ep.igCaption, label: path.basename(video, '.mp4') });
}
