// Buffer: TikTok reminders for every Reel (owner adds music in TikTok and posts), plus the hand-off for music Reels.
// Instagram music Reels aren't posted by the bot at all: handToOwner() logs the public video link for the owner.
// Needs the BUFFER_API_KEY secret for TikTok (Buffer → Settings → API).
import fs from 'node:fs';
import path from 'node:path';
import { readJSON, ROOT, run } from './util.mjs';

const API = 'https://api.buffer.com';
const REPO = process.env.GITHUB_REPOSITORY || 'lolerman123456/miami-reels';

export const wantsMusic = episode => !!episode?.music;

// Buffer sometimes answers with an HTML error page (gateway hiccup): retry a few times before giving up.
async function gql(query, variables = {}) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${process.env.BUFFER_API_KEY}` },
      body: JSON.stringify({ query, variables }),
    });
    const txt = await res.text();
    let j = null;
    try { j = JSON.parse(txt); } catch {}
    if (j && res.ok && !j.errors) return j.data;
    const why = j ? JSON.stringify(j.errors || j).slice(0, 300) : `HTTP ${res.status}: ${txt.replace(/\s+/g, ' ').slice(0, 200)}`;
    if (attempt >= 4 || (j && res.status < 500 && res.status !== 429)) throw new Error(`Buffer API: ${why}`);
    console.log(`  (Buffer attempt ${attempt} failed: ${why}; retrying)`);
    await new Promise(r => setTimeout(r, attempt * 10000));
  }
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
  // Owner found Buffer confusing: with control.json "tiktokBuffer": false nothing goes to Buffer. The media goes to the
  // public release and a "tiktok-pick:" line (label, links, caption's first line) lands in posted.log; Claude sends the owner
  // a plain TikTok list (links + caption + time) and the owner posts from the phone.
  let control = {};
  try { control = readJSON(path.join(ROOT, 'control.json')); } catch {}
  if (control.tiktokBuffer === false) {
    try {
      const links = video ? [await publicUrl(video)] : await Promise.all(images.slice(0, 10).map(f => publicUrl(f, 'tiktok', `${label}-${path.basename(f)}`)));
      log(`tiktok-pick:${label}`, `${links.join(' ')}\t${text.split('\n')[0].slice(0, 140)}`);
      console.log(`✔ TikTok pick saved for the owner (${links.length} file${links.length > 1 ? 's' : ''})`);
    } catch (e) { console.log(`  (TikTok pick failed: ${e.message.slice(0, 200)})`); }
    return;
  }
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
      // TikTok photo posts can't carry the AI-content flag (Buffer rejects the whole post, Sep 30): only videos send it
      metadata: { tiktok: images ? { title } : { isAiGenerated: !!ai } },
    });
    console.log(`✔ TikTok reminder set in Buffer (${video ? 'video' : `${assets.length}-photo slideshow`}) — ${post.id}`);
    log(`tiktok:${label}`, 'Buffer reminder (owner posts with music)');
  } catch (e) { console.log(`  (TikTok reminder failed: ${e.message.slice(0, 200)})`); }
}

// A whole day's TikTok schedule at once (owner, Sep 29: "too much to track"): each item becomes a Buffer reminder at its time.
// requests/tiktok-batch.json → {"items":[{"label":"…","video":"URL or path" | "images":["URL or path", …],"text":"caption","at":"ISO"}]}
export async function tiktokBatch(file) {
  const { items = [] } = readJSON(file);
  const channelId = await channelFor('tiktok');
  if (!channelId) throw new Error('TikTok is not connected in Buffer');
  const url = (f, tag, name) => /^https?:/.test(f) ? f : publicUrl(path.resolve(ROOT, f), tag, name);
  let ok = 0;
  for (const it of items) {
    try {
      const assets = it.video
        ? [{ video: { url: await url(it.video, 'videos', path.basename(it.video)), metadata: { thumbnailOffset: 1500 } } }]
        : await Promise.all(it.images.slice(0, 10).map(async f => ({ image: { url: await url(f, 'tiktok', `${it.label}-${path.basename(f)}`) } })));
      const dueAt = new Date(Math.max(Date.parse(it.at) || 0, Date.now() + 3 * 60e3)).toISOString();
      const title = it.text.split('\n')[0].replace(/#\w+/g, '').trim().slice(0, 90);
      const post = await create({
        channelId, text: it.text.slice(0, 2200), needsApproval: false, assets,
        schedulingType: 'notification', mode: 'customScheduled', dueAt,
        metadata: { tiktok: it.images ? { title } : { isAiGenerated: false } },
      });
      console.log(`✔ ${it.label} → Buffer reminder due ${dueAt} (${post.id})`);
      log(`tiktok:${it.label}`, `Buffer reminder due ${dueAt}`);
      ok++;
    } catch (e) { console.log(`  ✗ ${it.label}: ${e.message.slice(0, 200)}`); }
  }
  if (!ok && items.length) throw new Error('No TikTok reminders could be created');
}

// What Buffer actually has for TikTok (status, notification, errors): node pipeline/buffer.mjs --status
export async function tiktokStatus(n = 20) {
  const channelId = await channelFor('tiktok');
  const { account } = await gql('query { account { organizations { id } } }');
  for (const org of account.organizations) {
    const d = await gql(`query($o: OrganizationId!, $c: [ChannelId!]) { posts(first: ${n}, input: { organizationId: $o, filter: { channelIds: $c } }) {
      edges { node { id status schedulingType notificationStatus dueAt sentAt createdAt text error { message } assets { __typename } } } } }`, { o: org.id, c: [channelId] }).catch(e => ({ err: e.message }));
    if (d.err) { console.log(d.err); continue; }
    for (const { node: p } of d.posts.edges) console.log(`${p.createdAt}  ${p.status}  ${p.schedulingType}  notif=${p.notificationStatus || '-'}  due=${p.dueAt}  assets=${(p.assets || []).length}  ${(p.text || '').split('\n')[0].slice(0, 50)}${p.error ? '  ERROR: ' + p.error.message : ''}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes('--status')) { await tiktokStatus(); process.exit(0); }
  if (process.argv[2] === '--batch') { await tiktokBatch(process.argv[3] || path.join(ROOT, 'requests/tiktok-batch.json')); await tiktokStatus(12); process.exit(0); }
  const [video, epDir] = process.argv.slice(2);
  if (!video) { console.error('Usage: node pipeline/buffer.mjs out/<id>.mp4 [episodes/<id>]  (TikTok reminder)'); process.exit(1); }
  const ep = readJSON(path.join(epDir || path.join(ROOT, 'episodes', path.basename(video, '.mp4')), 'episode.json'));
  await postToTikTok({ video, text: ep.igCaption, label: path.basename(video, '.mp4') });
}
