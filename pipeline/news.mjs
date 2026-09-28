// Pull fresh headlines from public RSS feeds (no keys needed).
//   node pipeline/news.mjs local|world
const FEEDS = {
  local: [
    ['Local 10', 'https://www.local10.com/arc/outboundfeeds/rss/?outputType=xml'],
    ['NBC 6', 'https://www.nbcmiami.com/?rss=y'],
    ['WSVN 7News', 'https://wsvn.com/feed/'],
    ['WLRN', 'https://www.wlrn.org/news.rss'],
    [null, 'https://news.google.com/rss/search?q=Miami+OR+Hialeah+OR+%22Miami-Dade%22+when:1d&hl=en-US&gl=US&ceid=US:en'],
    [null, 'https://news.google.com/rss/search?q=%22Fort+Lauderdale%22+OR+Broward+OR+%22Palm+Beach%22+when:1d&hl=en-US&gl=US&ceid=US:en'],
    [null, 'https://news.google.com/rss/search?q=Florida+when:1d&hl=en-US&gl=US&ceid=US:en'],
  ],
  world: [
    [null, 'https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en'],
    [null, 'https://news.google.com/rss/headlines/section/topic/NATION?hl=en-US&gl=US&ceid=US:en'],
    ['BBC News', 'https://feeds.bbci.co.uk/news/world/rss.xml'],
  ],
};

