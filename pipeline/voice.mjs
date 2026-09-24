// Narration per scene, stitched into one track with a timeline.
// Voice: episode.voice = { provider: "openai", voice: "ash" } → OpenAI TTS; otherwise Kokoro (KOKORO_VOICE, default am_adam).
import fs from 'node:fs';
import path from 'node:path';
import { writeWav } from './util.mjs';

const LEAD_IN = 0.25;   // seconds of silence before the first line
const GAP = 0.3;        // pause between scenes
const TAIL = 0.9;       // hold at the end

const OPENAI_STYLE = 'Deep, confident male voice. A fast, energetic Miami storyteller on TikTok: amused, a little disbelieving, full of attitude. ' +
  'Keep momentum: fast pace, no long pauses, sentences flow into each other, land each punchline quickly and dry. ' +
  'Never sound like an announcer, a teacher or an ad.';
const MAX_PAUSE = 0.28;   // seconds; longer silences inside a line get shortened

export async function makeNarration(episode, outDir) {
  const v = episode.voice || {};
  const speak = v.provider === 'openai' ? await openaiVoice(v) : await kokoroVoice();

  const clips = [];
  let sampleRate = 24000;
  for (const [i, scene] of episode.scenes.entries()) {
    let { samples, rate } = await speak(scene.text);
    sampleRate = rate;
    samples = shortenPauses(trimSilence(samples, rate), rate);
    if (v.provider === 'openai') samples = await tempo(samples, rate, v.speed ?? 1.12);
    clips.push(samples);
    console.log(`  scene ${i + 1}: ${(clips[i].length / rate).toFixed(2)}s`);
  }

  // Timeline: each scene lasts its speech + gap; the first also gets the lead-in, the last the tail
  const timeline = [];
  let t = 0;
  for (const [i, clip] of clips.entries()) {
    const speech = clip.length / sampleRate;
    const lead = i === 0 ? LEAD_IN : 0;
    const tail = i === clips.length - 1 ? TAIL : GAP;
    timeline.push({ start: t, speechStart: t + lead, speech, duration: lead + speech + tail });
    t += lead + speech + tail;
  }

  // per-scene clips are kept for caption timing
  const sceneDir = path.join(outDir, 'voice');
  fs.mkdirSync(sceneDir, { recursive: true });
  clips.forEach((clip, i) => writeWav(path.join(sceneDir, `${i}.wav`), clip, sampleRate));

  const total = new Float32Array(Math.ceil(t * sampleRate));
  clips.forEach((clip, i) => total.set(clip, Math.round(timeline[i].speechStart * sampleRate)));
  const file = path.join(outDir, 'narration.wav');
  writeWav(file, total, sampleRate);
  return { file, timeline, duration: t };
}

async function kokoroVoice() {
  const { KokoroTTS } = await import('kokoro-js');
  const voice = process.env.KOKORO_VOICE || 'am_adam';
  const speed = +(process.env.KOKORO_SPEED || 1.08);
  const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'fp32', device: 'cpu' });
  return async text => {
    const audio = await tts.generate(text, { voice, speed });
    return { samples: audio.audio, rate: audio.sampling_rate };
  };
}

async function openaiVoice({ voice = 'ash', instructions = OPENAI_STYLE, model = 'gpt-4o-mini-tts' }) {
  return async text => {
    for (let attempt = 1; ; attempt++) {
      const res = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, voice, input: text, instructions, response_format: 'pcm' }), // 24 kHz 16-bit mono
      });
      if (res.ok) {
        const pcm = Buffer.from(await res.arrayBuffer());
        const samples = new Float32Array(pcm.length / 2);
        for (let i = 0; i < samples.length; i++) samples[i] = pcm.readInt16LE(i * 2) / 32768;
        return { samples, rate: 24000 };
      }
      if (attempt >= 3) throw new Error(`OpenAI TTS ${res.status}: ${await res.text()}`);
      await new Promise(r => setTimeout(r, 3000 * attempt));
    }
  };
}

// Cut silences longer than MAX_PAUSE down to MAX_PAUSE (keeps the delivery tight)
function shortenPauses(samples, sr, threshold = 0.012) {
  const win = Math.round(sr * 0.01), max = Math.round(sr * MAX_PAUSE);
  const out = [];
  let quiet = 0;
  for (let i = 0; i < samples.length; i += win) {
    const chunk = samples.subarray(i, i + win);
    let peak = 0; for (const x of chunk) peak = Math.max(peak, Math.abs(x));
    if (peak < threshold) { quiet += chunk.length; if (quiet > max) continue; } else quiet = 0;
    out.push(chunk);
  }
  const res = new Float32Array(out.reduce((n, c) => n + c.length, 0));
  let o = 0; for (const c of out) { res.set(c, o); o += c.length; }
  return res;
}

// Speed up without changing pitch (ffmpeg atempo)
async function tempo(samples, sr, factor) {
  if (!factor || Math.abs(factor - 1) < 0.01) return samples;
  const { execFileSync } = await import('node:child_process');
  const os = await import('node:os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tempo-'));
  const a = path.join(tmp, 'a.wav'), b = path.join(tmp, 'b.raw');
  writeWav(a, samples, sr);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', a, '-filter:a', `atempo=${factor}`, '-f', 's16le', '-ac', '1', '-ar', String(sr), b]);
  const pcm = fs.readFileSync(b);
  fs.rmSync(tmp, { recursive: true, force: true });
  const out = new Float32Array(pcm.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = pcm.readInt16LE(i * 2) / 32768;
  return out;
}

function trimSilence(samples, sr, threshold = 0.01) {
  let a = 0, b = samples.length - 1;
  while (a < b && Math.abs(samples[a]) < threshold) a++;
  while (b > a && Math.abs(samples[b]) < threshold) b--;
  const pad = Math.round(sr * 0.04);
  return samples.slice(Math.max(0, a - pad), Math.min(samples.length, b + pad));
}
