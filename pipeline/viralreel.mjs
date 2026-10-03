// Viral clip Reel (owner, Oct 3): a real viral video (dashcam / bodycam / surveillance / phone footage — mainstream,
// nationwide or worldwide is fine) with clean edits: blurred intro + typed hook (+ "viewer discretion is advised" when
// sensitive), a situation box on top, short captions saying what is happening, one freeze-frame with labels pointing at
// who is who, credit + @getnearapp. No music (posts as a normal Reel). Rendered by src/Viral.tsx.
//   node pipeline/viralreel.mjs [--url <youtube url>] [--dry-run]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, run, step, writeJSON } from './util.mjs';
import { CHANNELS, STATIONS, MAINSTREAM, recentAgencyVideos, chat, watch, ytdlpArgs } from './clip.mjs';
import { ensureSfx } from './sfx.mjs';

const FPS = 30;
const SEEN = path.join(ROOT, 'state', 'clips-seen.txt');
const TALK = /\b(briefing|press conference|news conference|meeting|ceremony|awards?|graduation|interview|podcast|budget|council|commission|town hall|recruit|hiring|wrap[- ]?up|full (show|episode|broadcast)|live:|livestream|newscast|debate|speech|weather|forecast)\b/i;

async function pickVideos(videos) {
  const r = await chat([{ role: 'system', content: 'You run a viral news page like @onlyindade (South Florida, but nationwide/worldwide viral clips pop too). '
    + 'From these YouTube uploads, rank up to 6 that contain RAW viral footage people would share: dashcam, bodycam, surveillance, doorbell cam, phone video, '
    + 'helicopter footage of chases, wild arrests, crashes, road rage, rescues, animals (gators, bears), insane weather moments. Prefer high views and South Florida '
    + 'when equally good. Skip talking heads, politics, press conferences, full newscasts, anything about a dead child. '
    + 'Reply JSON {"picks": [{"index": n, "why": "…"}]}' },
  { role: 'user', content: videos.map((v, i) => `${i}. [${v.agency}] ${v.title} (${v.published.slice(0, 10)}, ${v.views} views)${v.description ? ' — ' + v.description.slice(0, 160) : ''}`).join('\n') }]);
  return (r.picks || []).filter(x => videos[x.index]);
}

// where on the freeze frame to point the labels (normalized 0–1 of the video frame)
async function labelsFor(frameFile, check) {
  const r = await chat([{ role: 'user', content: [
    { type: 'text', text: `Freeze-frame from a viral video. Situation: ${check.banner}. Mark up to 3 things viewers should see (the suspect/the car that caused it, `
      + 'the victim\'s car, the officer, the animal…) with a SHORT label (1–3 words, e.g. SUSPECT, VICTIM\'S CAR, OFFICER, THE GATOR) and the normalized center point '
      + '(x,y from 0 to 1, origin top-left) of that thing in THIS image. Use SUSPECT (never perpetrator/criminal). Only label what is clearly visible; never label a child. '
      + 'Reply JSON {"labels": [{"text": "…", "x": 0-1, "y": 0-1}]}' },
    { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${fs.readFileSync(frameFile).toString('base64')}`, detail: 'high' } }] }]).catch(() => ({ labels: [] }));
  return (r.labels || []).filter(l => l.text && l.x >= 0 && l.x <= 1 && l.y >= 0 && l.y <= 1).slice(0, 3)
    .map(l => ({ text: String(l.text).replace(/perpetrator|criminal/i, 'SUSPECT').slice(0, 18), x: +l.x, y: +l.y }));
}

export async function makeViralReel({ url, dryRun } = {}) {
  const date = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  step('Finding viral videos');
  let videos;
  if (url) {
    const meta = JSON.parse(execFileSync('yt-dlp', [...ytdlpArgs(), '-J', url], { maxBuffer: 64e6 }).toString());
    videos = [{ agency: meta.channel, id: meta.id, url, published: new Date().toISOString(), title: meta.title, description: (meta.description || '').slice(0, 400), views: meta.view_count || 0 }];
  } else {
    const seen = new Set(fs.existsSync(SEEN) ? fs.readFileSync(SEEN, 'utf8').split('\n').map(l => l.split(/\s/)[0]) : []);
    videos = (await recentAgencyVideos({ days: 3, channels: [...MAINSTREAM, ...STATIONS, ...CHANNELS] }))
      .filter(v => !seen.has(v.id) && !TALK.test(v.title));
  }
  console.log(`  ${videos.length} candidates`);
  const picks = url ? [{ index: 0, why: 'owner link' }] : await pickVideos(videos);
  for (const pk of picks) {
    const v = videos[pk.index];
    console.log(`\n  pick: [${v.agency}] ${v.title} — ${pk.why}`);
    const dir = path.join(ROOT, 'out', 'viral', `${date}-${v.id}`);
    const w = await watch(v, {}, dir, 'reel');
    const c = w?.check;
    if (!c?.ok || (!url && c.crazy < 6)) {
      console.log(`  skip (${c ? (c.ok ? `crazy ${c.crazy}` : 'not ok') : 'no download'})`);
      if (w) fs.appendFileSync(SEEN, `${v.id}  reel-skip\n`);
      fs.rmSync(dir, { recursive: true, force: true });
      continue;
    }
    const start = Math.max(0, Math.min(w.total - 5, +c.start || 0));
    const end = Math.min(w.total, Math.max(start + 8, +c.end || start + 30), start + 45);
    console.log(`  crazy ${c.crazy}/10 · cut ${start}–${end} s · ${c.hook}`);

    step('Cutting');
    const clip = path.join(dir, 'clip.mp4');
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(start), '-t', String(end - start), '-i', w.raw, '-vf', 'fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-c:a', 'aac', '-b:a', '160k', '-ar', '44100', '-movflags', '+faststart', clip]);
    const [vw, vh] = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', clip]).toString().trim().split(',').map(Number);
    const clipFrames = Math.floor((end - start) * FPS) - 1;

    let freeze = null;
    if (c.freeze != null && c.freeze >= start && c.freeze < end - 1) {
      const ff = path.join(dir, 'freeze.jpg');
      await run('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(c.freeze - start), '-i', clip, '-frames:v', '1', ff]);
      const labels = await labelsFor(ff, c);
      if (labels.length) freeze = { at: Math.round((c.freeze - start) * FPS), hold: 90, labels };
      console.log(`  freeze @${c.freeze}s: ${labels.map(l => l.text).join(', ') || '(no labels)'}`);
    }
    const intro = 90;
    const props = {
      durationInFrames: intro + clipFrames + (freeze ? freeze.hold : 0), video: 'clip.mp4', videoW: vw, videoH: vh, clipFrames,
      intro: { frames: intro, warning: !!c.sensitive, title: c.hook || v.title, sub: c.sub || '' },
      banner: c.banner || '', freeze, credit: `Video: ${v.agency}`,
      captions: (c.captions || []).filter(x => x.t >= start && x.t < end).map(x => ({ at: Math.round((x.t - start) * FPS), text: String(x.text) })),
    };
    writeJSON(path.join(dir, 'props.json'), props);
    fs.cpSync(path.join(ROOT, 'assets', 'fonts'), path.join(dir, 'fonts'), { recursive: true });
    fs.cpSync(await ensureSfx(), path.join(dir, 'sfx'), { recursive: true });

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
  const i = args.indexOf('--url');
  await makeViralReel({ url: i >= 0 ? args[i + 1] : null, dryRun: args.includes('--dry-run') });
}
