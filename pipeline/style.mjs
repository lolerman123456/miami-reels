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
- HUMOR (from comedy-writing guides): humor comes from SURPRISE; a formula stops being funny the second time.
  * Default is no joke. At most ONE joke in the whole post/video, only where a fact genuinely invites it. Most posts: zero.
  * Techniques to choose from (use a different one each time): say the obvious thing everyone thinks but nobody says;
    self-deprecation (we live here and pay this rent too); play dumb / take something literally; a short real moment
    people recognize; exaggerate one true detail to an absurd extreme; a callback to an earlier slide.
  * Said like a person talking, not a caption. Never mean, never at a group of people.
  * BANNED formulas (they read as AI): fact + ironic tag ("Same commute, $1,102 more." / "The beach is the same size." /
    "X went up, Y stayed the same." / "and the landlord got it." / "didn't get the memo."); lists of quirky things;
    personification ("acting rich", "pretending", "treated like suggestions"); "starter pack", "energy", "be having",
    "nobody asked for", "like it's a"; puns.
- Short, dense sentences. Every sentence carries a fact.`;

export function toneLines() {
  const f = path.join(ROOT, 'voice', 'tone.txt');
  const lines = fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').map(l => l.trim()).filter(Boolean) : [];
  return lines.length ? `TONE SAMPLES (imitate the rhythm and plainness; these are style examples, NOT facts to reuse):\n${lines.map(l => '- ' + l).join('\n')}` : '';
}

// Short reminder appended to every user message (keeps the style from fading).
export const REMINDER = 'Reminder: house style. No em or en dashes. Active voice, direct statements, no contrast framing, no subjective adjectives, no quirky lists, no fact + ironic tag; at most one joke in the whole post, only if a fact invites it.';

// Meme-caption / "white girl humor" patterns the owner hates: quirky lists and personification.
export const MEME_TELLS = [
  /\b(acting|pretending|treated|dressed) (like|as|rich)\b/i, /\blike it['’]s a\b/i, /\bnobody (asked|planned|needed)\b/i,
  /\bstarter pack\b/i, /(^|[.!?]\s+)same \w+/i, /\b(is|stayed|still|remains?) the same\b/i, /\band the \w+ (got|kept|took) (it|that)\b/i,
  /\bget the memo\b/i, /\b(main character|big \w+|\w+ city|chaotic|villain|rich|boss) energy\b/i, /\bbe having\b/i, /\byou swear\b/i, /\bthe way (it|they|he|she)\b/i,
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

// Confirmed Instagram handles (voice/handles.json) the writers may tag.
export function knownHandles() {
  const f = path.join(ROOT, 'voice', 'handles.json');
  if (!fs.existsSync(f)) return {};
  const h = JSON.parse(fs.readFileSync(f, 'utf8')); delete h._note; return h;
}
export const HANDLES_RULE = () => {
  const h = knownHandles();
  return Object.keys(h).length ? `COLLABORATORS: if the post is mainly about one of these, list their handle(s) in "collaborators" (max 3) and @mention them once in the caption. Only use handles from this list, never guess others:\n${Object.entries(h).map(([k, v]) => `- ${k}: ${v}`).join('\n')}` : '';
};
// keep only confirmed handles
export const cleanCollabs = list => { const ok = new Set(Object.values(knownHandles())); return [...new Set((list || []).map(x => String(x).replace(/^@/, '').trim()))].filter(x => ok.has(x)).slice(0, 3); };
