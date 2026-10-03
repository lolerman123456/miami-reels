// Viral clip Reel (owner, Oct 3): a real viral video (dashcam / bodycam / surveillance / phone footage — mainstream,
// nationwide or worldwide is fine) with clean edits: blurred intro + typed hook (+ "viewer discretion is advised" when
// sensitive), a situation box on top, short captions saying what is happening, one freeze-frame with labels pointing at
// who is who, credit + @getnearapp. No music (posts as a normal Reel). Rendered by src/Viral.tsx.
//   node pipeline/viralreel.mjs [--url <youtube url>] [--dry-run]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, run, step, writeJSON } from './util.mjs';
import { CHANNELS, STATIONS, MAINSTREAM, recentAgencyVideos, searchViral, chat, watch, ytdlpArgs } from './clip.mjs';

const FPS = 30;
const SEEN = path.join(ROOT, 'state', 'clips-seen.txt');
const TALK = /\b(briefing|press conference|news conference|meeting|ceremony|awards?|graduation|interview|podcast|budget|council|commission|town hall|recruit|hiring|wrap[- ]?up|full (show|episode|broadcast)|live:|livestream|newscast|debate|speech|weather|forecast)\b/i;

async function pickVideos(videos, hint = '') {
  const r = await chat([{ role: 'system', content: 'You run a viral news page like @onlyindade (South Florida, but nationwide/worldwide viral clips pop too). '
    + 'From these YouTube uploads, rank up to 6 that contain RAW viral footage people would share: dashcam, bodycam, surveillance, doorbell cam, phone video, '
    + 'helicopter footage of chases, wild arrests, crashes, road rage, rescues, animals (gators, bears), insane weather moments. Prefer high views and South Florida '
    + 'when equally good. Skip talking heads, politics, press conferences, full newscasts, anything about a dead child. '
    + 'Prefer CLEAR footage (owner, Oct 3): a few big, distinct subjects (one car, one person, one animal) — not cramped, crowded or far-away shots. '
    + 'It must be GENUINELY viral — something you can\'t stop watching where something big visibly happens on camera (an arrest everyone is talking about, a crash, a fight, a wild animal, a rescue); '
    + 'skip routine footage where nothing visible happens (dark chases with just taillights, parked cars, empty streets). High view counts matter. '
    + (hint ? `THIS TIME the owner wants: ${hint}. ` : '') + 'Reply JSON {"picks": [{"index": n, "why": "…"}]}' },
  { role: 'user', content: videos.map((v, i) => `${i}. [${v.agency}] ${v.title} (${v.published.slice(0, 10)}, ${v.views} views)${v.description ? ' — ' + v.description.slice(0, 160) : ''}`).join('\n') }]);
  return (r.picks || []).filter(x => videos[x.index]);
}

