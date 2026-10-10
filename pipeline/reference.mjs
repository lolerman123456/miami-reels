// What's working for the reference accounts (owner, Oct 10: "see what @onlyindade posts … so you copy"): their best
// recent posts from state/watch/<user>.jsonl (written hourly by pipeline/watch.mjs), as a few prompt lines for the pickers
// and caption writers. A signal for FORMAT and topic type only — never a source of facts, never repost their content.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

// top posts of the last `days` days by likes + 3×comments (comments = shares/arguments), optionally one type ('Reel'|'Carousel')
export function referenceHits({ days = 4, n = 6, type } = {}) {
  const dir = path.join(ROOT, 'state', 'watch');
  if (!fs.existsSync(dir)) return [];
  const since = Date.now() - days * 864e5, out = [];
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.jsonl'))) {
    for (const l of fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean)) {
      try { const o = JSON.parse(l); if (Date.parse(o.at) >= since && (!type || o.type === type)) out.push({ ...o, user: f.replace(/\.jsonl$/, '') }); } catch {}
    }
  }
  return out.map(o => ({ ...o, score: (o.likes || 0) + 3 * (o.comments || 0) })).sort((a, b) => b.score - a.score).slice(0, n);
}

// prompt block: "WHAT'S WORKING FOR @onlyindade THIS WEEK" + their top captions with likes/comments
export function referenceBlock(opts = {}) {
  const hits = referenceHits(opts);
  if (!hits.length) return '';
  return `\n\nWHAT'S WORKING FOR @${hits[0].user} THIS WEEK (their top ${opts.type ? opts.type.toLowerCase() + 's' : 'posts'}; copy the TYPE of story and the caption style, never their content or facts):\n`
    + hits.map(o => `- ${o.type}, ${o.likes ?? '?'} likes, ${o.comments ?? '?'} comments: ${(o.caption.split('\n')[0] || '').replace(/#\w+/g, '').replace(/\s*[|\/].*$/, '').trim().slice(0, 140)}`).join('\n');
}
