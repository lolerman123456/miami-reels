// TruLoader weekly "highest paying lanes" Reel → TruLoader Facebook Page (separate brand from @getnearapp).
// Data: https://truloader.com/api/public/top-lanes (aggregated, public). Render: src/Lanes.tsx (Remotion).
// Post: Facebook Page Reels API with the Page token derived from TRULOADER_FB_TOKEN (user token of the Page admin).
//   node pipeline/truloader.mjs [--dry-run] [--equipment flatbed] [--count 10]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, run, writeJSON, readJSON, step } from './util.mjs';
import { formatCaption } from './caption.mjs';

const API = 'https://truloader.com/api/public/top-lanes';
const BRAND = 'https://truloader.com/brand';
const PAGE_ID = process.env.TRULOADER_FB_PAGE_ID || '605976209261182'; // "TruLoader" Facebook Page
const GRAPH = 'https://graph.facebook.com/v21.0';
const FPS = 30;

// Albers USA (lower 48), identical to d3.geoAlbersUsa().scale(1300).translate([487.5, 305]),
// the projection assets/truloader/us-states.json was drawn with.
const R = Math.PI / 180, P1 = 29.5 * R, P2 = 45.5 * R, N = (Math.sin(P1) + Math.sin(P2)) / 2;
const C = Math.cos(P1) ** 2 + 2 * N * Math.sin(P1);
const rho = (phi) => Math.sqrt(C - 2 * N * Math.sin(phi)) / N;
const raw = (lng, lat) => { const l = (lng + 96) * R, r = rho(lat * R); return [r * Math.sin(N * l), rho(0) - r * Math.cos(N * l)]; };
const [XC, YC] = raw(-96.6, 38.7); // d3 center(-0.6, 38.7) in rotated coordinates
export function project(lng, lat) { const [x, y] = raw(lng, lat); return { x: 487.5 + 1300 * (x - XC), y: 305 - 1300 * (y - YC) }; }

const fmtDay = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const EQUIP = { flatbed: 'flatbed', 'dry van': 'dry van', dry_van: 'dry van', reefer: 'reefer', step_deck: 'step deck', 'step deck': 'step deck', power_only: 'power only', 'power only': 'power only' };

async function getJSON(url) {
  const r = await fetch(url, { headers: { 'user-agent': 'reel-bot' } });
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return r.json();
}
async function download(url, file) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
}

export async function buildProps(data, brand, count = 10) {
  const inLower48 = (p) => p && p.lat > 24 && p.lat < 50 && p.lng > -125 && p.lng < -66;
  const lanes = (data.lanes || []).filter(l => inLower48(l.origin) && inLower48(l.destination) && l.avgRatePerMile > 0)
    .slice(0, count)
    .map((l) => ({
      rank: l.rank,
      from: { ...project(l.origin.lng, l.origin.lat), label: `${l.origin.city}, ${l.origin.state}` },
      to: { ...project(l.destination.lng, l.destination.lat), label: `${l.destination.city}, ${l.destination.state}` },
      rate: `$${Number(l.avgRatePerMile).toFixed(2)}`,
      sub: [`${l.loadCount} loads`, l.equipment && EQUIP[l.equipment] || l.equipment, l.miles && `${l.miles} mi`,
        typeof l.changeVsLastWeekPct === 'number' && `${l.changeVsLastWeekPct > 0 ? '▲' : '▼'} ${Math.abs(l.changeVsLastWeekPct).toFixed(0)}% vs last week`]
        .filter(Boolean).join(' · '),
    }))
    .reverse(); // countdown: lowest rank number last (#1 is the payoff)
  if (lanes.length < 3) throw new Error(`only ${lanes.length} usable lanes this week — not making a Reel`);
  const map = readJSON(path.join(ROOT, 'assets', 'truloader', 'us-states.json'));
  const hookFrames = 75, laneFrames = 66, outroFrames = 120;
  return {
    durationInFrames: hookFrames + lanes.length * laneFrames + outroFrames,
    hookFrames, laneFrames, outroFrames,
    states: map.states.map(s => ({ d: s.d })), mapW: map.w, mapH: map.h,
    week: `${fmtDay(data.weekStart)} – ${fmtDay(data.weekEnd)}`.toUpperCase(),
    title: [`TOP ${lanes.length} HIGHEST`, 'PAYING LANES'],
    lanes,
    colors: { primary: brand.primary || '#0066FF', secondary: brand.secondary || '#0B1220', accent: brand.accent || '#FDC902' },
    cta: 'Every load board in one feed — with a broker check on every load.',
    site: 'truloader.com',
    narration: null,
  };
}

export function captionFor(data, props) {
  const top = [...props.lanes].reverse();
  const lines = top.slice(0, 5).map(l => `#${l.rank} ${l.from.label} → ${l.to.label}: ${l.rate}/mi`);
  return formatCaption([
    `Highest paying lanes this week (${fmtDay(data.weekStart)} – ${fmtDay(data.weekEnd)}) 🚛💰`,
    '',
    ...lines,
    '',
    'Average posted rates across the load boards Truloader watches. See every load in one feed, check the broker, and call in one tap → truloader.com (3-day free trial)',
    '',
    '#trucking #freight #dispatcher #owneroperator',
  ].join('\n'));
}

// ---------- Facebook Page Reels ----------
async function graph(pathname, params = {}, method = 'GET') {
  const url = new URL(`${GRAPH}/${pathname}`);
  const body = new URLSearchParams(params);
  const r = method === 'GET' ? await fetch(`${url}?${body}`) : await fetch(url, { method, body });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(`Graph ${pathname}: ${JSON.stringify(j.error || j).slice(0, 400)}`);
  return j;
}

