// Account + per-post stats for the weekly growth review → state/stats.json (followers, and reach/likes/comments/saves/shares per post).
//   node pipeline/stats.mjs [days=8]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './util.mjs';

const token = process.env.INSTAGRAM_ACCESS_TOKEN, igUser = process.env.INSTAGRAM_USER_ID;
const api = `https://${token.startsWith('IG') ? 'graph.instagram.com' : 'graph.facebook.com'}/v23.0`;
const get = async (p) => { const j = await (await fetch(`${api}/${p}${p.includes('?') ? '&' : '?'}access_token=${token}`)).json(); if (j.error) throw new Error(j.error.message); return j; };

const days = Number(process.argv[2] || 8), since = Date.now() - days * 86400e3;
const account = await get(`${igUser}?fields=username,followers_count,follows_count,media_count`);
const posts = [];
for (let url = `${igUser}/media?fields=id,caption,media_type,media_product_type,timestamp,permalink,like_count,comments_count&limit=50`; url;) {
  const page = await get(url);
  const fresh = (page.data || []).filter(m => Date.parse(m.timestamp.replace(/([+-]\d\d)(\d\d)$/, '$1:$2')) >= since);
  posts.push(...fresh);
  url = fresh.length === (page.data || []).length && page.paging?.cursors?.after ? `${igUser}/media?fields=id,caption,media_type,media_product_type,timestamp,permalink,like_count,comments_count&limit=50&after=${page.paging.cursors.after}` : null;
}
for (const m of posts) {
  try {
    const ins = await get(`${m.id}/insights?metric=reach,views,saved,shares,total_interactions`);
    for (const x of ins.data || []) m[x.name] = x.values?.[0]?.value ?? x.total_value?.value;
  } catch (e) { m.insightsError = e.message.slice(0, 120); }
  m.caption = (m.caption || '').split('\n')[0].slice(0, 90);
}
const out = { at: new Date().toISOString(), days, account, posts };
fs.writeFileSync(path.join(ROOT, 'state', 'stats.json'), JSON.stringify(out, null, 1) + '\n');
console.log(`@${account.username}: ${account.followers_count} followers, ${posts.length} posts in ${days} days`);
for (const m of [...posts].sort((a, b) => (b.reach || b.views || 0) - (a.reach || a.views || 0)))
  console.log(`${m.timestamp.slice(0, 16)} ${m.media_product_type || m.media_type} reach=${m.reach ?? '?'} views=${m.views ?? '?'} likes=${m.like_count} com=${m.comments_count} saves=${m.saved ?? '?'} shares=${m.shares ?? '?'} ${m.caption}`);

// Peek at another public account's latest posts (owner, Sep 30: "see onlyindade without the Meta developer bs").
// Uses Instagram's business discovery with our own token; requests/stats.json "peek": "username". Officially it needs a
// Facebook-login token, so with an Instagram-login token it may be refused — then we say so and keep using fetchViral.
let peek = null;
try { peek = JSON.parse(fs.readFileSync(path.join(ROOT, 'requests', 'stats.json'), 'utf8')).peek; } catch {}
if (peek) {
  try {
    const j = await get(`${igUser}?fields=business_discovery.username(${peek}){username,followers_count,media_count,media.limit(12){caption,like_count,comments_count,timestamp,permalink,media_type}}`);
    const bd = j.business_discovery;
    fs.writeFileSync(path.join(ROOT, 'state', `peek-${peek}.json`), JSON.stringify({ at: new Date().toISOString(), ...bd }, null, 1) + '\n');
    console.log(`\n✔ @${bd.username}: ${bd.followers_count} followers; latest posts:`);
    for (const m of bd.media?.data || []) console.log(`  ${m.timestamp}  ${m.like_count ?? '?'}♥ ${m.comments_count ?? '?'}💬  ${(m.caption || '').split('\n')[0].slice(0, 80)}`);
  } catch (e) { console.log(`\n✗ business discovery for @${peek} not allowed with this token: ${e.message.slice(0, 200)}`); }
}
