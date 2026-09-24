// Word-level caption timing: Whisper on each scene's clip separately, then the on-screen words are
// aligned to Whisper's words (edit-distance alignment), so a spelling difference ("188" vs "a hundred
// eighty-eight") only affects that word instead of shifting the whole scene.
import fs from 'node:fs';
import path from 'node:path';

async function transcribe(wavFile) {
  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(wavFile)], { type: 'audio/wav' }), path.basename(wavFile));
  form.append('model', 'whisper-1');
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'word');
  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: form,
  });
  if (!res.ok) throw new Error(`Whisper ${res.status}: ${await res.text()}`);
  return (await res.json()).words || [];
}

const norm = w => w.toLowerCase().replace(/[^a-z0-9]/g, '');

export async function makeCaptions(episode, timeline, epDir) {
  const out = [];
  for (const [i, scene] of episode.scenes.entries()) {
    const { speechStart, speech } = timeline[i];
    const heard = (await transcribe(path.join(epDir, 'voice', `${i}.wav`)))
      .map(w => ({ n: norm(w.word), start: speechStart + w.start, end: speechStart + w.end }));
    const words = (scene.caption || scene.text).split(/\s+/).filter(Boolean);
    const times = align(words.map(norm), heard, speechStart, speechStart + speech);
    words.forEach((text, j) => out.push({ text, start: times[j].start, end: times[j].end, scene: i }));
  }
  return out;
}

// Needleman–Wunsch style alignment; unmatched script words are interpolated between neighbours.
function align(script, heard, t0, t1) {
  const n = script.length, m = heard.length;
  const cost = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  const move = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) { cost[i][0] = i; move[i][0] = 1; }
  for (let j = 1; j <= m; j++) { cost[0][j] = j; move[0][j] = 2; }
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
    const sub = cost[i - 1][j - 1] + (script[i - 1] === heard[j - 1].n ? 0 : 1);
    const del = cost[i - 1][j] + 1, ins = cost[i][j - 1] + 1;
    cost[i][j] = Math.min(sub, del, ins);
    move[i][j] = cost[i][j] === sub ? 0 : cost[i][j] === del ? 1 : 2;
  }
  const times = new Array(n).fill(null);
  for (let i = n, j = m; i > 0 || j > 0;) {
    const mv = move[i][j];
    if (i > 0 && j > 0 && mv === 0) { times[i - 1] = { start: heard[j - 1].start, end: heard[j - 1].end }; i--; j--; }
    else if (i > 0 && (j === 0 || mv === 1)) i--;
    else j--;
  }
  // fill gaps by interpolation
  for (let i = 0; i < n; i++) {
    if (times[i]) continue;
    let k = i; while (k < n && !times[k]) k++;
    const from = i > 0 ? times[i - 1].end : t0, to = k < n ? times[k].start : t1;
    const step = (to - from) / (k - i);
    for (let x = i; x < k; x++) times[x] = { start: from + step * (x - i), end: from + step * (x - i + 1) };
    i = k - 1;
  }
  return times;
}
