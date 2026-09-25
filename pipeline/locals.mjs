// What real South Floridians are talking about this week, in their own words (public subreddit RSS, no key).
// Fed to the writers as raw material + a voice reference, so scripts sound like people, not a brand.
//   node pipeline/locals.mjs
const SUBS = ['Miami', 'fortlauderdale', 'Hialeah', 'miamidade', 'westpalmbeach'];

const decode = s => s.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#32;/g, ' ').replace(/\s+/g, ' ').trim();

export async function fetchLocalTalk({ max = 40 } = {}) {
  const out = [];
  await Promise.all(SUBS.map(async sub => {
    try {
      const xml = await (await fetch(`https://www.reddit.com/r/${sub}/top/.rss?t=week&limit=15`, {
        headers: { 'User-Agent': 'getnearapp-bot/1.0' }, signal: AbortSignal.timeout(15000),
      })).text();
      for (const entry of xml.split('<entry>').slice(1)) {
        const title = decode((/<title>([\s\S]*?)<\/title>/.exec(entry) || [])[1] || '');
        // body text, minus reddit's "submitted by /u/x [link] [comments]" footer
        const body = decode(decode((/<content[^>]*>([\s\S]*?)<\/content>/.exec(entry) || [])[1] || ''))
          .replace(/submitted by .*$/i, '').trim().slice(0, 240);
        if (title) out.push(`r/${sub}: ${title}${body ? ' — ' + body : ''}`);
      }
    } catch (e) { console.log(`  (r/${sub} unavailable: ${e.message})`); }
  }));
  return out.slice(0, max);
}

// Lines a real person wrote for the account (voice/lines.md), if the owner adds any.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './util.mjs';
export function ownerLines() {
  const f = path.join(ROOT, 'voice', 'lines.md');
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(l => /^[-*]\s+\S/.test(l)).map(l => l.replace(/^[-*]\s+/, '')).slice(0, 60) : [];
}

if (import.meta.url === `file://${process.argv[1]}`) for (const l of await fetchLocalTalk()) console.log(l);
