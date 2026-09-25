// House style for every writer (Reels + carousels). Stated in the system prompt AND repeated in each request,
// plus a sample of real lines (voice/tone.txt) to imitate. sanitize() is the backstop for dashes that slip through.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './util.mjs';

export const STYLE = `HOUSE STYLE (non-negotiable)
Core truth: a misplaced em dash once cost you more than you could afford to lose, so you never use one. Use a period,
comma, colon or rewrite the sentence. No en dashes between clauses either. Hyphens only inside compound words (well-known).
- Active voice unless it's grammatically impossible.
- Direct statements. Say what something IS; never define it by what it isn't. No contrastive constructions
  ("This isn't X, it's Y", "not just X but Y", "less X, more Y"), no rhetorical negation ("not optional. It's required").
- No rhetorical feints or set-up questions ("The result?", "Here's the thing", "Picture this", "Imagine").
- No subjective qualifiers or value judgments (amazing, stunning, incredible, huge, massive, perfect, iconic, vibrant).
  Let the number or fact carry it.
- No intro or transition phrases that frame something as significant or surprising ("Interestingly", "Notably",
  "It's worth noting", "In a major move", "Big news"). Get to the fact.
- Humor: wry and subtle, at most ONE dry line per slide/scene, and it must come out of the fact itself, said flat
  (e.g. "Brickell rent is $3,831 a month. That's $45,972 a year before parking." / "Up 89% since 2015. The beach is the same size.").
  NEVER the meme-caption pattern: no lists of quirky things ("a warehouse you swear is a restaurant, golf carts acting rich,
  a plaza nobody planned for"), no personification ("acting rich", "pretending", "treated like suggestions"),
  no "starter pack", "energy", "be having", "nobody asked for", "like it's a", no puns, no "relatable" exaggerations.
- Short, dense sentences. Every sentence carries a fact.`;

export function toneLines() {
  const f = path.join(ROOT, 'voice', 'tone.txt');
  const lines = fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').map(l => l.trim()).filter(Boolean) : [];
  return lines.length ? `TONE SAMPLES (imitate the rhythm and plainness; these are style examples, NOT facts to reuse):\n${lines.map(l => '- ' + l).join('\n')}` : '';
}

// Short reminder appended to every user message (keeps the style from fading).
export const REMINDER = 'Reminder: house style. No em or en dashes. Active voice, direct statements, no contrast framing, no subjective adjectives, no quirky lists or personification; at most one dry line that comes from the fact.';

// Meme-caption / "white girl humor" patterns the owner hates: quirky lists and personification.
export const MEME_TELLS = [
  /\b(acting|pretending|treated|dressed) (like|as|rich)\b/i, /\blike it['’]s a\b/i, /\bnobody (asked|planned|needed)\b/i,
  /\bstarter pack\b/i, /\benergy\b/i, /\bbe having\b/i, /\byou swear\b/i, /\bthe way (it|they|he|she)\b/i,
];
// a sentence that is a list of 4+ quirky items ("A dad in cargo shorts, a 40-minute left turn, Target as..., and someone...")
const quirkyList = t => t.split(/(?<=[.!?])\s+/).filter(sn => (sn.match(/,/g) || []).length >= 3 &&
  sn.split(/,\s*(?:and\s+)?/).filter(x => /^(a|an|one|someone|your|the|some)\s/i.test(x.trim())).length >= 2);
export const memeTells = t => [...MEME_TELLS.filter(r => r.test(t)).map(r => (t.match(r) || [''])[0]), ...quirkyList(t).map(x => x.slice(0, 50))];

// Replace dashes the model slipped in anyway; walks any JSON value.
export function sanitize(v) {
  if (typeof v === 'string') return v
    .replace(/(\d)\s*[–—]\s*(\d)/g, '$1 to $2')
    .replace(/\s*[—–]\s*(?=[a-z])/g, ', ')
    .replace(/\s*[—–]\s*/g, '. ')
    .replace(/\.\s*\./g, '.').replace(/,\s*,/g, ',');
  if (Array.isArray(v)) return v.map(sanitize);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, sanitize(x)]));
  return v;
}
