// Shareslop (owner, Oct 6: "stuff like @lostmydaddy / @ragebaitnews … people share to couples/friends"): ONE image with a huge
// two-color headline, posted as a short Reel with a trending song (Instagram Audio API, like the map Reels).
// Parody "STUDY SHOWS" memes (see write()): the picture is an AI-staged, exaggerated scene with invented people (never a real/famous person).
//   node pipeline/shareslop.mjs [--count 3] [--dry-run]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, run, step, writeJSON } from './util.mjs';
import { chatJSON } from './llm.mjs';
import { fetchNews, searchNews } from './news.mjs';
import { aiImage } from './photos.mjs';
import { renderShareCover } from './carousel.mjs';

const SEEN = path.join(ROOT, 'state', 'shareslop-seen.txt');
// owner, Oct 6: real shareslop = what one person sends the other as a hint ("do this for me", "see? I told you") — studies,
// surveys and facts about couples, partners, friends and daily habits; these stay shareable for weeks, so the search window is wide
const QUERIES = ['study finds couples', 'study partners who', 'study men who', 'study women who', 'boyfriend study', 'girlfriend study',
  'husband wife study', 'cuddling study', 'kissing study', 'massage study', 'flowers study women', 'couples who happier', 'relationship researchers',
  'dating survey', 'sleep study partner', 'friendship study', 'texting study', 'date night study', 'study finds health benefit', 'Florida man'];
const key = t => t.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ').slice(0, 7).join(' ');

async function candidates() {
  const seen = new Set((fs.existsSync(SEEN) ? fs.readFileSync(SEEN, 'utf8') : '').split('\n').map(l => l.split('\t')[0]).filter(Boolean));
  const lists = await Promise.all([
    ...QUERIES.map(q => searchNews(q, { days: 30, max: 10 }).catch(() => [])),
  ]);
  const out = [], dup = new Set();
  for (const i of lists.flat()) {
    const k = key(i.title);
    if (!i.title || seen.has(k) || dup.has(k)) continue;
    dup.add(k); out.push(i);
  }
  return out.slice(0, 160);
}

// owner, Oct 6 (after the first previews): the format is "[ridiculous thing the sender wants] + [normal-sounding benefit], STUDY SHOWS"
// — e.g. "CALLING HIM DADDY INCREASES HIS LIFESPAN, STUDY SHOWS" with an exaggerated picture (heart eyes). It's a parody
// meme format: obviously absurd, harmless if "followed", never about real people/groups, tagged #satire in the caption.
async function write(items, recent, topic = '') {
  return chatJSON([{ role: 'system', content: 'You run a viral meme SHARE page (style: @lostmydaddy). Every post is ONE picture + a huge headline in this exact formula: '
    + '[a cheeky, ridiculous thing one partner wants the other to do] + [a normal, legit-sounding health/science benefit] + ", STUDY SHOWS" (or SCIENTISTS SAY / DOCTORS CONFIRM / NEW RESEARCH FINDS). '
    + 'Examples: "SPITTING IN HIS MOUTH BOOSTS HIS IMMUNE SYSTEM", "CALLING HIM DADDY INCREASES HIS LIFESPAN, STUDY SHOWS", "BUYING HER 2AM TACO BELL LOWERS HER BLOOD PRESSURE, DOCTORS SAY", '
    + '"LETTING HER WEAR YOUR HOODIE IMPROVES YOUR CREDIT SCORE, STUDY SHOWS", "MEN WHO GIVE FOOT RUBS GROW AN INCH TALLER, SCIENTISTS SAY", "SENDING HIM 47 TIKTOKS A DAY STRENGTHENS HIS HEART". '
    + 'The point: the person who sees it SENDS it to their partner/crush/friend as a joke-demand ("do this for me 👀") — so the first half must be something real people actually want '
    + '(attention, food runs, massages, compliments, pet names, cuddles, texting back, letting them pick the restaurant, carrying them, gifts…) and the deadpan "benefit" makes it funnier. '
    + 'Alternate who it targets (HIM / HER / YOUR BESTIE / YOUR MAN). It may riff on one of the real headlines below if one fits, otherwise invent. '
    + 'SAFETY: it is satire — nothing anyone could get hurt following (no drugs, alcohol, medication, diets/fasting, dangerous stunts, skipping doctors), not explicit (suggestive like "daddy" is fine), '
    + 'never real people, celebrities or brands-as-targets, nothing about race, religion, nationality, politics, kids, death or assault. '
    + `Recent posts — use a DIFFERENT ask, a DIFFERENT benefit (rotate: lifespan, immune system, blood pressure, credit score, IQ, sleep, skin, height, hairline, stress, heart, metabolism…) and switch who it targets: ${recent.join(' | ') || 'none'}.\n`
    + 'Write: "headline": 6–12 words, ALL CAPS, the formula; then split it into the NEAR news-cover lines (each line is set on ONE line, so keep them short): '
    + '"top": ≤20 chars small kicker line (e.g. "NEW STUDY:", "SCIENTISTS CONFIRM:", "DOCTORS SAY"), "main": ≤18 chars, "highlight": ≤14 chars (the ridiculous ask, shown huge in blue), "bottom": ≤22 chars (the benefit) — read in order they say the headline; '
    + '"image": an exaggerated, comedic, photorealistic viral-meme scene ACTING OUT the first half, very over the top (e.g. for the daddy one: a woman with giant glowing cartoon heart-shaped eyes swooning while calling her boyfriend daddy, he looks smug and glowing with health, '
    + 'hearts floating) — describe exactly who is where doing what and their exaggerated expressions; invented ordinary people, no text; '
    + '"cta": short call to action printed on the image, ALL CAPS, ≤22 chars + 1 emoji, addressed to whoever should DO the ask (buying HER flowers → "SEND THIS TO HIM 👀"; calling HIM daddy → "SEND THIS TO HER 👀"; e.g. "SEND TO YOUR MAN 😭", "TAG YOUR BESTIE 🫶"); '
    + '"caption": 1–2 deadpan lines in fake-news voice ("A new study found that…") + the same send-it line; "hashtags": 2 hashtags (the code adds #satire); "angle": 3-word label. '
    + 'First draft 5 options, score each "send": 1–10 = how likely someone forwards it to their partner/friend right now, then return ONLY the best. '
    + 'Reply JSON {"send": n, "headline": "", "top": "", "main": "", "highlight": "", "bottom": "", "image": "", "cta": "", "caption": "", "hashtags": [], "angle": ""}.' },
  { role: 'user', content: (topic ? `THE OWNER PICKED THE ASK FOR THIS ONE — build it around: ${topic}\n\n` : '') + 'Real headlines for inspiration (optional):\n' + items.slice(0, 40).map(i => `- ${i.title}`).join('\n') }], 'write');
}

