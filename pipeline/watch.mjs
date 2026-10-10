// Watch competitor/reference accounts (owner, Oct 10: "see what @onlyindade posts … hour by hour … so you copy").
// Uses the official Instagram Graph API "business_discovery" field (public posts of another Business/Creator account,
// read with OUR token: FB_ACCESS_TOKEN → the "NEAR APP" Page → @getnearapp). No scraping, no logging in.
// Accounts: control.json → "watchAccounts" (default ["onlyindade"]).
// Writes state/watch/<user>.jsonl (one line per post, newest metrics win) and state/watch/<user>.md (the last 30, readable).
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const VERSION = 'v23.0';
const api = `https://graph.facebook.com/${VERSION}`;
const token = process.env.FB_ACCESS_TOKEN;
if (!token) { console.error('FB_ACCESS_TOKEN not set'); process.exit(1); }

const control = JSON.parse(fs.readFileSync(path.join(ROOT, 'control.json'), 'utf8'));
const accounts = Array.isArray(control.watchAccounts) && control.watchAccounts.length ? control.watchAccounts : ['onlyindade'];
const outDir = path.join(ROOT, 'state', 'watch');
fs.mkdirSync(outDir, { recursive: true });

const get = async url => { const r = await (await fetch(url)).json(); if (r.error) throw new Error(r.error.message); return r; };
const pages = await get(`${api}/me/accounts?fields=instagram_business_account&access_token=${token}`);
const igUser = (pages.data || []).map(p => p.instagram_business_account?.id).find(Boolean);
if (!igUser) { console.error('No Instagram business account on the token\'s Pages'); process.exit(1); }

const ny = t => new Date(t).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const kind = m => m.media_product_type === 'REELS' ? 'Reel' : m.media_type === 'CAROUSEL_ALBUM' ? 'Carousel' : m.media_type === 'VIDEO' ? 'Video' : 'Photo';

for (const user of accounts) {
  const fields = `business_discovery.username(${user}){username,followers_count,media_count,media.limit(30){id,caption,media_type,media_product_type,timestamp,like_count,comments_count,permalink}}`;
  let bd;
  try { bd = (await get(`${api}/${igUser}?fields=${encodeURIComponent(fields)}&access_token=${token}`)).business_discovery; }
  catch (e) { console.error(`  ${user}: ${e.message}`); continue; }
  const media = bd?.media?.data || [];
  const file = path.join(outDir, `${user}.jsonl`);
  const known = new Map();
  if (fs.existsSync(file)) for (const l of fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)) { try { const o = JSON.parse(l); known.set(o.id, o); } catch {} }
  let fresh = 0;
  for (const m of media) {
    if (!known.has(m.id)) fresh++;
    known.set(m.id, { id: m.id, at: m.timestamp, type: kind(m), likes: m.like_count ?? null, comments: m.comments_count ?? null, url: m.permalink, caption: (m.caption || '').slice(0, 600), seen: known.get(m.id)?.seen || new Date().toISOString() });
  }
  const all = [...known.values()].sort((a, b) => b.at.localeCompare(a.at));
  fs.writeFileSync(file, all.map(o => JSON.stringify(o)).join('\n') + '\n');
  const md = [`# @${user} — ${bd.followers_count?.toLocaleString?.() ?? '?'} followers, ${bd.media_count ?? '?'} posts (checked ${ny(Date.now())} NY)`, '',
    '| Posted (NY) | Type | Likes | Comments | Caption (first line) |', '|---|---|---|---|---|',
    ...all.slice(0, 30).map(o => `| [${ny(o.at)}](${o.url}) | ${o.type} | ${o.likes ?? '—'} | ${o.comments ?? '—'} | ${(o.caption.split('\n')[0] || '').replace(/\|/g, '/').slice(0, 110)} |`)].join('\n');
  fs.writeFileSync(path.join(outDir, `${user}.md`), md + '\n');
  console.log(`  @${user}: ${media.length} recent posts, ${fresh} new`);
}
