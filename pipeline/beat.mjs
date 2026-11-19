// Free background beat, synthesized here (no samples, no licensing): kick/snare/hats + 808-style bass + soft chords.
// makeBeat(file, seconds, { bpm }) writes a mono WAV. Used by the TruLoader Reel (Facebook's API can't add a song).
import { writeWav } from './util.mjs';

export function makeBeat(file, seconds, { bpm = 100, sr = 44100, seed = 7 } = {}) {
  const n = Math.ceil(seconds * sr);
  const out = new Float32Array(n);
  let s = seed; const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
  const beat = 60 / bpm, bar = beat * 4;
  const add = (t0, len, fn) => { const a = Math.floor(t0 * sr), b = Math.min(n, a + Math.floor(len * sr)); for (let i = a; i < b; i++) out[i] += fn((i - a) / sr); };
  const midi = (m) => 440 * 2 ** ((m - 69) / 12);
  const prog = [[45, 57, 60, 64], [41, 53, 57, 60], [48, 55, 60, 64], [43, 55, 59, 62]]; // Am F C G
  const kick = (t) => { const f = 45 + 75 * Math.exp(-t * 28); return Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 7) * 0.9; };
  const snare = () => { let prev = 0; return (t) => { const x = rnd(); const hp = x - prev; prev = x; return (hp * 0.35 + Math.sin(2 * Math.PI * 190 * t) * 0.25) * Math.exp(-t * 16); }; };
  const hat = () => { let prev = 0; return (t) => { const x = rnd(); const hp = x - prev; prev = x; return hp * 0.12 * Math.exp(-t * 70); }; };
  for (let b = 0; b * bar < seconds; b++) {
    const t = b * bar, ch = prog[b % prog.length];
    for (const k of [0, 2.5, 3.0].map(x => x * beat)) add(t + k, 0.6, kick);           // kick: 1, 3&, 4
    for (const k of [1, 3].map(x => x * beat)) add(t + k, 0.3, snare());                // snare: 2, 4
    for (let h = 0; h < 8; h++) add(t + h * beat / 2, 0.08, hat());                     // 8th hats
    if (b % 2) for (let h = 0; h < 4; h++) add(t + 3 * beat + h * beat / 4, 0.05, hat()); // roll
    const f = midi(ch[0] - 12);
    for (const k of [0, 1.5, 2.5].map(x => x * beat)) add(t + k, beat * 1.2, (x) => Math.tanh(Math.sin(2 * Math.PI * f * x) * 2) * 0.32 * Math.exp(-x * 2.2)); // 808 bass
    add(t, bar, (x) => ch.slice(1).reduce((acc, m) => acc + (2 / Math.PI) * Math.asin(Math.sin(2 * Math.PI * midi(m) * x)), 0) * 0.035 * Math.min(1, x * 8) * Math.exp(-x * 0.6)); // chord pad
  }
  let peak = 0; for (const x of out) peak = Math.max(peak, Math.abs(x));
  for (let i = 0; i < n; i++) out[i] = (out[i] / (peak || 1)) * 0.85;
  writeWav(file, out, sr);
  return file;
}
