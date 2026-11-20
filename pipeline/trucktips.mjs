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
    // Owner, Nov 19: "boring" → each state also gets its diesel price (EIA region), what's left after fuel, and its best lane this week.
    const f = await dieselByRegion().catch(() => null);
    const mpg = 6.5;
    const regionOf = (st) => f?.regions.find(r => r.states.includes(st));
    const laneFrom = (st) => (ctx.lanes.lanes || []).find(l => l.origin?.state === st);
    const avg = top.reduce((a, s) => a + s.avgRatePerMile, 0) / top.length;
    const detail = (s) => {
      const r = regionOf(s.state), l = laneFrom(s.state);
      const net = r ? s.avgRatePerMile - r.price / mpg : null;
      return {
        sub: [r && `⛽ Diesel ${money(r.price, 2)}/gal · ~${money(net)}/mi left after fuel`, l ? `🔥 Best lane: ${l.origin.city} → ${l.destination.city}, ${l.destination.state} at ${money(l.avgRatePerMile)}/mi` : `📦 ${s.loadCount.toLocaleString('en-US')} loads posted this week`].filter(Boolean).join('\n'),
        say: [r && `Diesel there is about ${sayMoney(r.price)} a gallon, so you keep about ${sayMoney(net)} a mile after fuel.`, l ? `Best lane out of there: ${l.origin.city} to ${l.destination.city}, at ${sayMoney(l.avgRatePerMile)} a mile.` : `${s.loadCount.toLocaleString('en-US')} loads posted this week.`].filter(Boolean).join(' '),
        r, l, net,
      };
    };
    return {
      id: `states-${ctx.lanes.weekStart}`, ttlDays: 6, title: ['THE STATES PAYING', 'THE MOST RIGHT NOW'], tag: `TOP PAYING STATES · ${ctx.week}`,
      source: `Avg posted rate per mile for loads picking up in each state this week · truloader.com${f ? ` · Diesel: U.S. EIA regional avg, week of ${f.date}, ${mpg} mpg` : ''}`,
      hook: 'These are the states paying truckers the most per mile right now. And what you actually keep after fuel.',
      items: [...top].reverse().map((s, i, a) => { const d = detail(s); return {
        kicker: `#${a.length - i} · ${s.loadCount.toLocaleString('en-US')} LOADS`, big: `${money(s.avgRatePerMile)}/mi`, title: STATES[s.state] || s.state, sub: d.sub,
        say: `Number ${a.length - i}. ${STATES[s.state] || s.state}. ${sayMoney(s.avgRatePerMile)} a mile. ${d.say}`, shade: shadeFor([s.state], '#FDC902'), focus: [s.state],
      }; }),
      caption: `💰 States paying the most per mile this week (${ctx.week.toLowerCase()}), and what's left after diesel\n\n${top.map((s, i) => { const d = detail(s); return `#${i + 1} ${STATES[s.state]}: ${money(s.avgRatePerMile)}/mi${d.r ? ` · diesel ${money(d.r.price)} · ~${money(d.net)}/mi after fuel` : ''}`; }).join('\n')}\n\nTop 5 average: ${money(avg)}/mi. Is your state on here? 👇\n\nEvery load board in one feed: truloader.com (3 days free)\n\n${TAGS}`,
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
        say: `${i === 0 ? 'Cheapest' : i === pick.length - 1 ? 'Most expensive' : ''} ${r.name}. ${sayMoney(r.price)}.`.trim(), shade, focus: r.states,
      })),
      caption: `⛽ Diesel by region this week (EIA, week of ${f.date}). U.S. avg ${money(f.us.price, 3)}/gal.\n\n${rs.map(r => `${r.name}: ${money(r.price, 3)}`).join('\n')}\n\nWhere are you filling up? 👇\n\nFind loads that pay for the fuel: truloader.com (3 days free)\n\n${TAGS} #diesel`,
    };
  },
};
// ---------- evergreen packs (owner, Nov 19: "write more evergreen packs so it's 4 a day") ----------
// [kicker, title, sub, spoken?]. Spoken defaults to "kicker. title". funny packs post at most every 4 days, evening slot only.
const PACKS = [
  { key: 'redflags', photos: ['truck driver phone', 'semi truck parked', 'loading dock trucks', 'truck stop night', 'semi trailer truck highway'], title: ['5 SIGNS A LOAD', 'IS A SCAM'], tag: 'BROKER RED FLAGS', hook: 'Five signs that load is a scam. Number three gets drivers every week.', ask: 'Tag a driver who needs this 👇', tags: '#doublebrokering', items: [
    ['#1', 'Their MC number is brand new', 'A few weeks old? Look up the authority date on FMCSA before you book', 'One. Their MC number is brand new. Check the authority date before you book.'],
    ['#2', 'The rate is way above the lane', 'If it pays a dollar more than everything else, ask why', 'Two. The rate is way above everything else on that lane.'],
    ['#3', 'The email doesn’t match the company', 'Gmail, or one letter off the real domain = someone posing as a real broker', 'Three. The email doesn’t match the company. One letter off is all it takes.'],
    ['#4', 'They want money from YOU', 'Any “setup fee”, deposit or payment app request is a no', 'Four. They ask you for money. A setup fee, a deposit. That’s a no.'],
    ['#5', 'No rate con, or the address changes', 'Get it in writing before you roll. New pickup after dispatch? Call the shipper', 'Five. No rate confirmation, or the pickup address changes after dispatch.']] },
  { key: 'brokercheck', photos: ['semi truck highway', 'freight broker office', 'truck stop', 'loading dock semi', 'truck driver cab'], title: ['CHECK THIS BEFORE', 'YOU BOOK A LOAD'], tag: 'BROKER CHECK', hook: 'Check these five things before you book with a broker you don’t know.', ask: 'What do you check first? 👇', items: [
    ['AUTHORITY', 'Active broker authority', 'Look up their MC on FMCSA. Active, and not brand new'],
    ['BOND', 'Broker bond on file', 'Brokers need a $75,000 bond. No bond, no load', 'Bond. Brokers need a seventy five thousand dollar bond on file.'],
    ['PAY', 'How fast do they pay?', 'Days to pay and credit score tell you who pays late'],
    ['REVIEWS', 'What other drivers say', 'One bad review is noise. Ten is a pattern'],
    ['RATE CON', 'Everything on paper', 'Rate, stops, times, detention, lumper. Before you roll']] },
  { key: 'rookie', photos: ['semi truck highway', 'truck stop parking', 'loading dock trucks', 'semi truck night', 'empty flatbed trailer'], title: ['ROOKIE MISTAKES', 'THAT COST YOU MONEY'], tag: 'ROOKIE MISTAKES', hook: 'Rookie mistakes that cost you money. Most drivers made number two.', ask: 'Which one did you make? 👇', items: [
    ['#1', 'Taking the first load offered', 'The first number is the broker’s best case, not yours', 'One. Taking the first load they offer.'],
    ['#2', 'Forgetting the deadhead', 'A great rate 200 miles away isn’t a great rate', 'Two. Forgetting the deadhead miles.'],
    ['#3', 'Not knowing your cost per mile', 'If you don’t know it, you can’t tell a good load from a bad one', 'Three. Not knowing your cost per mile.'],
    ['#4', 'Booking without detention terms', 'Six hours at a dock for free adds up fast', 'Four. Booking without detention terms.'],
    ['#5', 'No plan for the reload', 'Delivering into a dead market means driving out empty', 'Five. No plan for the next load out.']] },
  { key: 'negotiate', photos: ['truck driver phone', 'semi truck parked', 'freight yard trucks', 'semi truck sunset', 'truck driver cab'], title: ['GET MORE PER MILE', 'FROM ANY BROKER'], tag: 'NEGOTIATING', hook: 'How to get more per mile from any broker. Use number three today.', ask: 'What’s your best negotiating line? 👇', items: [
    ['KNOW THE LANE', 'Know what it usually pays', 'Check the lane average before you call'],
    ['ASK', '“What’s the best you can do?”', 'Then stay quiet. Let them fill the silence', 'Ask. What’s the best you can do? Then stay quiet.'],
    ['TIMING', 'Late-day loads pay more', 'Loads still posted in the afternoon are hot. Brokers need trucks', 'Timing. Loads still posted late in the day pay more.'],
    ['LEVERAGE', '“I’m empty and close”', 'A truck that can load today is worth more to them'],
    ['LOCK IT', 'Get it on the rate con', 'A promise on the phone is not a rate']] },
  { key: 'costpermile', photos: ['truck fuel pump diesel', 'semi truck highway', 'truck repair shop', 'semi truck tires', 'truck driver'], title: ['DO YOU KNOW YOUR', 'COST PER MILE?'], tag: 'COST PER MILE', hook: 'Most owner operators can’t answer this. What’s your cost per mile?', ask: 'Owner-operators: what’s yours? 👇', items: [
    ['FUEL', 'Usually the biggest one', 'Gallons per mile × what you pay at the pump'],
    ['TRUCK & TRAILER', 'Payments or lease', 'Divide the monthly payment by the miles you run'],
    ['INSURANCE', 'Every month, loaded or not', 'Spread it over your yearly miles'],
    ['MAINTENANCE', 'Tires, oil, repairs', 'Set money aside every mile. It always comes due'],
    ['YOU', 'Pay yourself', 'If it’s not in the math, you’re working for free']] },
  { key: 'detention', photos: ['loading dock trucks', 'warehouse loading dock', 'semi trucks waiting', 'distribution center trucks', 'truck stop'], title: ['GET PAID', 'FOR WAITING'], tag: 'DETENTION PAY', hook: 'Sitting at the dock for free? Here’s how to get paid for waiting.', ask: 'Longest you’ve waited at a dock? 👇', items: [
    ['BEFORE', 'Ask the detention terms', 'How many free hours, and how much per hour after'],
    ['ON PAPER', 'Put it on the rate con', 'If it’s not written down, it didn’t happen'],
    ['TIMES', 'Get in and out times signed', 'On the BOL, every time'],
    ['UPDATE', 'Tell the broker early', 'Let them know before the free time runs out'],
    ['PROOF', 'Photos with timestamps', 'Check-in, the dock, the clock. Proof gets paid']] },
  { key: 'winter', photos: ['semi truck snow', 'truck tire chains', 'semi truck winter highway', 'truck stop snow', 'icy bridge road'], title: ['WINTER DRIVING', 'CHECKLIST'], tag: 'WINTER READY', hook: 'Winter is here. Five things to check before your next run.', ask: 'What’s in your winter kit? 👇', tags: '#winterdriving', items: [
    ['DIESEL', 'Anti-gel before the cold hits', 'Treat the fuel before it gels, not after'],
    ['CHAINS', 'Chains, and you know how', 'Some passes require them. Practice before you need it'],
    ['TANKS', 'Keep the tanks full', 'Less condensation, and fuel if you get stuck'],
    ['KIT', 'Warm clothes, food, water', 'Assume you could sit for hours'],
    ['BRIDGES', 'Bridges freeze first', 'Slow down before the overpass, not on it']] },
  { key: 'fuelsave', photos: ['semi truck highway', 'diesel pump truck stop', 'idling truck', 'semi truck tires', 'truck aerodynamic'], title: ['SAVE ON FUEL', 'STARTING TODAY'], tag: 'FUEL SAVING', hook: 'Five ways to burn less fuel, starting today.', ask: 'Best fuel trick you know? 👇', tags: '#diesel', items: [
    ['SPEED', 'Slow down a little', 'Wind drag grows fast with speed. A few mph saves real money'],
    ['IDLE', 'Idle less', 'Idling burns fuel for zero miles'],
    ['TIRES', 'Check tire pressure', 'Low tires drag and burn more fuel'],
    ['WHERE', 'Fuel where it’s cheaper', 'Prices change a lot by region. Plan the stop'],
    ['SMOOTH', 'Easy on the throttle', 'Smooth starts and coasting to stops add up']] },
  { key: 'loadtips', photos: ['semi truck highway', 'freight yard', 'flatbed trailer load', 'truck stop', 'semi trucks interstate'], title: ['FIND BETTER LOADS', 'FASTER'], tag: 'LOAD BOARD TIPS', hook: 'Spend less time on the load board and find better loads.', ask: 'How long do you spend on load boards a day? 👇', items: [
    ['RADIUS', 'Search a wider radius', 'The best load might be 40 miles further out'],
    ['RELOAD', 'Check reloads near the drop', 'Before you book, look at what’s going out from there'],
    ['BACKHAUL', 'Book the backhaul early', 'Don’t wait until you’re empty to look'],
    ['BROKER', 'Filter out bad brokers', 'A great rate means nothing if they never pay'],
    ['ONE FEED', 'Stop switching apps', 'Every board in one feed saves time every day']] },
  { key: 'brokerquestions', photos: ['truck driver phone', 'loading dock', 'truck weigh station', 'warehouse lumper', 'semi truck parked'], title: ['ASK THE BROKER', 'BEFORE YOU BOOK'], tag: 'QUESTIONS TO ASK', hook: 'Ask the broker these five questions before you say yes.', ask: 'What did we miss? 👇', items: [
    ['WEIGHT', 'What does it weigh?', 'Know before you show up'],
    ['TIMES', 'Appointment or first come?', 'An FCFS dock can eat your day'],
    ['LUMPER', 'Who pays the lumper?', 'And how you get reimbursed'],
    ['DETENTION', 'When does detention start?', 'And how much per hour'],
    ['PAY', 'When do I get paid?', 'Standard terms, quick pay, and the fee']] },
  { key: 'pretrip', photos: ['semi truck tires', 'gladhands trailer', 'semi truck lights night', 'truck air brake', 'fifth wheel coupling'], title: ['PRE-TRIP STUFF', 'DRIVERS SKIP'], tag: 'PRE-TRIP', hook: 'Pre-trip checks drivers skip. Number five is the scary one.', ask: 'Ever caught something on a pre-trip? 👇', items: [
    ['#1', 'Tire tread and sidewalls', 'Cuts and bulges, not just the pressure', 'One. Tire tread and sidewalls.'],
    ['#2', 'Air lines and gladhands', 'Listen for leaks with the brakes released', 'Two. Air lines and gladhands.'],
    ['#3', 'Every light', 'Including the ones you can’t see from the cab', 'Three. Every light.'],
    ['#4', 'Brake adjustment', 'Out of adjustment brakes are a top out-of-service reason', 'Four. Brake adjustment.'],
    ['#5', 'Fifth wheel locked', 'Look at it. Tug test. Every time', 'Five. Make sure the fifth wheel is locked. Look at it, every time.']] },
  { key: 'family', photos: ['truck driver family', 'semi truck sunset', 'truck stop', 'semi truck home', 'semi truck night highway'], title: ['ONLY A TRUCKER’S', 'FAMILY GETS THIS'], tag: 'TRUCKER FAMILIES', hook: 'Only a trucker’s family understands this. Send it to yours.', ask: 'Tag your family 👇', items: [
    ['DINNER', 'Dinner on a video call', 'Still counts. Every time'],
    ['BIRTHDAYS', 'Celebrated a day late', 'Or a week. The cake still gets eaten'],
    ['GIFTS', 'Truck stop souvenirs', 'Every kid has a keychain collection'],
    ['HOME TIME', 'The countdown', 'Everybody in the house knows the date'],
    ['WHY', 'Every mile is for them', 'That’s the whole reason']] },
  { key: 'health', photos: ['truck stop parking lot', 'water bottle', 'truck driver', 'semi truck sunrise', 'truck sleeper cab'], title: ['STAY HEALTHY', 'ON THE ROAD'], tag: 'DRIVER HEALTH', hook: 'Five health habits that actually work on the road.', ask: 'What keeps you healthy out there? 👇', items: [
    ['WALK', 'Walk the lot', 'Ten minutes at every stop'],
    ['WATER', 'Water over soda', 'Keep a big bottle in the cab'],
    ['COOLER', 'Pack a cooler', 'Fewer truck stop meals, more money in your pocket'],
    ['STRETCH', 'Stretch before you climb', 'Backs and shoulders go first'],
    ['SLEEP', 'Protect your sleep', 'Blackout curtains and the same schedule when you can']] },
  { key: 'hours', photos: ['traffic jam trucks', 'truck stop restaurant', 'sleeper cab truck', 'truck stop parking night', 'loading dock early morning'], title: ['MAKE YOUR HOURS', 'COUNT'], tag: 'HOURS OF SERVICE', hook: 'Make every hour on your clock count.', ask: 'Best hours tip you have? 👇', items: [
    ['TRAFFIC', 'Plan around rush hour', 'An hour in city traffic is an hour off your clock'],
    ['BREAK', 'Make the 30 count', 'Fuel, eat and the break at the same stop'],
    ['SPLIT', 'Know the split sleeper', '7/3 or 8/2 can save your day', 'Split. Know how the split sleeper berth works.'],
    ['PARKING', 'Plan parking early', 'Lots fill up fast at night'],
    ['DOCK', 'Push for the earliest appointment', 'Early docks mean less waiting']] },
  { key: 'ownerop', photos: ['semi truck fleet', 'owner operator truck', 'truck repair shop', 'semi truck sunset', 'semi truck highway'], title: ['COMPANY DRIVER OR', 'OWNER-OPERATOR?'], tag: 'COMPANY VS OWNER-OP', hook: 'Company driver or owner operator? Here’s the honest difference.', ask: 'Which one are you, and would you switch? 👇', items: [
    ['PAY', 'Company: steady check', 'Owner-op: you keep more, and pay for everything'],
    ['LOADS', 'Company: dispatch picks', 'Owner-op: you pick, and you find them'],
    ['TRUCK', 'Company: their truck, their repairs', 'Owner-op: every breakdown is your bill'],
    ['TIME', 'Company: their schedule', 'Owner-op: your schedule, if the money works'],
    ['RISK', 'Company: low risk', 'Owner-op: higher risk, higher ceiling']] },
  { key: 'cabkit', photos: ['flashlight', 'duct tape', 'work gloves', 'truck stop food', 'truck sleeper cab'], title: ['EVERY TRUCKER', 'KEEPS THIS IN THE CAB'], tag: 'CAB ESSENTIALS', hook: 'Every trucker keeps these in the cab. What’s in yours?', ask: 'What’s in your cab that we missed? 👇', items: [
    ['LIGHT', 'A good flashlight', 'Pre-trips at 4am'],
    ['TAPE', 'Duct tape and zip ties', 'Fixes everything until the shop'],
    ['GLOVES', 'Spare gloves', 'The first pair is always wet'],
    ['FOOD', 'Snacks for a long wait', 'Docks don’t care that you’re hungry'],
    ['PILLOW', 'Your pillow from home', 'Small thing. Big difference']] },
  // ----- funny (at most every 4 days) -----
  { key: 'truck', funny: true, title: ['WHAT YOUR TRUCK', 'SAYS ABOUT YOU'], tag: 'WHAT YOUR TRUCK SAYS ABOUT YOU', hook: 'What your truck says about you. Be honest, which one are you?', ask: 'Which one are you? Be honest 👇', tags: '#peterbilt #kenworth', cta: 'Whatever you drive, find the loads that pay.', items: [
    ['PETERBILT 389|Peterbilt 389', 'His chrome budget is bigger than his retirement.', 'Every light on that truck works. His knees don’t.', 'Peterbilt three eighty nine. His chrome budget is bigger than his retirement.'],
    ['KENWORTH W900|Kenworth W900', 'Still says “10-4” at the dinner table.', 'Has a story for every exit on I-80. You will hear all of them.', 'Kenworth W nine hundred. Still says ten four at the dinner table.'],
    ['FREIGHTLINER CASCADIA|Freightliner Cascadia', 'Company driver. 14 years. Many opinions about dispatch.', 'Has the dispatcher’s number saved as “DO NOT ANSWER.”', 'Freightliner Cascadia. Company driver, fourteen years. Many opinions about dispatch.'],
    ['VOLVO VNL|Volvo VNL', 'Sleeps 8 hours, eats salad, reads the manual. Suspicious.', 'Has never once been late. Nobody trusts him.', 'Volvo. Sleeps eight hours, eats salad, reads the manual. Suspicious.'],
    ['INTERNATIONAL LT|International LT truck', 'Bought it used, fixed it himself, will tell you about it. Twice.', 'Has more zip ties holding it together than bolts.', 'International. Bought it used, fixed it himself, and will tell you about it. Twice.'],
    ['MACK ANTHEM|Mack Anthem', 'Says “they don’t build ’em like they used to.” Is right.', 'Will drive it until the wheels fall off. Then fix the wheels.', 'Mack. Says they don’t build them like they used to. And he’s right.']] },
  { key: 'trailer', photos: ['flatbed semi-trailer', 'refrigerated semi-trailer', 'box semi-trailer', 'lowboy semi-trailer', 'pickup gooseneck trailer'], funny: true, title: ['WHAT YOUR TRAILER', 'SAYS ABOUT YOU'], tag: 'WHAT YOUR TRAILER SAYS ABOUT YOU', hook: 'What your trailer says about you. Number five is going to start a fight.', ask: 'Hotshot guys, don’t come at us 👇', tags: '#flatbed #reefer', cta: 'Flatbed, reefer or van: find the loads that pay.', items: [
    ['FLATBED', 'Can tarp a load in a thunderstorm. Can’t find his reading glasses.', 'They’re on his head. They’ve always been on his head.'],
    ['REEFER', 'Hears that unit kick on in his sleep.', 'Hasn’t had a full night of sleep since 2009.'],
    ['DRY VAN', 'Waited 6 hours at a dock and called it “a good day.”', 'Knows every vending machine on the East Coast.', 'Dry van. Waited six hours at a dock and called it a good day.'],
    ['STEP DECK', 'Measures everything twice. Including the grill.', 'Owns four tape measures. Can’t find any of them.'],
    ['HOTSHOT', 'Tells everyone it’s “basically the same thing.”', 'It’s not. But we love you anyway.']] },
  { key: 'oldschool', photos: ['logbook truck', 'CB radio', 'pay phone', 'road atlas', 'truck stop 1970s'], funny: true, title: ['ONLY REAL TRUCKERS', 'REMEMBER THIS'], tag: 'OLD SCHOOL TRUCKING', hook: 'Only real truckers remember these. How many do you remember?', ask: 'How many do you remember? 👇', tags: '#oldschooltrucking', cta: 'The load board moved to your phone. All of them, in one feed.', items: [
    ['PAPER LOGBOOKS', 'Every hour written by hand', 'Before ELDs became required in 2017', 'Paper logbooks. Every hour written by hand.'],
    ['YOUR CB HANDLE', 'Everybody knew it', 'Nobody knew your real name'],
    ['PAY PHONES', 'A pocket full of quarters', 'To call home from the truck stop', 'Pay phones, and a pocket full of quarters to call home.'],
    ['THE ROAD ATLAS', 'Folded and coffee-stained', 'Better than any GPS'],
    ['THE BOARD ON THE WALL', 'Loads posted at the truck stop', 'Now it’s in your pocket']] },
  { key: 'truckstop', photos: ['truck stop night', 'semi truck backing', 'truck stop parking', 'truck stop diner', 'truck stop showers'], funny: true, title: ['TYPES OF TRUCKERS', 'AT THE TRUCK STOP'], tag: 'TRUCK STOP TYPES', hook: 'Types of truckers at every truck stop. You’re one of them.', ask: 'Which one are you? 👇', items: [
    ['THE 4AM GUY', 'Coffee in hand, already done his pre-trip', 'Has been up since 3. Wants you to know.'],
    ['ONE-SHOT', 'Backs in on the first try. Doesn’t look around to see who saw. (He looks.)', 'Then walks in like nothing happened.', 'One shot. Backs in on the first try. Then checks who saw.'],
    ['SIX TRIES', 'Gets out and looks. Every. Single. Time.', 'Everybody at the fuel island is watching. He knows.', 'Six tries. Gets out and looks, every single time.'],
    ['THE STORYTELLER', 'Has been driving since before you were born. Will tell you.', 'Started with “back in ’79…” Never stopped.'],
    ['THE SHOWER GUY', 'Knows every shower number by heart', 'Has opinions about every truck stop’s water pressure.']] },
  { key: 'neversay', photos: ['truck driver cab', 'semi truck highway', 'semi truck backing up', 'truck parking', 'semi truck interstate'], funny: true, title: ['NEVER SAY THIS', 'TO A TRUCKER'], tag: 'NEVER SAY THIS', hook: 'Things you should never say to a trucker. Number one, really.', ask: 'What’s the worst one you’ve heard? 👇', items: [
    ['#1', '“Must be nice sitting all day”', 'Try sitting 11 hours, then tarping a load in the rain.', 'One. Must be nice sitting all day.'],
    ['#2', '“So it’s basically a road trip?”', 'Sure. A road trip with a deadline, a dispatcher and no bathroom.', 'Two. So it’s basically a road trip?'],
    ['#3', '“How hard can backing up be?”', 'Here’s 53 feet. Go ahead.', 'Three. How hard can backing up be?'],
    ['#4', '“Can’t you just park anywhere?”', 'At 9pm? There is no anywhere.', 'Four. Can’t you just park anywhere?'],
    ['#5', '“You get paid to drive around?”', 'Every box in your house rode in a truck first.', 'Five. You get paid to drive around?']] },
  { key: 'toolong', photos: ['grocery store parking lot', 'semi trucks highway', 'diner', 'semi truck', 'CB radio'], funny: true, title: ['SIGNS YOU’VE BEEN', 'TRUCKING TOO LONG'], tag: 'TRUCKING TOO LONG', hook: 'Signs you’ve been trucking too long. Number two is everybody.', ask: 'Tag the guy who does all five 👇', items: [
    ['#1', 'You back into the grocery store spot', 'In a minivan. Perfectly.', 'One. You back into your parking spot at the grocery store.'],
    ['#2', 'You judge every truck on the highway', '“Look at that load securement…”', 'Two. You judge every truck on the highway.'],
    ['#3', 'You eat dinner at 4pm', 'And breakfast at midnight.', 'Three. You eat dinner at four PM.'],
    ['#4', 'You wave at trucks from your car', 'And get mad when they don’t wave back.', 'Four. You wave at trucks from your car.'],
    ['#5', 'You say “10-4” to your wife', 'She does not think it’s funny anymore.', 'Five. You say ten four to your wife.']] },
  { key: 'dispatcher', photos: ['truck dispatcher office', 'loading dock trucks', 'freight rates', 'semi truck sunset', 'telephone office'], funny: true, title: ['WHAT DISPATCH SAYS', 'VS WHAT IT MEANS'], tag: 'DISPATCH TRANSLATOR', hook: 'What dispatch says, and what it really means.', ask: 'What did we miss? 👇', items: [
    ['“QUICK LOAD”', 'There is nothing quick about it', 'Three stops, two lumpers, one locked gate.'],
    ['“EASY DOCK”', 'You’ll be there 6 hours', 'Bring a book. Bring two.', 'Easy dock. You’ll be there six hours.'],
    ['“GREAT RATE”', 'For them', 'Not for you. Never for you.'],
    ['“HOME BY FRIDAY”', 'Which Friday is not specified', 'Could be this one. Probably not.'],
    ['“I’LL CALL YOU BACK”', 'He will not call you back', 'You will call him. Four times.']] },
  { key: 'fourwheelers', photos: ['traffic semi truck', 'truck blind spot', 'highway merge traffic', 'highway traffic trucks', 'truck parking lot'], funny: true, title: ['THINGS CARS DO', 'THAT DRIVE US CRAZY'], tag: 'FOUR-WHEELERS', hook: 'Things four wheelers do that drive truckers crazy.', ask: 'Which one gets you the most? 👇', items: [
    ['#1', 'Cut in and brake', 'Right into your stopping distance', 'One. Cut in front and hit the brakes.'],
    ['#2', 'Live in the blind spot', 'For 20 miles', 'Two. Ride in your blind spot for twenty miles.'],
    ['#3', 'Last-second merge', 'Then act surprised', 'Three. Merge at the very last second.'],
    ['#4', 'Pass you, then slow down', 'Every single time', 'Four. Pass you, then slow down.'],
    ['#5', 'Take the truck parking', 'For a nap in a sedan', 'Five. Park in the truck spots.']] },
];
// Owner audience = US truckers: generic text queries returned foreign box trucks, so non-themed packs show US semis (strict model match).
const US_TRUCKS = ['Freightliner Cascadia', 'Kenworth T680', 'Peterbilt 579', 'Volvo VNL', 'International LT truck', 'Kenworth W900', 'Peterbilt 389'];
const THEMED = new Set(['truck', 'trailer', 'oldschool', 'cabkit', 'winter']);
const packBuilder = (p) => async () => ({
  photos: p.photos,
  id: `${p.key}-1`, ttlDays: 6, funny: !!p.funny, title: p.title, tag: p.tag, source: '', showMap: false, cta: p.cta,
  hook: p.hook,
  items: p.items.map(([kq, title, sub = '', say], i) => { const [kicker, own] = kq.split('|'); return { kicker, big: '', title, sub, photo: own || (THEMED.has(p.key) ? p.photos?.[i % p.photos.length] : US_TRUCKS[(i + p.key.length) % US_TRUCKS.length]), strict: !!own || !THEMED.has(p.key), say: `${say || `${kicker.replace(/[#“”"]/g, '')}. ${title.replace(/[“”"]/g, '')}`} ${sub.replace(/[“”"]/g, '')}`.trim() }; }),
  caption: `${p.hook}\n\n${p.items.map(([kq, t]) => kq.split('|')[0]).map((k, i) => [k, p.items[i][1]]).map(([k, t]) => `• ${k.startsWith('#') ? '' : `${k}: `}${t}`).join('\n')}\n\n${p.ask}\n\nEvery load board in one feed, with a broker check on every load. Try TruLoader free for 3 days: truloader.com\n\n${TAGS}${p.tags ? ` ${p.tags}` : ''}`,
});
for (const p of PACKS) BUILDERS[p.key] = packBuilder(p);
const EVERGREEN = PACKS.filter(p => !p.funny).map(p => p.key);
const FUNNY = PACKS.filter(p => p.funny).map(p => p.key);

export const CONCEPTS = Object.keys(BUILDERS);

// Free-licensed photo from Wikimedia Commons (owner, Nov 19: real truck pictures, free). Landscape, ≥ 800 px, no logos/fair use.
export async function commonsPhoto(query, file, { strict = false, used = new Set() } = {}) {
  const UA = { 'user-agent': 'TruLoaderReelBot/1.0 (https://github.com/lolerman123456/miami-reels)' };
  const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=15&gsrsearch=${encodeURIComponent(`${query} filetype:bitmap`)}&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=1200`;
  const j = await (await fetch(url, { headers: UA })).json();
  const words = query.toLowerCase().split(/\s+/).filter(w => w !== 'truck');
  const cands = Object.values(j.query?.pages || {}).sort((a, b) => a.index - b.index).map(pg => ({ title: pg.title, ...pg.imageinfo?.[0] }))
    .filter(c => c.width >= 800 && c.width > c.height * 1.1 && c.thumburl)
    .filter(c => !/logo|emblem|badge|interior|engine|dashboard|toy|model/i.test(c.title))
    .filter(c => !used.has(c.title))
    .filter(c => /^(cc|public domain|pd)/i.test(c.extmetadata?.LicenseShortName?.value || ''));
  const match = (c) => words.every(w => c.title.toLowerCase().includes(w));
  const some = (c) => words.filter(w => w.length > 3 && !['semi', 'trailer'].includes(w)).some(w => c.title.toLowerCase().includes(w));
  const c = cands.find(match) || (strict ? null : cands.find(some)); if (!c) return null; // loose: still needs a real word of the query in the file name (no brick walls)
  used.add(c.title);
  const r = await fetch(c.thumburl, { headers: UA }); if (!r.ok) return null;
  fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  const artist = String(c.extmetadata?.Artist?.value || '').replace(/<[^>]+>/g, '').trim().slice(0, 40);
  return `Photo: ${artist || 'Wikimedia Commons'} / ${c.extmetadata.LicenseShortName.value}`;
}

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
    process.env.KOKORO_VOICE ||= 'am_adam'; process.env.KOKORO_SPEED = process.env.TRULOADER_VOICE_SPEED || '1.0'; // owner, Nov 19: slower
    const { makeNarration } = await import('./voice.mjs');
    const { timeline } = await makeNarration({ voice: { provider: 'kokoro' }, scenes }, dir);
    props.hookFrames = Math.max(60, fr(timeline[0].duration)); at = props.hookFrames;
    spec.items.forEach((it, i) => { const d = Math.max(135, fr(timeline[i + 1].duration) + 30); props.items.push({ ...it, start: at, dur: d }); at += d; });
    const { execFileSync } = await import('node:child_process');
    const parts = timeline.map((t, i) => ({ file: path.join(dir, 'voice', `${i}.wav`), at: i === 0 ? t.speechStart : (i <= spec.items.length ? props.items[i - 1].start / FPS + 0.15 : at / FPS + 0.4) }));
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...parts.flatMap(p => ['-i', p.file]), '-filter_complex',
      `${parts.map((p, i) => `[${i}]adelay=${Math.round(p.at * 1000)}:all=1[a${i}]`).join(';')};${parts.map((_, i) => `[a${i}]`).join('')}amix=inputs=${parts.length}:normalize=0,loudnorm=I=-11:TP=-1[out]`,
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
  // Zoom the map onto each card's states (owner, Nov 19: whole-US maps get scrolled past).
  const boxes = Object.fromEntries(map.states.map(st => { const n = (st.d.match(/-?\d+(\.\d+)?/g) || []).map(Number); const xs = n.filter((_, i) => i % 2 === 0), ys = n.filter((_, i) => i % 2 === 1); return [st.name, [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]]; }));
  const used = new Set();
  for (const [k, it] of props.items.entries()) {
    delete it.say;
    if (it.photo) {
      const f = `photo-${k}.jpg`;
      const credit = await commonsPhoto(it.photo, path.join(dir, f), { strict: it.strict, used }).catch(e => { console.log(`  photo "${it.photo}" failed: ${e.message}`); return null; });
      if (credit) { it.img = f; it.credit = credit; } else console.log(`  no free photo for "${it.photo}"`);
    }
    delete it.photo; delete it.strict;
    const bs = (it.focus || []).map(a => boxes[STATES[a]]).filter(Boolean); delete it.focus;
    if (!bs.length) continue;
    const x0 = Math.min(...bs.map(b => b[0])), y0 = Math.min(...bs.map(b => b[1])), x1 = Math.max(...bs.map(b => b[2])), y1 = Math.max(...bs.map(b => b[3]));
    it.cam = { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, s: Math.min(5, Math.max(1.3, (map.w * 0.8) / Math.max(x1 - x0, (y1 - y0) * 1.4, 40))) };
  }
  return { spec, props };
}

// ---------- which concept a scheduled slot posts ----------
// Weekly data Reels first (each once a week), then a funny one at most every 4 days (evening slot only),
// then the evergreen pack posted longest ago (none repeats within 6 days).
const ORDER = ['lanes', 'deadhead', 'states', 'fuel', 'one', 'lanes5', 'lanes3'];
export function pickSlot(log, now = new Date()) {
  const lines = log.split('\n').filter(l => l.includes('\ttruloader:'));
  const last = (k) => Math.max(0, ...lines.filter(l => l.split('\t')[1]?.startsWith(`truloader:${k}-`)).map(l => Date.parse(l.split('\t')[0]) || 0));
  const days = (k) => (now - last(k)) / 864e5;
  const data = ORDER.find(k => days(k) >= 6); if (data) return data;
  const nyHour = Number(now.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }));
  const oldest = (keys) => keys.filter(k => days(k) >= 6).sort((a, b) => last(a) - last(b))[0];
  if (nyHour >= 18 && Math.min(...FUNNY.map(days)) >= 4) { const f = oldest(FUNNY); if (f) return f; }
  return oldest(EVERGREEN) || null;
}
