// Viral clip Reel (owner, Oct 3): a real viral video (dashcam / bodycam / surveillance / phone footage — mainstream,
// nationwide or worldwide is fine) with clean edits: a 2 s cold open of the peak moment with the hook on top (owner, Oct 8:
// no black intro card — it was skipped), then the cut from the start, a situation box on top, short captions saying what is happening, one freeze-frame with labels pointing at
// who is who, credit + @getnearapp. No music (posts as a normal Reel). Rendered by src/Viral.tsx.
//   node pipeline/viralreel.mjs [--url <youtube url>] [--dry-run]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, run, step, writeJSON } from './util.mjs';
import { CHANNELS, STATIONS, MAINSTREAM, recentAgencyVideos, searchViral, searchShorts, chat, watch, ytdlpArgs } from './clip.mjs';

const FPS = 30;
const SEEN = path.join(ROOT, 'state', 'clips-seen.txt');
const TALK = /\b(briefing|press conference|news conference|meeting|ceremony|awards?|graduation|interview|podcast|budget|council|commission|town hall|recruit|hiring|wrap[- ]?up|full (show|episode|broadcast)|live:|livestream|newscast|debate|speech|weather|forecast)\b/i;

async function pickVideos(videos, hint = '') {
  const r = await chat([{ role: 'system', content: 'You run a viral news page like @onlyindade (South Florida, but nationwide/worldwide viral clips pop too). '
    + 'From these YouTube uploads, rank up to 10 that contain RAW viral footage people would share: dashcam, bodycam, surveillance, doorbell cam, phone video, '
    + 'helicopter footage of chases, wild arrests, crashes, road rage, rescues, animals (gators, bears), insane weather moments. Prefer high views and South Florida '
    + 'when equally good. Skip talking heads, politics, press conferences, full newscasts, anything about a dead child. '
    + 'Prefer CLEAR footage (owner, Oct 3): a few big, distinct subjects (one car, one person, one animal) — not cramped, crowded or far-away shots. '
    + 'Streamer/creator clips count too when something wild happens on stream. It needs SUBSTANCE (owner, Oct 4): a full mini-story with a payoff (arrest, karma, save, crash, comeback) and 30 s+ of footage — skip 10-second snippets, compilations and clips with no resolution. '
    + 'It must be GENUINELY viral — something you can\'t stop watching where something big visibly happens on camera (an arrest everyone is talking about, a crash, a fight, a wild animal, a rescue); '
    + 'skip routine footage where nothing visible happens (dark chases with just taillights, parked cars, empty streets). High view counts matter. '
    + (hint ? `THIS TIME the owner wants: ${hint}. ` : '') + 'Reply JSON {"picks": [{"index": n, "why": "…"}]}' },
  { role: 'user', content: videos.map((v, i) => `${i}. [${v.agency}] ${v.title} (${v.published.slice(0, 10)}, ${v.views} views)${v.description ? ' — ' + v.description.slice(0, 160) : ''}`).join('\n') }]);
  return (r.picks || []).filter(x => videos[x.index]);
}