export async function pageToken() {
  const user = process.env.TRULOADER_FB_TOKEN;
  if (!user) throw new Error('TRULOADER_FB_TOKEN secret is missing');
  const pages = await graph('me/accounts', { fields: 'id,name,access_token', limit: '100', access_token: user }).catch(() => null);
  const hit = pages?.data?.find(p => p.id === PAGE_ID);
  if (hit?.access_token) return { token: hit.access_token, name: hit.name };
  // The secret may already be a Page token.
  const me = await graph('me', { fields: 'id,name', access_token: user });
  if (me.id === PAGE_ID) return { token: user, name: me.name };
  throw new Error(`token can't see Page ${PAGE_ID} (sees: ${(pages?.data || []).map(p => p.name).join(', ') || me.name})`);
}

export async function postPageReel(file, description) {
  const { token, name } = await pageToken();
  console.log(`Posting to Facebook Page "${name}"`);
  const start = await graph(`${PAGE_ID}/video_reels`, { upload_phase: 'start', access_token: token }, 'POST');
  const size = fs.statSync(file).size;
  const up = await fetch(start.upload_url || `https://rupload.facebook.com/video-upload/v21.0/${start.video_id}`, {
    method: 'POST', headers: { Authorization: `OAuth ${token}`, offset: '0', file_size: String(size) }, body: fs.readFileSync(file),
  });
  const uj = await up.json().catch(() => ({}));
  if (!up.ok || uj.success === false) throw new Error(`upload failed: ${JSON.stringify(uj).slice(0, 300)}`);
  await graph(`${PAGE_ID}/video_reels`, { upload_phase: 'finish', video_id: start.video_id, video_state: 'PUBLISHED', description, access_token: token }, 'POST');
  // Wait until Facebook finishes processing, so a failed publish shows up in the run.
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 15000));
    const s = await graph(start.video_id, { fields: 'status,permalink_url', access_token: token }).catch(() => null);
    const st = s?.status?.video_status, pub = s?.status?.publishing_phase?.status;
    console.log(`  status: ${st} / publishing: ${pub}`);
    if (st === 'error' || pub === 'error') throw new Error(`Facebook processing failed: ${JSON.stringify(s.status).slice(0, 400)}`);
    if (st === 'ready' && pub === 'complete') return { id: start.video_id, url: s.permalink_url ? `https://www.facebook.com${s.permalink_url}` : `https://www.facebook.com/${start.video_id}` };
  }
  return { id: start.video_id, url: `https://www.facebook.com/${start.video_id}`, pending: true };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const eq = args.includes('--equipment') ? args[args.indexOf('--equipment') + 1] : '';
  const count = args.includes('--count') ? Number(args[args.indexOf('--count') + 1]) : 10;

  step('Fetching this week’s lanes');
  const data = await getJSON(eq ? `${API}?equipment=${encodeURIComponent(eq)}` : API);
  const brand = await getJSON(`${BRAND}/brand.json`).catch(() => ({}));
  const id = `${data.weekStart}${eq ? `-${eq}` : ''}`;
  const dir = path.join(ROOT, 'out', 'truloader', id);
  fs.mkdirSync(dir, { recursive: true });
  const props = await buildProps(data, brand, count);
  writeJSON(path.join(dir, 'data.json'), data);
  writeJSON(path.join(dir, 'props.json'), props);
  await download(`${BRAND}/logo-white.png`, path.join(dir, 'logo-white.png'));
  fs.cpSync(path.join(ROOT, 'assets', 'fonts'), path.join(dir, 'fonts'), { recursive: true });
  fs.cpSync(path.join(ROOT, 'assets', 'sfx'), path.join(dir, 'sfx'), { recursive: true });

  step('Rendering');
  const out = path.join(dir, 'reel.mp4');
  const local = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
  await run('npx', ['remotion', 'render', 'src/index.ts', 'Lanes', out, `--props=${path.join(dir, 'props.json')}`, `--public-dir=${dir}`,
    '--codec=h264', '--crf=20', '--audio-bitrate=192k', ...(!process.env.CI && fs.existsSync(local) ? [`--browser-executable=${local}`] : [])]);
  const caption = captionFor(data, props);
  const post = { id: `truloader-${id}`, week: [data.weekStart, data.weekEnd], video: out, caption };
  writeJSON(path.join(dir, 'post.json'), post);
  console.log(`✔ ${out}\n\n${caption}\n`);
  if (dryRun) {
    if (process.env.TRULOADER_FB_TOKEN) {
      try { const t = await pageToken(); console.log(`Facebook token check: OK, can post to "${t.name}"`); }
      catch (e) { console.log(`Facebook token check: FAILED, ${e.message}`); }
    } else console.log('Facebook token check: TRULOADER_FB_TOKEN not set');
    console.log('(dry run) not posted'); return post;
  }

  step('Posting to the TruLoader Facebook Page');
  const res = await postPageReel(out, caption);
  post.posted = res;
  writeJSON(path.join(dir, 'post.json'), post);
  fs.appendFileSync(path.join(ROOT, 'posted.log'), `${new Date().toISOString()}\ttruloader:${id}\t${res.url}\n`);
  console.log(`✔ posted ${res.url}${res.pending ? ' (still processing)' : ''}`);
  return post;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error(e); process.exit(1); });
}