// who's who on the freeze frame: a box per subject (normalized 0–1) → a numbered marker at its center + a still cropped
// from the footage for the bottom strip. Never a person who is a victim (cars/places are fine), never a child.
async function labelsFor(frameFile, check, dir, vw, vh) {
  const r = await chat([{ role: 'user', content: [
    { type: 'text', text: `Freeze-frame from a viral video. Situation: ${check.banner}. Pick up to 3 subjects viewers should know (the suspect / the car that caused it, `
      + 'the victim\'s car, the officer, the animal…) with a SHORT label (1–3 words: SUSPECT, SUSPECT\'S CAR, VICTIM\'S CAR, OFFICER, THE GATOR) and its bounding box '
      + '(normalized x,y,w,h from 0 to 1, origin top-left) in THIS image. Use SUSPECT (never perpetrator/criminal). Only subjects that are clearly visible and '
      + 'reasonably big; never label a child or a person who is a victim. Reply JSON {"labels": [{"text": "…", "box": {"x":0,"y":0,"w":0,"h":0}}]}' },
    { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${fs.readFileSync(frameFile).toString('base64')}`, detail: 'high' } }] }]).catch(() => ({ labels: [] }));
  const out = [];
  for (const l of (r.labels || []).slice(0, 3)) {
    const b = l.box || {};
    if (!l.text || !(b.w > 0.02 && b.h > 0.02) || b.x < 0 || b.y < 0 || b.x + b.w > 1.02 || b.y + b.h > 1.02) continue;
    if (/victim(?!'s car|s' car)/i.test(l.text) && !/car|truck|suv|vehicle|home|house/i.test(l.text)) continue; // no victim people
    // still for the strip: the box with some margin, 300:170 aspect
    const cx = (b.x + b.w / 2) * vw, cy = (b.y + b.h / 2) * vh;
    let cw = Math.max(b.w * vw * 1.6, 160), ch = cw * 170 / 300;
    if (ch < b.h * vh * 1.3) { ch = b.h * vh * 1.3; cw = ch * 300 / 170; }
    cw = Math.min(cw, vw); ch = Math.min(ch, vh);
    const x0 = Math.max(0, Math.min(vw - cw, cx - cw / 2)), y0 = Math.max(0, Math.min(vh - ch, cy - ch / 2));
    const thumb = `thumb-${out.length}.jpg`;
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', frameFile, '-vf', `crop=${Math.round(cw)}:${Math.round(ch)}:${Math.round(x0)}:${Math.round(y0)},scale=600:340:force_original_aspect_ratio=increase,crop=600:340`, path.join(dir, thumb)]);
    out.push({ text: String(l.text).replace(/perpetrator|criminal/i, 'SUSPECT').slice(0, 18), x: b.x + b.w / 2, y: b.y + b.h / 2, thumb: fs.existsSync(path.join(dir, thumb)) ? thumb : null });
  }
  return out;
}

export async function makeViralReel({ url, dryRun, hint } = {}) {
  const date = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  step('Finding viral videos');
  let videos;
  if (url) {
    const meta = JSON.parse(execFileSync('yt-dlp', [...ytdlpArgs(), '-J', url], { maxBuffer: 64e6 }).toString());
    videos = [{ agency: meta.channel, id: meta.id, url, published: new Date().toISOString(), title: meta.title, description: (meta.description || '').slice(0, 400), views: meta.view_count || 0 }];
  } else {
    const seen = new Set(fs.existsSync(SEEN) ? fs.readFileSync(SEEN, 'utf8').split('\n').map(l => l.split(/\s/)[0]) : []);
    // this week's nationally viral released footage first, then our news/agency channels
    const viral = await searchViral();
    const ours = await recentAgencyVideos({ days: 3, channels: [...MAINSTREAM, ...STATIONS, ...CHANNELS] });
    const ids = new Set();
    videos = [...viral, ...ours].filter(v => !ids.has(v.id) && ids.add(v.id) && !seen.has(v.id) && !TALK.test(v.title)).slice(0, 180);
  }
  console.log(`  ${videos.length} candidates`);
  const picks = url ? [{ index: 0, why: 'owner link' }] : await pickVideos(videos, hint);
  for (const pk of picks) {
    const v = videos[pk.index];
    console.log(`\n  pick: [${v.agency}] ${v.title} — ${pk.why}`);
    const dir = path.join(ROOT, 'out', 'viral', `${date}-${v.id}`);
    const w = await watch(v, {}, dir, 'reel');
    const c = w?.check;
    if (!c?.ok || (!url && c.crazy < 8)) {
      console.log(`  skip (${c ? (c.ok ? `crazy ${c.crazy}` : 'not ok') : 'no download'})`);
      if (w) fs.appendFileSync(SEEN, `${v.id}  reel-skip\n`);
      fs.rmSync(dir, { recursive: true, force: true });
      continue;
    }
    let start = Math.max(0, Math.min(w.total - 5, +c.start || 0));
    // owner, Oct 3: the who's-who freeze goes at the BEGINNING — start the cut ~1 s before the freeze frame
    // the who's-who freeze only if it falls in the first ~3.5 s of the cut — never move the cut (that once skipped the crash itself)
    if (c.freeze != null && (c.freeze - start > 3.5 || c.freeze - start < 0.5)) { console.log(`  (freeze @${c.freeze}s not at the start of the cut — no freeze)`); c.freeze = null; }
    const end = Math.min(w.total, Math.max(start + 12, +c.end || start + 30), start + 45);
    console.log(`  crazy ${c.crazy}/10 · cut ${start}–${end} s · ${c.fill ? `full 9:16 (focus ${c.focusX})` : 'blurred top/bottom'} · ${c.hook}`);

    step('Cutting');
    const clip = path.join(dir, 'clip.mp4');
    // keep only the raw footage (drop TV graphics / blurred pillarbox bars around a phone video)
    const cr = c.crop && c.crop.w > 0.2 && c.crop.h > 0.2 && (c.crop.w < 0.95 || c.crop.h < 0.95) ? c.crop : null;
    const crop = cr ? `crop=iw*${Math.min(1, cr.w).toFixed(3)}:ih*${Math.min(1, cr.h).toFixed(3)}:iw*${Math.max(0, cr.x).toFixed(3)}:ih*${Math.max(0, cr.y).toFixed(3)},` : '';
    if (cr) console.log(`  crop to raw footage: ${JSON.stringify(cr)}`);
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(start), '-t', String(end - start), '-i', w.raw, '-vf', `${crop}fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2`,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-c:a', 'aac', '-b:a', '160k', '-ar', '44100', '-movflags', '+faststart', clip]);
    const [vw, vh] = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', clip]).toString().trim().split(',').map(Number);
    const clipFrames = Math.floor((end - start) * FPS) - 1;

    let freeze = null;
    if (c.freeze != null && c.freeze >= start && c.freeze < end - 1) {
      const ff = path.join(dir, 'freeze.jpg');
      await run('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(c.freeze - start), '-i', clip, '-frames:v', '1', ff]);
      const labels = await labelsFor(ff, c, dir, vw, vh);
      if (labels.length) freeze = { at: Math.round((c.freeze - start) * FPS), hold: 54, labels };
      console.log(`  freeze @${c.freeze}s: ${labels.map(l => l.text).join(', ') || '(no labels)'}`);
    }
    // black intro (owner, Oct 3): WARNING card fades in/out (sensitive only), then the story card (headline + context) ~4 s
    const intro = c.context ? 84 : 45; // owner, Oct 3: fast — no warning card, story card ~2.8 s
    const props = {
      durationInFrames: intro + clipFrames + (freeze ? freeze.hold : 0), video: 'clip.mp4', videoW: vw, videoH: vh, clipFrames,
      fill: !!c.fill, focusX: Number.isFinite(+c.focusX) ? Math.min(1, Math.max(0, +c.focusX)) : 0.5,
      intro: { frames: intro, warning: false, title: c.hook || v.title, sub: c.sub || '', context: String(c.context || '').slice(0, 240) },
      banner: c.banner || '', freeze, credit: `Video: ${v.agency}`,
      captions: (c.captions || []).filter(x => x.t >= start && x.t < end).map(x => ({ at: Math.round((x.t - start) * FPS), text: String(x.text) })),
    };
    writeJSON(path.join(dir, 'props.json'), props);
    fs.cpSync(path.join(ROOT, 'assets', 'fonts'), path.join(dir, 'fonts'), { recursive: true });

    step('Rendering');
    const out = path.join(dir, 'reel.mp4');
    const local = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
    await run('npx', ['remotion', 'render', 'src/index.ts', 'Viral', out, `--props=${path.join(dir, 'props.json')}`, `--public-dir=${dir}`,
      '--codec=h264', '--crf=20', '--audio-bitrate=192k', ...(!process.env.CI && fs.existsSync(local) ? [`--browser-executable=${local}`] : [])]);
    const caption = [c.caption || c.hook, '', 'Follow @getnearapp for more 👀'].join('\n');
    const post = { id: `${date}-viral-${v.id}`, source: v.url, agency: v.agency, title: v.title, start, end, ...c, props, video: out, igCaption: caption };
    writeJSON(path.join(dir, 'post.json'), post);
    for (const f of fs.readdirSync(dir)) if (/^f\d+\.jpg$|^raw\.mp4|\.vtt$/.test(f)) fs.rmSync(path.join(dir, f), { force: true });
    console.log(`✔ ${out}`);
    if (dryRun) { console.log('(dry run) not posted'); return post; }
    const { publishReel } = await import('./publish.mjs');
    await publishReel(out, caption);
    fs.appendFileSync(SEEN, `${v.id}  reel-posted\n`);
    return post;
  }
  console.log('No viral video passed — nothing made.');
  return null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const i = args.indexOf('--url'), h = args.indexOf('--hint');
  await makeViralReel({ url: i >= 0 ? args[i + 1] : null, hint: h >= 0 ? args[h + 1] : '', dryRun: args.includes('--dry-run') });
}