// owner, Oct 6: our "what's happening" captions overlapped text the footage already has (a Short's own subtitles, a streamer's
// captions, on-screen narration/news text). Look at the cut every ~1.5 s and drop any caption that would show while the video
// already has readable text in its lower part (where our caption sits); if text runs through most of the clip, no captions at all.
// Each caption also stays up ≤ CAP_SECS instead of until the next one. Returns {at, text, until} (clip frames).
const CAP_SECS = 4;
async function clearCaptions(clip, dir, caps, clipFrames) {
  if (!caps.length) return caps;
  caps = caps.sort((a, b) => a.at - b.at).map((c, i, a) => ({ ...c, until: Math.min(c.at + CAP_SECS * FPS, a[i + 1]?.at ?? clipFrames, clipFrames) }));
  try {
    const secs = clipFrames / FPS, every = Math.max(1.5, secs / 30);
    const content = [{ type: 'text', text: 'Frames from a vertical video, each labeled with its time in seconds. We are about to put our own caption at the bottom '
      + '(the lower ~45% of the frame). For each frame, does the VIDEO ITSELF already show readable text there: burned-in subtitles, TikTok/streamer captions, '
      + 'narration text, a news headline/lower third, chat overlays, big text stickers? Ignore tiny watermarks/usernames and text on real-world objects (signs, '
      + 'license plates, shirts). Reply JSON {"text": [times in seconds of frames WITH such text]}' }];
    const tdir = path.join(dir, 'textcheck'); fs.mkdirSync(tdir, { recursive: true });
    const times = [];
    for (let t = 0.3; t < secs - 0.2; t += every) {
      const f = path.join(tdir, `t${times.length}.jpg`);
      await run('ffmpeg', ['-y', '-loglevel', 'error', '-ss', t.toFixed(2), '-i', clip, '-frames:v', '1', '-vf', 'scale=-2:640', f]);
      if (!fs.existsSync(f)) continue;
      times.push(+t.toFixed(1));
      content.push({ type: 'text', text: `t=${t.toFixed(1)}s` });
      content.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${fs.readFileSync(f).toString('base64')}`, detail: 'low' } });
    }
    if (!times.length) return caps;
    const r = await chat([{ role: 'user', content }]);
    const hit = (r.text || []).map(Number).filter(Number.isFinite);
    if (hit.length >= times.length * 0.6) { console.log(`  footage has its own text in ${hit.length}/${times.length} frames — no captions`); return []; }
    const near = every * 0.75; // a text frame covers the stretch around it
    const kept = caps.filter(c => !hit.some(t => t * FPS >= c.at - near * FPS && t * FPS <= c.until + near * FPS));
    if (kept.length < caps.length) console.log(`  dropped ${caps.length - kept.length} caption(s) that would overlap the video's own text (text @ ${hit.join(', ')} s)`);
    return kept;
  } catch (e) { console.log(`  (text check failed: ${e.message} — keeping captions)`); return caps; }
}

// who's who on the freeze frame: a box per subject (normalized 0–1) → a numbered marker at its center + a still cropped
// from the footage for the bottom strip. Never a person who is a victim (cars/places are fine), never a child.
async function labelsFor(frameFile, check, dir, vw, vh) {
  const r = await chat([{ role: 'user', content: [
    { type: 'text', text: `Freeze-frame from a viral video. Situation: ${check.banner}. Pick up to 3 subjects viewers should know (the suspect / the car that caused it, `
      + 'the victim\'s car, the officer, the animal…) with a SHORT label (1–3 words: SUSPECT, SUSPECT\'S CAR, VICTIM\'S CAR, OFFICER, THE GATOR) and its bounding box '
      + '(normalized x,y,w,h from 0 to 1, origin top-left) in THIS image. Use SUSPECT (never perpetrator/criminal). Only subjects that are clearly visible and '
      + 'reasonably big; never label a child or a person who is a victim. Reply JSON {"labels": [{"text": "…", "box": {"x":0,"y":0,"w":0,"h":0}}]}' },
    { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${fs.readFileSync(frameFile).toString('base64')}`, detail: 'high' } }] }]).catch(e => { if (/credits/i.test(e.message)) throw e; return { labels: [] }; });
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

async function refineCut(raw, dir, a, b, total, c) {
  const from = Math.max(0, a - 3), to = Math.min(total, b + 3);
  const step = Math.max(0.75, (to - from) / 36);
  const frames = [];
  for (let t = from; t < to; t += step) {
    const file = path.join(dir, `r${String(frames.length).padStart(3, '0')}.jpg`);
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-ss', t.toFixed(2), '-i', raw, '-frames:v', '1', '-vf', 'scale=320:-2', file]);
    if (fs.existsSync(file)) frames.push({ t: +t.toFixed(2), file });
  }
  if (frames.length < 6) return null;
  const content = [{ type: 'text', text: `Frames every ${step.toFixed(1)} s from a news upload. Story: ${c.banner}. Find the longest CONTIGUOUS run of frames that are `
    + 'all RAW footage (dashcam/bodycam/surveillance/phone video) and contain the main action — no studio, anchor, reporter, title cards, promo graphics, maps, '
    + 'still photos or mugshot graphics inside the run. Reply JSON {"start": seconds of the first raw frame, "end": seconds of the last raw frame, "action": seconds of the key moment}' }];
  for (const f of frames) { content.push({ type: 'text', text: `t=${f.t}` }); content.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${fs.readFileSync(f.file).toString('base64')}`, detail: 'low' } }); }
  const r = await chat([{ role: 'user', content }]).catch(e => { if (/credits/i.test(e.message)) throw e; return null; });
  for (const f of frames) fs.rmSync(f.file, { force: true });
  if (!r || !(r.end - r.start >= 5)) return null;
  return { start: Math.max(0, +r.start + 0.2), end: Math.min(total, +r.end - 0.2) };
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
    const shorts = await searchShorts(); // vertical 9:16 first (owner, Oct 4: no blurred top/bottom)
    const viral = await searchViral();
    const ours = await recentAgencyVideos({ days: 3, channels: [...MAINSTREAM, ...STATIONS, ...CHANNELS] });
    const ids = new Set();
    // vertical Shorts only when there are enough (saves downloading/checking wide news videos that would be skipped anyway)
    videos = [...(shorts.length >= 10 ? shorts : [...shorts, ...viral, ...ours])].filter(v => !ids.has(v.id) && ids.add(v.id) && !seen.has(v.id) && !TALK.test(v.title)).slice(0, 100);
  }
  console.log(`  ${videos.length} candidates`);
  const picks = url ? [{ index: 0, why: 'owner link' }] : await pickVideos(videos, hint);
  for (const pk of picks) {
    const v = videos[pk.index];
    console.log(`\n  pick: [${v.agency}] ${v.title} — ${pk.why}`);
    const dir = path.join(ROOT, 'out', 'viral', `${date}-${v.id}`);
    // Shorts: real channel for the credit + length check before any download/AI (most Shorts are under 30 s)
    if (v.vertical) {
      try {
        const [ch, dur] = execFileSync('yt-dlp', [...ytdlpArgs(), '--skip-download', '--print', 'channel', '--print', 'duration', v.url]).toString().trim().split('\n');
        if (v.agency === 'YouTube' && ch) v.agency = ch;
        if (!url && +dur < 30) { console.log(`  skip (${dur} s Short — owner wants 30 s+)`); fs.appendFileSync(SEEN, `${v.id}  reel-short\n`); continue; }
      } catch {}
    }
    // owner, Oct 8: the 6pm slot found nothing at 8+ (Mangione arrest bodycam, pond chase scored 7) — 7 is the bar, same as clips
    const w = await watch(v, {}, dir, 'reel');
    const c = w?.check;
    if (!c?.ok || (!url && c.crazy < 7)) {
      console.log(`  skip (${c ? (c.ok ? `crazy ${c.crazy}` : 'not ok') : 'no download'})`);
      if (w) fs.appendFileSync(SEEN, `${v.id}  reel-skip\n`);
      fs.rmSync(dir, { recursive: true, force: true });
      continue;
    }
    // owner, Oct 4: no blurred top/bottom and nothing important cropped out — only vertical (9:16-ish) footage
    const [rw, rh] = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', w.raw]).toString().trim().split(',').map(Number);
    const [rw0, rh0] = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', w.raw]).toString().trim().split(',').map(Number);
    if (rw0 / rh0 <= 0.8) v.vertical = true; // owner links to Shorts too: a vertical source always fills the screen
    // keep the Short whole (cropping its caption bars made a 9:16 clip 608x756) — but trim a burned-in channel banner / black band at
    // the top or bottom (Oct 9: a "High speed Chases" title sat under our hook) when the rest still fills the screen
    if (v.vertical) {
      const y = Math.max(0, +c.crop?.y || 0), h = Math.min(1 - y, +c.crop?.h || 1);
      c.crop = c.crop && h >= 0.7 && h < 0.95 && rw0 / (rh0 * h) <= 0.75 ? { x: 0, y, w: 1, h } : null;
    }
    const cw = rw * (c.crop?.w || 1), ch = rh * (c.crop?.h || 1);
    if (!url && cw / ch > 0.8) { console.log(`  skip (not vertical: ${Math.round(cw)}x${Math.round(ch)})`); fs.appendFileSync(SEEN, `${v.id}  reel-wide\n`); fs.rmSync(dir, { recursive: true, force: true }); continue; }
    let start = Math.max(0, Math.min(w.total - 5, +c.start || 0));
    // second, precise pass: frames every 0.5 s around the pick → keep only the stretch of RAW footage (no graphics/anchor/studio)
    // Shorts are already edited vertical clips (text overlays are part of them): the raw-footage-only pass would cut them to seconds
    const rf = v.vertical ? null : await refineCut(w.raw, dir, start, Math.min(w.total, +c.end || start + 30), w.total, c);
    if (rf) { console.log(`  refined cut: ${rf.start}–${rf.end} s (was ${start}–${c.end})`); start = rf.start; c.end = rf.end; }
    // owner, Oct 3: the who's-who freeze goes at the BEGINNING — start the cut ~1 s before the freeze frame
    // the who's-who freeze only if it falls in the first ~3.5 s of the cut — never move the cut (that once skipped the crash itself)
    if (c.freeze != null && (c.freeze - start > 3.5 || c.freeze - start < 0.5)) { console.log(`  (freeze @${c.freeze}s not at the start of the cut — no freeze)`); c.freeze = null; }
    const end = Math.min(w.total, Math.max(start + 6, +c.end || start + 40), start + 60);
    // Oct 3 8pm: a 7 s cut went out; owner Oct 4: at least 30 s with a payoff (11 s Reel with the intro) — too short to be worth watching; try the next video
    if (end - start < 28 && !url) { console.log(`  skip (only ${(end - start).toFixed(1)} s of footage — owner wants 30 s+ with a payoff)`); fs.appendFileSync(SEEN, `${v.id}  reel-short\n`); fs.rmSync(dir, { recursive: true, force: true }); continue; }
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
    // owner, Oct 8 ("the viral news videos get skipped a lot"): no black title card any more — like news pages, frame 1 is
    // the footage: a 2 s cold open of the most shocking moment with the hook on top, then it rewinds to the start of the cut
    const TEASE = 60;
    const peak = Number.isFinite(+c.peak) && +c.peak > start && +c.peak < end ? +c.peak : (c.freeze != null ? +c.freeze + 2 : start + (end - start) * 0.4);
    const teaseFrom = Math.max(0, Math.min(clipFrames - TEASE - 1, Math.round((peak - start - 1) * FPS)));
    const intro = clipFrames > TEASE * 4 ? TEASE : 0;
    const props = {
      durationInFrames: intro + clipFrames + (freeze ? freeze.hold : 0), video: 'clip.mp4', videoW: vw, videoH: vh, clipFrames,
      // vertical footage always fills the screen (owner, Oct 4: no blurred top/bottom)
      fill: vw / vh <= 0.8 || (!!c.fill && vw / vh <= 1.3), focusX: Number.isFinite(+c.focusX) ? Math.min(1, Math.max(0, +c.focusX)) : 0.5,
      intro: { frames: intro, warning: false, title: c.hook || v.title, teaseFrom },
      banner: c.banner || '', freeze, credit: `Video: ${v.agency}`,
      captions: await clearCaptions(clip, dir, (c.captions || []).filter(x => x.t >= start && x.t < end).map(x => ({ at: Math.round((x.t - start) * FPS), text: String(x.text) })), clipFrames),
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