const tag = (xml, name) => {
  const m = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`).exec(xml);
  return m ? decode(m[1].replace(/^<!\[CDATA\[|\]\]>$/g, '')) : '';
};
const decode = s => s.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;|&#8217;/g, "'").replace(/&#8220;|&#8221;/g, '"').replace(/&#8211;|&#8212;/g, '-')
  .replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

export async function fetchNews(kind = 'local', { hours = 30, max = 60 } = {}) {
  const since = Date.now() - hours * 3600e3;
  const items = [];
  await Promise.all(FEEDS[kind].map(async ([name, url]) => {
    try {
      const xml = await (await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (getnear news bot)' }, signal: AbortSignal.timeout(20000) })).text();
      for (const block of xml.split(/<item[\s>]/).slice(1)) {
        let title = tag(block, 'title');
        const source = name || tag(block, 'source') || 'News';
        if (!name && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
        const date = Date.parse(tag(block, 'pubDate')) || Date.now();
        if (!title || date < since) continue;
        const img = (/<media:content[^>]*url=["']([^"']+)["']/.exec(block) || /<enclosure[^>]*url=["']([^"']+\.(?:jpe?g|png|webp)[^"']*)["']/i.exec(block) || [])[1];
        items.push({ title, source, date, link: tag(block, 'link'), summary: name ? tag(block, 'description').slice(0, 300) : '', image: img ? img.replace(/&amp;/g, '&').replace(/&#038;/g, '&') : undefined });
      }
    } catch (e) { console.log(`  (feed failed: ${name || url} — ${e.message})`); }
  }));
  // newest first, drop near-duplicate headlines
  const seen = new Set();
  return items.sort((a, b) => b.date - a.date).filter(i => {
    const key = i.title.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ').slice(0, 6).join(' ');
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).slice(0, max);
}

// Headlines for any topic (Google News search, last `days` days)
export async function searchNews(query, { days = 7, max = 25 } = {}) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query + ' when:' + days + 'd')}&hl=en-US&gl=US&ceid=US:en`;
  const xml = await (await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (getnear news bot)' }, signal: AbortSignal.timeout(20000) })).text();
  return xml.split(/<item[\s>]/).slice(1).map(b => {
    const source = tag(b, 'source') || 'News'; let title = tag(b, 'title');
    if (title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
    return { title, source, date: Date.parse(tag(b, 'pubDate')) || Date.now(), summary: '' };
  }).slice(0, max);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const i of await fetchNews(process.argv[2] || 'local')) console.log(`[${i.source}] ${i.title}`);
}

// Full-text articles from local blogs/feeds (Google News only gives headlines), for the deals and events carousels so
// slides can state the date, time, venue and price. kind: 'events' | 'deals'.
const ARTICLE_FEEDS = {
  events: [['Secret Miami', 'https://secretmiami.com/feed/'], ['Miami New Times', 'https://www.miaminewtimes.com/miami/Rss.xml'],
    ['South Florida Reporter', 'https://www.southfloridareporter.com/feed/'], ['Eater Miami', 'https://miami.eater.com/rss/index.xml']],
  deals: [['Hip2Save', 'https://www.hip2save.com/feed/'], ['Secret Miami', 'https://secretmiami.com/feed/'],
    ['South Florida Reporter', 'https://www.southfloridareporter.com/feed/'], ['Local 10', 'https://www.local10.com/arc/outboundfeeds/rss/?outputType=xml']],
};
const MATCH = {
  events: /event|festival|concert|this weekend|things to do|opening|opens|pop-up|tickets|fair|market|party|parade|exhibit|brunch|restaurant/i,
  deals: /free (food|coffee|meal|breakfast|lunch|burger|taco|donut|doughnut|fries|sandwich|pizza|drink|ice cream|chicken)|food drive|food distribution|food pantry|giveaway|national \w+ day|chick-fil-a|mcdonald|wendy|taco bell|dunkin|starbucks|krispy|popeyes|chipotle|burger king|subway|domino|pollo tropical|publix|bogo|\$1 /i,
};
const plain = s => decode(decode(s)).replace(/&rsquo;|&lsquo;/g, "'").replace(/&ldquo;|&rdquo;/g, '"').replace(/&#\d+;|&\w+;/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
export async function fetchArticles(kind, { days = 10, max = 14, chars = 1400 } = {}) {
  const since = Date.now() - days * 86400e3;
  const out = [];
  await Promise.all(ARTICLE_FEEDS[kind].map(async ([source, url]) => {
    try {
      const xml = await (await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (getnear news bot)' }, redirect: 'follow', signal: AbortSignal.timeout(20000) })).text();
      for (const b of xml.split(/<item[\s>]|<entry[\s>]/).slice(1)) {
        const raw = (s) => { const m = new RegExp(`<${s}[^>]*>([\\s\\S]*?)</${s}>`).exec(b); return m ? m[1].replace(/^<!\[CDATA\[|\]\]>$/g, '') : ''; };
        const title = plain(raw('title'));
        const date = Date.parse(raw('pubDate') || raw('published') || raw('updated')) || Date.now();
        const body = plain(raw('content:encoded') || raw('content') || raw('description'));
        if (!title || date < since || !MATCH[kind].test(title)) continue;
        if (kind === 'deals' && /amazon|walmart\.com|target\.com|woot|shipped|free shipping|preorder|online|promo code|vitamin shoppe|protein bar/i.test(title)) continue; // online shopping, not local
        out.push({ title, source, date, link: plain(raw('link')) || (/href="([^"]+)"/.exec(raw('link') || b) || [])[1], body: body.slice(0, chars) });
      }
    } catch (e) { console.log(`  (article feed failed: ${source} — ${e.message})`); }
  }));
  const top = out.sort((a, b) => b.date - a.date).slice(0, max);
  // feeds that only carry a one-line summary: read the article page itself
  await Promise.all(top.filter(a => a.body.length < 600 && /^https?:/.test(a.link || '')).map(async a => {
    try {
      const html = await (await fetch(a.link, { headers: { 'User-Agent': 'Mozilla/5.0' }, redirect: 'follow', signal: AbortSignal.timeout(15000) })).text();
      const main = (/<article[\s\S]*?<\/article>/i.exec(html) || [html])[0].replace(/<(script|style|nav|header|footer|aside)[\s\S]*?<\/\1>/gi, ' ');
      let text = plain(main);
      const cut = text.search(/SMS More|Share this article|Advertisement/); if (cut > 0 && cut < 1500) text = text.slice(cut + 9);
      if (text.length > a.body.length) a.body = text.slice(0, chars * 2);
    } catch {}
  }));
  return top;
}

// What South Florida is talking about right now (the kind of stories @onlyindade reposts): hot posts on the local
// subreddits + Google Trends searches in Florida. Only a signal for picking a story; posts are written from news reporting.
const VIRAL_FEEDS = [
  ['r/Miami', 'https://www.reddit.com/r/Miami/hot.rss'],
  ['r/florida', 'https://www.reddit.com/r/florida/hot.rss'],
  ['r/fortlauderdale', 'https://www.reddit.com/r/fortlauderdale/hot.rss'],
];
export async function fetchViral({ perSub = 10 } = {}) {
  const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36' };
  const out = [];
  for (const [i, [source, url]] of VIRAL_FEEDS.entries()) { // one at a time: Reddit rate-limits parallel requests (HTTP 429)
    if (i) await new Promise(r => setTimeout(r, 2500));
    try {
      const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const xml = await res.text();
      const titles = [...xml.matchAll(/<entry>[\s\S]*?<title>([^<]*)<\/title>/g)].map(m => plain(m[1]))
        .filter(t => !/megathread|monthly|weekly|daily (discussion|thread)|jobs thread/i.test(t)).slice(0, perSub);
      titles.forEach((title, i) => out.push({ source: `${source} (hot #${i + 1})`, title, viral: true }));
    } catch (e) { console.log(`  (viral feed failed: ${source} — ${e.message})`); }
  }
  try {
    const xml = await (await fetch('https://trends.google.com/trending/rss?geo=US-FL', { headers: UA, signal: AbortSignal.timeout(15000) })).text();
    for (const b of xml.split('<item>').slice(1, 16)) {
      const q = plain((/<title>([^<]*)/.exec(b) || [])[1] || ''), traffic = (/<ht:approx_traffic>([^<]*)/.exec(b) || [])[1] || '';
      const heads = [...b.matchAll(/<ht:news_item_title>([^<]*)/g)].map(m => plain(m[1])).slice(0, 2);
      if (q) out.push({ source: `Google Trends Florida (${traffic} searches)`, title: q, summary: heads.join(' / '), viral: true });
    }
  } catch (e) { console.log(`  (Google Trends failed: ${e.message})`); }
  return out;
}
