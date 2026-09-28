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
        items.push({ title, source, date, link: tag(block, 'link'), summary: name ? tag(block, 'description').slice(0, 300) : '' });
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
const plain = s => decode(decode(s)).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
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
        out.push({ title, source, date, body: body.slice(0, chars) });
      }
    } catch (e) { console.log(`  (article feed failed: ${source} — ${e.message})`); }
  }));
  return out.sort((a, b) => b.date - a.date).slice(0, max);
}
