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
- No jokes, puns or sarcasm. A dry, plain delivery is fine.
- Short, dense sentences. Every sentence carries a fact.`;

export function toneLines() {
  const f = path.join(ROOT, 'voice', 'tone.txt');
  const lines = fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').map(l => l.trim()).filter(Boolean) : [];
  return lines.length ? `TONE SAMPLES (imitate the rhythm and plainness; these are style examples, NOT facts to reuse):\n${lines.map(l => '- ' + l).join('\n')}` : '';
}

// Short reminder appended to every user message (keeps the style from fading).
export const REMINDER = 'Reminder: house style. No em or en dashes. Active voice, direct statements, no contrast framing, no subjective adjectives, no jokes.';

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
