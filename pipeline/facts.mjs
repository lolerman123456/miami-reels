// Real facts for the map Reels — the script may only state what's in here.
//   Wikipedia: history, heights, costs, dates + exact coordinates of a place
//   Zillow ZORI (public research CSV): typical monthly rent by city and ZIP, monthly since 2015
//   node pipeline/facts.mjs "Waldorf Astoria Miami" | node pipeline/facts.mjs --rent Miami 33131
const UA = 'getnearapp-bot/1.0 (https://github.com/lolerman123456/miami-reels)';

export async function wikiArticle(query, { chars = 6000 } = {}) {
  const api = 'https://en.wikipedia.org/w/api.php?';
  const get = async params => (await fetch(api + new URLSearchParams({ format: 'json', ...params }), {
    headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000),
  })).json();
  // exact title first, else best search hit
  let page = Object.values((await get({ action: 'query', prop: 'extracts|coordinates|info', inprop: 'url', explaintext: '1', redirects: '1', titles: query })).query?.pages || {})[0];
  if (!page || page.missing !== undefined) {
    const hit = (await get({ action: 'query', list: 'search', srsearch: query, srlimit: '1' })).query?.search?.[0];
    if (!hit) return null;
    page = Object.values((await get({ action: 'query', prop: 'extracts|coordinates|info', inprop: 'url', explaintext: '1', redirects: '1', titles: hit.title })).query?.pages || {})[0];
  }
  if (!page?.extract) return null;
  const text = page.extract.replace(/\n==+ (See also|References|External links|Notes|Further reading) ==+[\s\S]*$/, '').replace(/\n{2,}/g, '\n').slice(0, chars);
  const c = page.coordinates?.[0];
  return { title: page.title, url: page.fullurl, text, ...(c ? { lat: c.lat, lon: c.lon } : {}) };
}

const ZORI = {
  city: 'https://files.zillowstatic.com/research/public_csvs/zori/City_zori_uc_sfrcondomfr_sm_month.csv',
  zip: 'https://files.zillowstatic.com/research/public_csvs/zori/Zip_zori_uc_sfrcondomfr_sm_month.csv',
};
const cache = {};
async function zori(kind) {
  if (cache[kind]) return cache[kind];
  const csv = await (await fetch(ZORI[kind], { signal: AbortSignal.timeout(90000) })).text();
  const [head, ...rows] = csv.trim().split('\n');
  const split = l => l.match(/("[^"]*"|[^,]*)(,|$)/g).map(x => x.replace(/,$/, '').replace(/^"|"$/g, ''));
  const cols = split(head);
  const fl = rows.map(split).filter(r => r[cols.indexOf('State')] === 'FL');
  return (cache[kind] = { cols, rows: fl });
}

// "Miami", "Hialeah", "33131" → typical rent now, 1 and 5 years ago, and in 2015 (Zillow Observed Rent Index)
export async function rentFacts(places) {
  const out = [];
  for (const place of places) {
    const kind = /^\d{5}$/.test(place) ? 'zip' : 'city';
    const { cols, rows } = await zori(kind);
    const row = rows.find(r => r[cols.indexOf('RegionName')].toLowerCase() === String(place).toLowerCase());
    if (!row) continue;
    const dates = cols.map((c, i) => [c, i]).filter(([c, i]) => /^\d{4}-\d\d-\d\d$/.test(c) && row[i]);
    const at = ymd => { const d = [...dates].reverse().find(([c]) => c <= ymd) || dates[0]; return [d[0].slice(0, 7), Math.round(Number(row[d[1]]))]; };
    const [lastDate, now] = at('9999');
    const y = Number(lastDate.slice(0, 4)), m = lastDate.slice(5, 7);
    const label = kind === 'zip' ? `ZIP ${place} (${row[cols.indexOf('City')] || row[cols.indexOf('CountyName')]})` : place;
    const [, y1] = at(`${y - 1}-${m}-31`), [, y5] = at(`${y - 5}-${m}-31`), [d0, first] = at('2015-01-31');
    out.push(`${label}: typical monthly rent $${now.toLocaleString()} (${lastDate}); $${y1.toLocaleString()} a year earlier; ` +
      `$${y5.toLocaleString()} five years earlier (${y - 5}-${m}); $${first.toLocaleString()} in ${d0}. Source: Zillow Observed Rent Index.`);
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = process.argv.slice(2);
  if (a[0] === '--rent') console.log((await rentFacts(a.slice(1))).join('\n'));
  else { const w = await wikiArticle(a.join(' ')); console.log(w ? `${w.title} (${w.lat},${w.lon}) ${w.url}\n${w.text.slice(0, 1500)}` : 'not found'); }
}
