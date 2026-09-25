// The daily job: write a new episode → render it → post it.
//   node pipeline/daily.mjs                         full run (respects control.json pause/skip)
//   node pipeline/daily.mjs --dry-run               everything except posting
//   node pipeline/daily.mjs --topic "worst Publix"  steer today's concept
//   node pipeline/daily.mjs --episode episodes/003-x   render/post an existing (hand-written) episode
//   node pipeline/daily.mjs --force                 ignore pause/skip in control.json
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, readJSON } from './util.mjs';
import { generateEpisode } from './generate.mjs';
import { makeEpisode } from './make.mjs';
import { publishReel, publishStory } from './publish.mjs';

const args = process.argv.slice(2);
const flag = name => args.includes(name);
const opt = name => { const i = args.indexOf(name); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null; };

const dry = flag('--dry-run');
const topic = opt('--topic') || process.env.REEL_TOPIC || null;
const episodeArg = opt('--episode') || process.env.REEL_EPISODE || null;

// control.json: { "paused": false, "skipDates": ["2026-09-30"] }  (dates in America/New_York)
const controlFile = path.join(ROOT, 'control.json');
const control = fs.existsSync(controlFile) ? readJSON(controlFile) : {};
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
if (!flag('--force') && !episodeArg && !topic) {
  if (control.paused) { console.log('Paused in control.json — nothing to do.'); process.exit(0); }
  if ((control.skipDates || []).includes(today)) { console.log(`Skipping ${today} (control.json).`); process.exit(0); }
}

const dir = episodeArg ? path.resolve(ROOT, episodeArg) : await generateEpisode({ topic });
const { out, episode } = await makeEpisode(dir);
if (dry) console.log(`(dry run) Would post ${out}`);
else {
  await publishReel(out, episode.igCaption);
  // cross-post to stories; a failed story never fails the Reel
  await publishStory(out, episode.id).catch(e => console.log(`(story skipped: ${e.message})`));
}