async function makeOne(n, items, recent, dryRun, topic = '') {
  step(`Shareslop ${n}`);
  const w = await write(items, recent, topic);
  if (!w?.headline || !w.image) throw new Error('writer returned nothing usable: ' + JSON.stringify(w).slice(0, 200));
  if (!topic && !(+w.send >= 7)) throw new Error(`best option only scored ${w.send}/10 for sharing ("${w.headline}") — skipped`);
  const id = `${new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })}-${String(Date.now()).slice(-6)}`;
  const dir = path.join(ROOT, 'out', 'shareslop', id);
  fs.mkdirSync(dir, { recursive: true });
  console.log(`  → ${w.headline}  [${w.top} / ${w.main} / ${w.highlight} / ${w.bottom}] (send ${w.send}/10; cta: ${w.cta})`);
  // the image service sometimes rejects a scene (400 on the little-spoon one, Oct 6): retry once with a tamer, fully clothed version
  const img = await aiImage(w.image, dir, 'image', 'people')
    || await aiImage(`Wholesome, funny, fully clothed comedic photo of an ordinary couple acting out: "${w.headline}". Big exaggerated happy expressions, bright warm light`, dir, 'image', 'people');
  if (!img) throw new Error('no image');
  const post = { id, cta: String(w.cta || 'SEND THIS TO HIM 👀').toLowerCase(), headline: w.headline.toUpperCase(),
    cover: { top: w.top, main: w.main, highlight: w.highlight || w.headline, bottom: w.bottom, photoFile: path.basename(img.file), credit: 'AI illustration' }, image: w.image, imageFile: img.file, angle: w.angle,
    caption: `${w.caption}\n\n${[...(w.hashtags || []).slice(0, 2), 'satire'].map(h => '#' + String(h).replace(/^#/, '')).join(' ')}`.trim() };
  const jpg = await renderShareCover(post.cover, dir, path.join(dir, 'slide.jpg'), post.cta);
  // a 7 s Reel of the still (Reels need video; the song is added by Instagram) — silent track so the song mixes in cleanly
  const mp4 = path.join(dir, `shareslop-${id}.mp4`);
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-loop', '1', '-i', jpg, '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', '7',
    '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', mp4]);
  writeJSON(path.join(dir, 'post.json'), { ...post, video: path.basename(mp4) });
  fs.mkdirSync(path.dirname(SEEN), { recursive: true });
  fs.appendFileSync(SEEN, `${key(post.headline)}\t${post.angle || ''}\t${id}\n`);
  if (dryRun) { console.log(`  (dry run) ${dir}`); return post; }
  const { publishReelWithMusic } = await import('./publish.mjs');
  await publishReelWithMusic(mp4, post.caption, { audioVolume: 70 }); // no voice → the song carries it
  return post;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const count = Math.max(1, Math.min(5, +(args[args.indexOf('--count') + 1]) || 1));
  const topic = args.includes('--topic') ? args[args.indexOf('--topic') + 1] : '';
  const items = await candidates();
  console.log(`${items.length} candidate headlines`);
  const recent = (fs.existsSync(SEEN) ? fs.readFileSync(SEEN, 'utf8').trim().split('\n').slice(-15) : []).map(l => l.split('\t')[0]).filter(Boolean);
  let ok = 0;
  for (let n = 1; n <= count; n++) {
    try { const p = await makeOne(n, items, recent, dryRun, n === 1 ? topic : ''); recent.push(p.headline); ok++; }
    catch (e) { console.log(`  (shareslop ${n} failed: ${e.message.slice(0, 300)})`); }
  }
  if (!ok) process.exit(1);
}
