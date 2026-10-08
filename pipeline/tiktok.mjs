// TikTok: connect @getnearapp once (Login Kit), then post our Reels (Content Posting API).
//   node pipeline/tiktok.mjs server            → "NEAR Publisher" backend for the web page (docs/tiktok/), behind a public tunnel
//   node pipeline/tiktok.mjs draft <mp4> <title> → send a video to the account's TikTok drafts/inbox (owner taps Post in the app)
// The TikTok token lives in state/tiktok-token.enc, encrypted with a key derived from the TIKTOK_CLIENT_SECRET secret.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execSync } from 'node:child_process';
import { ROOT } from './util.mjs';

export const CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY || 'sbawp0oa8vn1ux5ht8'; // public identifier, not a secret
export const REDIRECT = 'https://lolerman123456.github.io/miami-reels/tiktok/';
const API = 'https://open.tiktokapis.com/v2';
const TOKEN_FILE = path.join(ROOT, 'state', 'tiktok-token.enc');
const SECRET = () => { const s = process.env.TIKTOK_CLIENT_SECRET; if (!s) throw new Error('TIKTOK_CLIENT_SECRET secret is missing'); return s; };

// ---- encrypted token store --------------------------------------------------------------------------
const keyOf = () => crypto.createHash('sha256').update('near-tiktok:' + SECRET()).digest();
function saveToken(tok) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', keyOf(), iv);
  const data = Buffer.concat([c.update(JSON.stringify(tok)), c.final()]);
  fs.mkdirSync(path.dirname(TOKEN_FILE), { recursive: true });
  fs.writeFileSync(TOKEN_FILE, Buffer.concat([iv, c.getAuthTag(), data]).toString('base64') + '\n');
}
function loadToken() {
  if (!fs.existsSync(TOKEN_FILE)) return null;
  const raw = Buffer.from(fs.readFileSync(TOKEN_FILE, 'utf8').trim(), 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', keyOf(), raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(12, 28));
  return JSON.parse(Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString());
}

async function oauth(params) {
  const res = await fetch(`${API}/oauth/token/`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_key: CLIENT_KEY, client_secret: SECRET(), ...params }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error(`TikTok token error: ${JSON.stringify(j).slice(0, 300)}`);
  const tok = { ...j, obtained: Date.now() };
  saveToken(tok);
  return tok;
}
export const exchangeCode = code => oauth({ code, grant_type: 'authorization_code', redirect_uri: REDIRECT });

export async function accessToken() {
  const t = loadToken();
  if (!t) throw new Error('TikTok is not connected yet (open the NEAR Publisher page and connect)');
  if (Date.now() < t.obtained + (t.expires_in - 600) * 1000) return t.access_token;
  return (await oauth({ grant_type: 'refresh_token', refresh_token: t.refresh_token })).access_token;
}

async function call(p, body, token) {
  const res = await fetch(`${API}${p}`, {
    method: 'POST', headers: { Authorization: `Bearer ${token || await accessToken()}`, 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify(body || {}),
  });
  const j = await res.json();
  if (j.error && j.error.code !== 'ok') throw new Error(`TikTok ${p}: ${j.error.code} ${j.error.message}`);
  return j.data;
}

export const creatorInfo = () => call('/post/publish/creator_info/query/');

// Upload one mp4 (single chunk, < 64 MB). mode "direct" publishes with the chosen settings; "draft" sends it to the inbox.
export async function uploadVideo(file, { mode = 'draft', title = '', privacy, disableComment = false, disableDuet = false, disableStitch = false, brandOrganic = false, brandContent = false } = {}) {
  const size = fs.statSync(file).size;
  const source_info = { source: 'FILE_UPLOAD', video_size: size, chunk_size: size, total_chunk_count: 1 };
  const data = mode === 'direct'
    ? await call('/post/publish/video/init/', { post_info: { title: title.slice(0, 2200), privacy_level: privacy, disable_comment: disableComment, disable_duet: disableDuet, disable_stitch: disableStitch, brand_organic_toggle: brandOrganic, brand_content_toggle: brandContent }, source_info })
    : await call('/post/publish/inbox/video/init/', { source_info });
  const put = await fetch(data.upload_url, { method: 'PUT', headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(size), 'Content-Range': `bytes 0-${size - 1}/${size}` }, body: fs.readFileSync(file) });
  if (!put.ok) throw new Error(`TikTok upload failed: ${put.status} ${(await put.text()).slice(0, 200)}`);
  return data.publish_id;
}
export const publishStatus = id => call('/post/publish/status/fetch/', { publish_id: id });

// ---- NEAR Publisher backend (for the page in docs/tiktok/) --------------------------------------------
async function server() {
  const ORIGIN = 'https://lolerman123456.github.io';
  const videos = () => { // our rendered Reels (downloaded into out/tiktok by the workflow)
    const dir = path.join(ROOT, 'out', 'tiktok');
    return fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.mp4')).sort().reverse().map(f => {
      const id = f.replace(/\.mp4$/, ''); let title = id;
      try { title = JSON.parse(fs.readFileSync(path.join(ROOT, 'episodes', id, 'episode.json'), 'utf8')).title; } catch {}
      return { id, title, file: path.join(dir, f) };
    }) : [];
  };
  const caption = id => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'episodes', id, 'episode.json'), 'utf8')).igCaption || ''; } catch { return ''; } };
  const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': ORIGIN }); res.end(JSON.stringify(obj)); };
  const body = req => new Promise(r => { let s = ''; req.on('data', d => (s += d)); req.on('end', () => { try { r(JSON.parse(s || '{}')); } catch { r({}); } }); });

  const srv = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': ORIGIN, 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET, POST' }); return res.end(); }
    try {
      if (url.pathname === '/exchange' && req.method === 'POST') { await exchangeCode((await body(req)).code); commitToken(); return json(res, 200, { ok: true }); }
      if (url.pathname === '/creator') return json(res, 200, await creatorInfo());
      if (url.pathname === '/videos') return json(res, 200, videos().map(v => ({ id: v.id, title: v.title, caption: caption(v.id) })));
      if (url.pathname.startsWith('/video/')) {
        const v = videos().find(x => x.id === decodeURIComponent(url.pathname.slice(7)));
        if (!v) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Type': 'video/mp4', 'Access-Control-Allow-Origin': ORIGIN, 'Content-Length': fs.statSync(v.file).size });
        return fs.createReadStream(v.file).pipe(res);
      }
      if (url.pathname === '/publish' && req.method === 'POST') {
        const b = await body(req);
        const v = videos().find(x => x.id === b.id);
        if (!v) return json(res, 404, { error: 'unknown video' });
        const id = await uploadVideo(v.file, { mode: 'direct', title: b.title, privacy: b.privacy, disableComment: !b.comment, disableDuet: !b.duet, disableStitch: !b.stitch, brandOrganic: !!b.yourBrand, brandContent: !!b.branded });
        return json(res, 200, { publish_id: id });
      }
      if (url.pathname === '/status') return json(res, 200, await publishStatus(url.searchParams.get('id')));
      json(res, 404, { error: 'not found' });
    } catch (e) { console.log('  error:', e.message); json(res, 500, { error: e.message }); }
  });
  await new Promise(r => srv.listen(8787, '127.0.0.1', r));
  const cf = spawn(process.env.CLOUDFLARED_BIN || 'cloudflared', ['tunnel', '--no-autoupdate', '--url', 'http://127.0.0.1:8787'], { stdio: ['ignore', 'pipe', 'pipe'] });
  const base = await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('tunnel did not start')), 60000);
    const on = d => { const m = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(String(d)); if (m) { clearTimeout(t); resolve(m[0]); } };
    cf.stdout.on('data', on); cf.stderr.on('data', on);
  });
  // tell the page where the backend is (it reads this file through the GitHub API)
  fs.writeFileSync(path.join(ROOT, 'state', 'tiktok-server.json'), JSON.stringify({ url: base, until: Date.now() + 40 * 60e3 }) + '\n');
  git(['add', 'state/tiktok-server.json'], 'NEAR Publisher online');
  console.log(`▶ NEAR Publisher backend: ${base} (open ${REDIRECT})`);
  await new Promise(r => setTimeout(r, 40 * 60e3)); // stay up 40 minutes
  cf.kill(); srv.close();
}
function commitToken() { git(['add', 'state/tiktok-token.enc'], 'TikTok connected (encrypted token)'); }
function git(add, msg) {
  try {
    execSync(`git config user.name reel-bot && git config user.email reel-bot@users.noreply.github.com && git ${add.join(' ')} && git commit -qm "${msg}" && (git pull -q --rebase || true) && git push -q`, { cwd: ROOT, stdio: 'inherit' });
  } catch (e) { console.log('  (git:', e.message.slice(0, 120), ')'); }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, ...a] = process.argv.slice(2);
  if (cmd === 'server') await server();
  else if (cmd === 'draft') {
    const id = await uploadVideo(a[0], { mode: 'draft' }); console.log('✔ sent to TikTok drafts:', id);
    for (let i = 0; i < 12; i++) { // the inbox upload is processed async: SEND_TO_USER_INBOX = it's in the app's inbox notifications
      await new Promise(r => setTimeout(r, 10e3));
      const s = await publishStatus(id).catch(e => ({ status: 'error: ' + e.message }));
      console.log('  status:', JSON.stringify(s));
      if (/SEND_TO_USER_INBOX|PUBLISH_COMPLETE|FAILED|error/.test(s.status || '')) break;
    }
    if (fs.existsSync(TOKEN_FILE)) commitToken();
  }
  else { console.error('Usage: tiktok.mjs server | draft <mp4>'); process.exit(1); }
}
