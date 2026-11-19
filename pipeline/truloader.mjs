// TruLoader weekly "highest paying lanes" Reel → TruLoader Facebook Page (separate brand from @getnearapp).
// Data: https://truloader.com/api/public/top-lanes (aggregated, public). Render: src/Lanes.tsx (Remotion).
// Post: Facebook Page Reels API with the Page token derived from TRULOADER_FB_TOKEN (user token of the Page admin).
//   node pipeline/truloader.mjs [--dry-run] [--equipment flatbed] [--count 10]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, run, writeJSON, readJSON, step } from './util.mjs';

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

export async function getJSON(url) {
  const r = await fetch(url, { headers: { 'user-agent': 'reel-bot' } });
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return r.json();
}
export async function download(url, file) {
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
  if (lanes.length < Math.min(3, count)) throw new Error(`only ${lanes.length} usable lanes this week — not making a Reel`);
  const map = readJSON(path.join(ROOT, 'assets', 'truloader', 'us-states.json'));
  const hookFrames = 75, laneFrames = 66, outroFrames = 120;
  return {
    durationInFrames: hookFrames + lanes.length * laneFrames + outroFrames,
    hookFrames, laneFrames, outroFrames,
    states: map.states.map(s => ({ d: s.d })), mapW: map.w, mapH: map.h,
    week: `${fmtDay(data.weekStart)} – ${fmtDay(data.weekEnd)}`.toUpperCase(),
    title: lanes.length === 1 ? ['THE #1 PAYING', 'LANE THIS WEEK'] : [`TOP ${lanes.length} HIGHEST`, 'PAYING LANES'],
    lanes,
    colors: { primary: brand.primary || '#0066FF', secondary: brand.secondary || '#0B1220', accent: brand.accent || '#FDC902' },
    cta: 'Every load board in one feed — with a broker check on every load.',
    site: 'truloader.com',
    narration: null,
  };
}

