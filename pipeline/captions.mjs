// Word-level caption timing via OpenAI Whisper, snapped back to the script's spelling.
import fs from 'node:fs';

export async function transcribeWords(wavFile) {
  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(wavFile)], { type: 'audio/wav' }), 'narration.wav');
  form.append('model', 'whisper-1');
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'word');
  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Whisper ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.words.map(w => ({ text: w.word, start: w.start, end: w.end }));
}

// Whisper sometimes spells things differently ("38" vs "thirty-eight"). Use the script's words for
// display, and Whisper's timings where the word counts line up per scene; otherwise spread evenly.
export function alignToScript(episode, timeline, whisperWords) {
  const out = [];
  episode.scenes.forEach((scene, i) => {
    const { speechStart, speech } = timeline[i];
    const words = (scene.caption || scene.text).split(/\s+/).filter(Boolean);
    const inScene = whisperWords.filter(w => w.start >= speechStart - 0.15 && w.start < speechStart + speech + 0.1);
    if (inScene.length === words.length) {
      words.forEach((text, j) => out.push({ text, start: inScene[j].start, end: inScene[j].end, scene: i }));
    } else {
      // proportional to word length inside the scene's speech window
      const weights = words.map(w => w.replace(/[^\w]/g, '').length + 2);
      const sum = weights.reduce((a, b) => a + b, 0);
      let t = speechStart;
      words.forEach((text, j) => {
        const d = speech * weights[j] / sum;
        out.push({ text, start: t, end: t + d, scene: i });
        t += d;
      });
    }
  });
  return out;
}
