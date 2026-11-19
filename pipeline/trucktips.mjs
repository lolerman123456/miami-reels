// TruLoader concept Reels (owner, Nov 19) → src/Cards.tsx, posted to the TruLoader Facebook Page by pipeline/truloader.mjs.
// Data concepts use real numbers only: truloader.com top-lanes (lanes, topStates) and EIA weekly retail diesel by region.
// Evergreen concepts (broker red flags, funny "what your truck says about you"…) are written here once.
import path from 'node:path';
import fs from 'node:fs';
import { ROOT, readJSON, step } from './util.mjs';
import { STATES, getJSON } from './truloader.mjs';

const FPS = 30;
const TAGS = '#trucking #truckinglife #truckdriver #owneroperator #freight #loadboard #trucker #truckers #logistics #cdl';
const money = (n, d = 2) => `$${Number(n).toFixed(d)}`;
const sayMoney = (n) => { const [d, c] = Number(n).toFixed(2).split('.'); return c === '00' ? `${d} dollars` : `${d} ${c.startsWith('0') ? `oh ${c[1]}` : c}`; };

// ---------- EIA weekly retail diesel (on-highway) by region ----------
const PADD = {
  'New England': ['CT', 'ME', 'MA', 'NH', 'RI', 'VT'],
  'Central Atlantic': ['DE', 'DC', 'MD', 'NJ', 'NY', 'PA'],
  'Lower Atlantic': ['FL', 'GA', 'NC', 'SC', 'VA', 'WV'],
  Midwest: ['IL', 'IN', 'IA', 'KS', 'KY', 'MI', 'MN', 'MO', 'NE', 'ND', 'SD', 'OH', 'OK', 'TN', 'WI'],
  'Gulf Coast': ['AL', 'AR', 'LA', 'MS', 'NM', 'TX'],
  'Rocky Mountain': ['CO', 'ID', 'MT', 'UT', 'WY'],
  'West Coast (not CA)': ['AZ', 'NV', 'OR', 'WA'],
  California: ['CA'],
};
export async function dieselByRegion() {
  const r = await fetch('https://www.eia.gov/petroleum/gasdiesel/', { headers: { 'user-agent': 'Mozilla/5.0' } });
  if (!r.ok) throw new Error(`EIA → HTTP ${r.status}`);
  const html = await r.text();
  const clean = (x) => x.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
  // The page has gasoline tables first, then the diesel table: the diesel one is the region table whose U.S. price is highest.
  const tables = [...html.matchAll(/<table[\s\S]*?<\/table>/g)].map(m => [...m[0].matchAll(/<tr[\s\S]*?<\/tr>/g)].map(row => [...row[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map(c => clean(c[1]))));
  const regionTables = tables.filter(t => t.some(r => r[0]?.startsWith('Midwest')));
  const t = regionTables.sort((a, b) => Number(b.find(r => r[0] === 'U.S.')?.[3]) - Number(a.find(r => r[0] === 'U.S.')?.[3]))[0];
  if (!t) throw new Error('EIA diesel table not found');
  const date = t[1]?.[3] || '';
  const get = (name) => { const row = t.find(r => r[0]?.startsWith(name)); return row ? { price: Number(row[3]), weekChange: Number(row[6]) } : null; };
  const us = get('U.S.');
  const regions = Object.keys(PADD).map(name => ({ name, states: PADD[name], ...get(name === 'West Coast (not CA)' ? 'West Coast less California' : name) })).filter(x => x.price > 0);
  if (!us || regions.length < 5) throw new Error('EIA diesel table incomplete');
  return { date, us, regions };
}

// ---------- concepts ----------
const shadeFor = (abbrs, color) => Object.fromEntries(abbrs.map(a => [STATES[a], color]).filter(([k]) => k));
const heat = (k) => { const a = [34, 197, 94], b = [239, 68, 68]; return `rgb(${a.map((x, i) => Math.round(x + (b[i] - x) * k)).join(',')})`; }; // green → red

const BUILDERS = {
  async deadhead(ctx) {
    const lane = ctx.lanes.lanes?.[0]; if (!lane) throw new Error('no lanes');
    const diesel = (await dieselByRegion()).us.price;
    const D = 200, mpg = 6.5, M = lane.miles, pay = lane.avgRate;
    const fuel = ((M + D) / mpg) * diesel, real = pay / (M + D), net = (pay - fuel) / (M + D);
    const from = `${lane.origin.city}, ${lane.origin.state}`, to = `${lane.destination.city}, ${lane.destination.state}`;
    return {
      id: `deadhead-${ctx.lanes.weekStart}`, ttlDays: 6, title: ['IS IT WORTH', '200 MILES EMPTY?'], tag: 'DEADHEAD MATH',
      source: `Rate: avg posted on load boards (truloader.com). Diesel: EIA U.S. avg ${ctx.dieselDate || ''}. 6.5 mpg assumed.`,
      hook: `This load pays ${sayMoney(lane.avgRatePerMile)} a mile. But it's two hundred miles away. Is it worth it?`,
      items: [
        { kicker: 'THE LOAD', big: `${money(lane.avgRatePerMile)}/mi`, title: `${from} → ${to}`, sub: `${M} loaded miles, ${money(pay, 0)} total`, say: `The load. ${from.split(',')[0]} to ${to.split(',')[0]}. ${M} miles for ${pay} dollars.` },
        { kicker: 'THE CATCH', big: `${D} MI`, title: 'Empty, just to get there', sub: `Now it's ${M + D} miles of driving`, say: `But you're two hundred miles out. Now it's ${M + D} miles of driving.` },
        { kicker: 'FUEL', big: money(fuel, 0), title: `${M + D} mi ÷ ${mpg} mpg × ${money(diesel)}`, sub: 'Diesel at this week’s U.S. average', say: `Fuel for all of it, at this week's diesel price: about ${Math.round(fuel)} dollars.` },
        { kicker: 'REAL RATE', big: `${money(real)}/mi`, title: `${money(net)}/mi after fuel`, sub: 'Every mile counted, not just the loaded ones', say: `Your real rate is ${sayMoney(real)} a mile. ${sayMoney(net)} after fuel.` },
        { kicker: 'VERDICT', big: net > 1.5 ? 'TAKE IT' : net > 0.8 ? 'MAYBE' : 'PASS', title: 'Know your cost per mile', sub: `If your costs (truck, insurance, you) are under ${money(net)}/mi, it pays`, say: net > 1.5 ? 'Still worth it, if your cost per mile is under that.' : 'Only worth it if your cost per mile is under that number.' },
      ],
      caption: `Would you deadhead 200 miles for this one? 🤔\n\n${from} → ${to}: ${money(lane.avgRatePerMile)}/mi loaded, ${money(real)}/mi all-in, ${money(net)}/mi after fuel (EIA diesel ${money(diesel)}, 6.5 mpg).\n\nTruLoader shows you every load near you first, so you're not driving 200 miles empty. Try it free for 3 days: truloader.com\n\n${TAGS} #deadhead`,
    };
  },
  async states(ctx) {
    const top = (ctx.lanes.topStates || []).slice(0, 5); if (top.length < 3) throw new Error('no topStates');
    return {
      id: `states-${ctx.lanes.weekStart}`, ttlDays: 6, title: ['THE STATES PAYING', 'THE MOST RIGHT NOW'], tag: `TOP PAYING STATES · ${ctx.week}`,
      source: 'Avg posted rate per mile for loads picking up in each state this week · truloader.com',
      hook: 'These are the states paying truckers the most per mile right now.',
      items: top.reverse().map((s, i, a) => ({
        kicker: `#${a.length - i}`, big: `${money(s.avgRatePerMile)}/mi`, title: STATES[s.state] || s.state, sub: `${s.loadCount.toLocaleString('en-US')} loads posted this week`,
        say: `Number ${a.length - i}. ${STATES[s.state] || s.state}. ${sayMoney(s.avgRatePerMile)} a mile.`, shade: shadeFor([s.state], '#FDC902'),
      })),
      caption: `💰 States paying the most per mile this week (${ctx.week.toLowerCase()})\n\n${[...top].reverse().map((s, i) => `#${i + 1} ${STATES[s.state]}: ${money(s.avgRatePerMile)}/mi (${s.loadCount} loads)`).join('\n')}\n\nIs your state on here? 👇\n\nEvery load board in one feed: truloader.com (3 days free)\n\n${TAGS}`,
    };
  },
  async fuel(ctx) {
    const f = await dieselByRegion();
    const rs = [...f.regions].sort((a, b) => a.price - b.price);
    const lo = rs[0].price, hi = rs[rs.length - 1].price;
    const shade = Object.assign({}, ...rs.map(r => shadeFor(r.states, heat(rs.indexOf(r) / (rs.length - 1)))));
    const pick = [rs[0], rs[1], rs[Math.floor(rs.length / 2)], rs[rs.length - 2], rs[rs.length - 1]];
    const fmtCh = (c) => (c ? `${c < 0 ? '▼' : '▲'} ${Math.abs(c * 100).toFixed(0)}¢ vs last week` : '');
    return {
      id: `fuel-${f.date.replace(/\//g, '-')}`, ttlDays: 6, title: ['WHERE TO FILL UP', 'THIS WEEK'], tag: `DIESEL BY REGION · WEEK OF ${f.date}`,
      source: `Avg retail on-highway diesel, U.S. EIA, week of ${f.date}`,
      hook: `Diesel is ${sayMoney(f.us.price)} a gallon on average this week. Here's where to fill up, and where not to.`,
      items: pick.map((r, i) => ({
        kicker: i === 0 ? 'CHEAPEST' : i === pick.length - 1 ? 'MOST EXPENSIVE' : i === 1 ? '2ND CHEAPEST' : i === 2 ? 'MIDDLE' : '2ND PRICIEST',
        big: money(r.price, 3), title: r.name, sub: [r.states.join(' · '), fmtCh(r.weekChange)].filter(Boolean).join('\n'),
        say: `${i === 0 ? 'Cheapest' : i === pick.length - 1 ? 'Most expensive' : ''} ${r.name}. ${sayMoney(r.price)}.`.trim(), shade,
      })),
      caption: `⛽ Diesel by region this week (EIA, week of ${f.date}). U.S. avg ${money(f.us.price, 3)}/gal.\n\n${rs.map(r => `${r.name}: ${money(r.price, 3)}`).join('\n')}\n\nWhere are you filling up? 👇\n\nFind loads that pay for the fuel: truloader.com (3 days free)\n\n${TAGS} #diesel`,
    };
  },
  async redflags() {
    return {
      id: 'redflags-1', ttlDays: 30, title: ['5 SIGNS A LOAD', 'IS A SCAM'], tag: 'BROKER RED FLAGS', source: '',
      hook: 'Five signs that load is a scam. Number three gets drivers every week.',
      items: [
        { kicker: '#1', big: '', title: 'Their MC number is brand new', sub: 'A few weeks old? Look up the authority date on FMCSA before you book', say: 'One. Their MC number is brand new. Check the authority date before you book.' },
        { kicker: '#2', big: '', title: 'The rate is way above the lane', sub: 'If it pays a dollar more than everything else, ask why', say: 'Two. The rate is way above everything else on that lane.' },
        { kicker: '#3', big: '', title: 'The email doesn’t match the company', sub: 'Gmail, or one letter off the real domain = someone posing as a real broker', say: 'Three. The email doesn’t match the company. One letter off is all it takes.' },
        { kicker: '#4', big: '', title: 'They want money from YOU', sub: 'Any “setup fee”, deposit or payment app request is a no', say: 'Four. They ask you for money. A setup fee, a deposit. That’s a no.' },
        { kicker: '#5', big: '', title: 'No rate con, or the address changes', sub: 'Get it in writing before you roll. New pickup after dispatch? Call the shipper', say: 'Five. No rate confirmation, or the pickup address changes after dispatch.' },
      ],
      caption: `🚩 5 signs a load is a scam. #3 gets drivers every week.\n\n1. Brand new MC number\n2. Rate way above the lane\n3. Email doesn't match the company\n4. They want money from you\n5. No rate con / address changes after dispatch\n\nTruLoader runs a broker check on every load before you call. Try it free for 3 days: truloader.com\n\nTag a driver who needs this 👇\n\n${TAGS} #doublebrokering`,
    };
  },
  async truck() {
    const t = [
      ['PETERBILT 389', 'His chrome budget is bigger than his retirement.', 'Peterbilt three eighty nine. His chrome budget is bigger than his retirement.'],
      ['KENWORTH W900', 'Still says “10-4” at the dinner table.', 'Kenworth W nine hundred. Still says ten four at the dinner table.'],
      ['FREIGHTLINER CASCADIA', 'Company driver. 14 years. Many opinions about dispatch.', 'Freightliner Cascadia. Company driver, fourteen years. Many opinions about dispatch.'],
      ['VOLVO VNL', 'Sleeps 8 hours, eats salad, reads the manual. Suspicious.', 'Volvo. Sleeps eight hours, eats salad, reads the manual. Suspicious.'],
      ['INTERNATIONAL LT', 'Bought it used, fixed it himself, will tell you about it. Twice.', 'International. Bought it used, fixed it himself, and will tell you about it. Twice.'],
      ['MACK ANTHEM', 'Says “they don’t build ’em like they used to.” Is right.', 'Mack. Says they don’t build them like they used to. And he’s right.'],
    ];
    return {
      id: 'truck-1', ttlDays: 60, funny: true, title: ['WHAT YOUR TRUCK', 'SAYS ABOUT YOU'], tag: 'WHAT YOUR TRUCK SAYS ABOUT YOU', source: '', showMap: false,
      hook: 'What your truck says about you. Be honest, which one are you?',
      items: t.map(([k, title, say]) => ({ kicker: k, big: '', title, sub: '', say })),
      cta: 'Whatever you drive, find the loads that pay.',
      caption: `What your truck says about you 😂 Which one are you? Be honest 👇\n\nPete 389, W900, Cascadia, Volvo, International or Mack?\n\nWhatever you drive: every load board in one feed, truloader.com (3 days free)\n\n${TAGS} #peterbilt #kenworth`,
    };
  },
  async trailer() {
    const t = [
      ['FLATBED', 'Can tarp a load in a thunderstorm. Can’t find his reading glasses.', 'Flatbed. Can tarp a load in a thunderstorm. Can’t find his reading glasses.'],
      ['REEFER', 'Hears that unit kick on in his sleep. Wakes up anyway.', 'Reefer. Hears that unit kick on in his sleep.'],
      ['DRY VAN', 'Has waited 6 hours at a dock and called it “a good day.”', 'Dry van. Has waited six hours at a dock and called it a good day.'],
      ['STEP DECK', 'Measures everything. Twice. Including the grill.', 'Step deck. Measures everything twice. Including the grill.'],
      ['HOTSHOT', 'Tells everyone it’s “basically the same thing.”', 'Hotshot. Tells everyone it’s basically the same thing.'],
    ];
    return {
      id: 'trailer-1', ttlDays: 60, funny: true, title: ['WHAT YOUR TRAILER', 'SAYS ABOUT YOU'], tag: 'WHAT YOUR TRAILER SAYS ABOUT YOU', source: '', showMap: false,
      hook: 'What your trailer says about you. Number five is going to start a fight.',
      items: t.map(([k, title, say]) => ({ kicker: k, big: '', title, sub: '', say })),
      cta: 'Flatbed, reefer or van: find the loads that pay.',
      caption: `What your trailer says about you 😂 Hotshot guys, don't come at us 👇\n\nFind your next load on every board at once: truloader.com (3 days free)\n\n${TAGS} #flatbed #reefer`,
    };
  },
  async oldschool() {
    const t = [
      ['PAPER LOGBOOKS', 'Before the ELD mandate in 2017, every hour was on paper.', 'Paper logbooks. Before twenty seventeen, every hour was written by hand.'],
      ['YOUR CB HANDLE', 'Everybody knew you by it. Nobody knew your real name.', 'Your CB handle. Everybody knew it. Nobody knew your real name.'],
      ['TRUCK STOP PAY PHONES', 'A line of drivers and a pocket full of quarters to call home.', 'Pay phones at the truck stop, and a pocket full of quarters to call home.'],
      ['THE ROAD ATLAS', 'Folded, coffee-stained, and better than any GPS.', 'The road atlas. Coffee stained, and better than any GPS.'],
      ['THE LOAD BOARD ON THE WALL', 'Loads on a board at the truck stop. Now it’s in your pocket.', 'Loads posted on a board on the truck stop wall.'],
    ];
    return {
      id: 'oldschool-1', ttlDays: 60, funny: true, title: ['ONLY REAL TRUCKERS', 'REMEMBER THIS'], tag: 'OLD SCHOOL TRUCKING', source: '', showMap: false,
      hook: 'Only real truckers remember these. How many do you remember?',
      items: t.map(([k, title, say]) => ({ kicker: k, big: '', title, sub: '', say })),
      cta: 'The load board moved to your phone. All of them, in one feed.',
      caption: `Only real truckers remember these 🚛 How many do you remember? 👇\n\nThe load board on the wall is now every load board in one app: truloader.com (3 days free)\n\n${TAGS} #oldschooltrucking`,
    };
  },
};
export const CONCEPTS = Object.keys(BUILDERS);

// ---------- build Cards props + voice (same Kokoro am_adam flow as the lanes Reel) ----------
export async function buildConcept(name, { dir, lanes, brand }) {
  const fn = BUILDERS[name]; if (!fn) throw new Error(`unknown concept ${name} (have: ${CONCEPTS.join(', ')})`);
  const fmtDay = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const ctx = { lanes, week: lanes ? `${fmtDay(lanes.weekStart)} – ${fmtDay(lanes.weekEnd)}`.toUpperCase() : '' };
  const spec = await fn(ctx);
  const map = readJSON(path.join(ROOT, 'assets', 'truloader', 'us-states.json'));
  const props = {
    durationInFrames: 0, hookFrames: 75, outroFrames: 120, title: spec.title, tag: spec.tag,
    states: map.states.map(s => ({ d: s.d, name: s.name })), mapW: map.w, mapH: map.h, showMap: spec.showMap !== false,
    items: [], colors: { primary: brand.primary || '#0066FF', secondary: brand.secondary || '#0B1220', accent: brand.accent || '#FDC902' },
    cta: spec.cta || 'Every load board in one feed — with a broker check on every load.', site: 'truloader.com', source: spec.source || '', narration: null, music: null,
  };
  step(`Voiceover for ${spec.id}`);
  const scenes = [{ text: spec.hook }, ...spec.items.map(i => ({ text: i.say })), { text: 'Find loads like these in one feed, with a broker check on every load. Try Truloader free for three days.' }];
  const fr = (sec) => Math.ceil(sec * FPS);
  let at = 75;
  try {
    process.env.KOKORO_VOICE ||= 'am_adam'; process.env.KOKORO_SPEED ||= '1.2';
    const { makeNarration } = await import('./voice.mjs');
    const { timeline } = await makeNarration({ voice: { provider: 'kokoro' }, scenes }, dir);
    props.hookFrames = Math.max(60, fr(timeline[0].duration)); at = props.hookFrames;
    spec.items.forEach((it, i) => { const d = Math.max(66, fr(timeline[i + 1].duration) + 10); props.items.push({ ...it, start: at, dur: d }); at += d; });
    const { execFileSync } = await import('node:child_process');
    const parts = timeline.map((t, i) => ({ file: path.join(dir, 'voice', `${i}.wav`), at: i === 0 ? t.speechStart : (i <= spec.items.length ? props.items[i - 1].start / FPS + 0.15 : at / FPS + 0.4) }));
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...parts.flatMap(p => ['-i', p.file]), '-filter_complex',
      `${parts.map((p, i) => `[${i}]adelay=${Math.round(p.at * 1000)}:all=1[a${i}]`).join(';')};${parts.map((_, i) => `[a${i}]`).join('')}amix=inputs=${parts.length}:normalize=0,loudnorm=I=-14:TP=-1.5[out]`,
      '-map', '[out]', '-ar', '44100', path.join(dir, 'voiceover.wav')]);
    props.outroFrames = Math.max(120, fr(timeline[timeline.length - 1].speech + 1.4));
    props.narration = 'voiceover.wav';
  } catch (e) {
    console.log(`⚠ voiceover failed (${String(e.message).slice(0, 200)}) — continuing without voice`);
    props.items = []; at = 75; spec.items.forEach(it => { props.items.push({ ...it, start: at, dur: 90 }); at += 90; });
  }
  props.durationInFrames = at + props.outroFrames;
  if (process.env.TRULOADER_BEAT !== '0') {
    const { makeBeat } = await import('./beat.mjs');
    makeBeat(path.join(dir, 'music.wav'), props.durationInFrames / FPS + 1, { light: true, seed: Date.now() % 1000 });
    props.music = 'music.wav';
  }
  for (const it of props.items) delete it.say;
  return { spec, props };
}

// ---------- which concept a scheduled slot posts ----------
// Weekly data Reels first (each once a week), evergreen ones when nothing new; a funny one at most every 4 days ("once in a blue moon").
const ORDER = ['lanes', 'deadhead', 'states', 'fuel', 'one', 'redflags', 'lanes5', 'lanes3'];
const FUNNY = ['truck', 'trailer', 'oldschool'];
export function pickSlot(log, now = new Date()) {
  const lines = log.split('\n').filter(l => l.includes('\ttruloader:'));
  const days = (k) => (now - Math.max(0, ...lines.filter(l => l.split('\t')[1]?.startsWith(`truloader:${k}-`)).map(l => Date.parse(l.split('\t')[0]) || 0))) / 864e5;
  const nyHour = Number(now.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }));
  if (nyHour >= 18 && Math.min(...FUNNY.map(days)) >= 4) { /* evening slot only */ const f = FUNNY.find(k => days(k) >= 60); if (f) return f; }
  return ORDER.find(k => days(k) >= (k === 'redflags' ? 21 : 6)) || null;
}