export function captionFor(data, props) {
  // TruLoader is its own brand: plain caption + a fuller trucking hashtag set (the 4-tag cap is a @getnearapp rule).
  const top = [...props.lanes].reverse();
  return [
    props.lanes.length === 1 ? `🚛 The #1 paying lane on the load boards this week (${fmtDay(data.weekStart)} – ${fmtDay(data.weekEnd)}). Would you run it?` : `🚛 Highest paying lanes this week (${fmtDay(data.weekStart)} – ${fmtDay(data.weekEnd)})`,
    '',
    ...top.slice(0, 5).map(l => `#${l.rank} ${l.from.label} → ${l.to.label}: ${l.rate}/mi`),
    '',
    'Average posted rates across the load boards Truloader watches. Every load in one feed, a broker check on every load, one tap to call.',
    '👉 Try it free for 3 days: truloader.com',
    '',
    '#trucking #truckinglife #freight #loadboard #dispatcher #owneroperator #truckdriver #flatbed #logistics #hotshot',
  ].join('\n');
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

// ---------- Voiceover (free Kokoro male voice, am_adam — same as the Miami Reels fallback) + synthesized beat ----------
export const STATES = { AL: 'Alabama', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', DC: 'D.C.' };
const spokenPlace = (label) => { const [city, st] = label.split(/,\s*/); return `${city}, ${STATES[st] || st}`; };
const spokenRate = (rate) => { const [d, c] = rate.replace('$', '').split('.'); return `${d} ${c === '00' ? 'flat' : c.startsWith('0') ? `oh ${c[1]}` : c} a mile`; };

export async function addVoiceAndMusic(props, dir) {
  step('Voiceover (Kokoro am_adam) + beat');
  const scenes = [
    { text: props.lanes.length === 1 ? 'This is the number one paying lane on the load boards this week.' : `These are the ${props.lanes.length} highest paying lanes on the load boards this week.` },
    ...props.lanes.map(l => ({ text: `Number ${l.rank}. ${spokenPlace(l.from.label)}, to ${spokenPlace(l.to.label)}. ${spokenRate(l.rate)}.` })),
    { text: 'Find loads like these in one feed, with a broker check on every load. Try Truloader free for three days.' },
  ];
  try {
    process.env.KOKORO_VOICE ||= 'am_adam';
    process.env.KOKORO_SPEED ||= '1.2';
    const { makeNarration } = await import('./voice.mjs');
    const { timeline } = await makeNarration({ voice: { provider: 'kokoro' }, scenes }, dir);
    const fr = (sec) => Math.ceil(sec * FPS);
    props.hookFrames = Math.max(60, fr(timeline[0].duration));
    props.laneStarts = []; props.laneDurs = [];
    let at = props.hookFrames;
    for (let i = 0; i < props.lanes.length; i++) {
      const d = Math.max(54, fr(timeline[i + 1].duration) + 6);
      props.laneStarts.push(at); props.laneDurs.push(d); at += d;
    }
    // Narration was laid out back to back; shift each scene's voice to where its lane starts.
    const { execFileSync } = await import('node:child_process');
    const parts = timeline.map((t, i) => ({ file: path.join(dir, 'voice', `${i}.wav`), at: i === 0 ? t.speechStart : (i <= props.lanes.length ? props.laneStarts[i - 1] / FPS + 0.15 : at / FPS + 0.4) }));
    const inputs = parts.flatMap(p => ['-i', p.file]);
    const delays = parts.map((p, i) => `[${i}]adelay=${Math.round(p.at * 1000)}:all=1[a${i}]`).join(';');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', `${delays};${parts.map((_, i) => `[a${i}]`).join('')}amix=inputs=${parts.length}:normalize=0,loudnorm=I=-14:TP=-1.5[out]`, '-map', '[out]', '-ar', '44100', path.join(dir, 'voiceover.wav')]);
    const last = timeline[timeline.length - 1];
    props.outroFrames = Math.max(120, fr(last.speech + 1.4));
    props.durationInFrames = at + props.outroFrames;
    props.narration = 'voiceover.wav';
  } catch (e) {
    console.log(`⚠ voiceover failed (${String(e.message).slice(0, 200)}) — continuing without voice`);
  }
  // Owner, Nov 19 (later): light upbeat background music, our own (the Page Reels API can't attach Facebook songs). TRULOADER_BEAT=0 turns it off.
  if (process.env.TRULOADER_BEAT !== '0') {
    const { makeBeat } = await import('./beat.mjs');
    makeBeat(path.join(dir, 'music.wav'), props.durationInFrames / FPS + 1, { light: true, seed: Date.now() % 1000 });
    props.music = 'music.wav';
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  let eq = args.includes('--equipment') ? args[args.indexOf('--equipment') + 1] : '';
  let count = args.includes('--count') ? Number(args[args.indexOf('--count') + 1]) : 10;
  let concept = args.includes('--concept') ? args[args.indexOf('--concept') + 1] : 'lanes';
  const { CONCEPTS, buildConcept, pickSlot } = await import('./trucktips.mjs');
  const log = fs.existsSync(path.join(ROOT, 'posted.log')) ? fs.readFileSync(path.join(ROOT, 'posted.log'), 'utf8') : '';
  if (args.includes('--auto')) { // scheduled slot: next concept not posted recently (see pickSlot)
    concept = pickSlot(log);
    if (!concept) { console.log('nothing new for this slot (every concept posted recently) — skipping'); return null; }
    console.log(`slot concept: ${concept}`);
  }
  if (concept === 'one') count = 1; else if (concept === 'lanes5') count = 5; else if (concept === 'lanes3') count = 3;
  const isLanes = ['lanes', 'lanes5', 'lanes3', 'one'].includes(concept);
  if (!isLanes && !CONCEPTS.includes(concept)) throw new Error(`unknown concept ${concept}`);

  step('Fetching this week’s lanes');
  const data = await getJSON(`${API}?${eq ? `equipment=${encodeURIComponent(eq)}&` : ''}t=${Date.now()}`); // t= skips a stale CDN copy
  const brand = await getJSON(`${BRAND}/brand.json`).catch(() => ({}));
  let id, props, caption, comp = 'Lanes';
  const tmp = path.join(ROOT, 'out', 'truloader', `tmp-${Date.now()}`);
  fs.mkdirSync(tmp, { recursive: true });
  if (isLanes) {
    id = `${concept === 'lanes' && count !== 10 ? `lanes${count}` : concept}-${data.weekStart}${eq ? `-${eq}` : ''}`;
    props = await buildProps(data, brand, count);
    if (!args.includes('--no-voice')) await addVoiceAndMusic(props, tmp);
    caption = captionFor(data, props);
  } else {
    const r = await buildConcept(concept, { dir: tmp, lanes: data, brand });
    id = r.spec.id; props = r.props; caption = r.spec.caption; comp = 'Cards';
  }
  if (log.includes(`truloader:${id}\t`) && !dryRun && args.includes('--auto')) { console.log(`already posted ${id} — skipping`); return null; }
  const dir = path.join(ROOT, 'out', 'truloader', id);
  fs.rmSync(dir, { recursive: true, force: true }); fs.renameSync(tmp, dir);
  writeJSON(path.join(dir, 'data.json'), data);
  writeJSON(path.join(dir, 'props.json'), props);
  await download(`${BRAND}/logo-white.png`, path.join(dir, 'logo-white.png'));
  fs.cpSync(path.join(ROOT, 'assets', 'fonts'), path.join(dir, 'fonts'), { recursive: true });
  fs.cpSync(path.join(ROOT, 'assets', 'sfx'), path.join(dir, 'sfx'), { recursive: true });

  step('Rendering');
  const out = path.join(dir, 'reel.mp4');
  const local = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
  await run('npx', ['remotion', 'render', 'src/index.ts', comp, out, `--props=${path.join(dir, 'props.json')}`, `--public-dir=${dir}`,
    '--codec=h264', '--crf=20', '--audio-bitrate=192k', ...(!process.env.CI && fs.existsSync(local) ? [`--browser-executable=${local}`] : [])]);
  // Owner, Nov 19: speed the whole Reel up 1.3x (like the map Reels).
  const speed = Number(process.env.TRULOADER_SPEED || (comp === 'Cards' ? 1 : 1.3)); // owner, Nov 19: the tips/funny Reels were too fast
  if (speed && Math.abs(speed - 1) > 0.01) {
    const fast = path.join(dir, 'reel-fast.mp4');
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', out, '-filter_complex', `[0:v]setpts=PTS/${speed},fps=30[v];[0:a]atempo=${speed}[a]`,
      '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-crf', '20', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', fast]);
    fs.renameSync(fast, out);
  }
  const post = { id: `truloader-${id}`, concept, week: [data.weekStart, data.weekEnd], video: out, caption };
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
