// Narration: Kokoro TTS per scene, stitched into one track with a timeline.
import path from 'node:path';
import { KokoroTTS } from 'kokoro-js';
import { writeWav } from './util.mjs';

const LEAD_IN = 0.25;   // seconds of silence before the first line
const GAP = 0.3;        // pause between scenes
const TAIL = 0.9;       // hold at the end

export async function makeNarration(episode, outDir) {
  const voice = process.env.KOKORO_VOICE || 'am_adam';
  const speed = +(process.env.KOKORO_SPEED || 1.08);
  const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'fp32', device: 'cpu' });

  const clips = [];
  let sampleRate = 24000;
  for (const [i, scene] of episode.scenes.entries()) {
    const audio = await tts.generate(scene.text, { voice, speed });
    sampleRate = audio.sampling_rate;
    clips.push(trimSilence(audio.audio, sampleRate));
    console.log(`  scene ${i + 1}: ${(clips[i].length / sampleRate).toFixed(2)}s`);
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

  const total = new Float32Array(Math.ceil(t * sampleRate));
  clips.forEach((clip, i) => total.set(clip, Math.round(timeline[i].speechStart * sampleRate)));
  const file = path.join(outDir, 'narration.wav');
  writeWav(file, total, sampleRate);
  return { file, timeline, duration: t };
}

function trimSilence(samples, sr, threshold = 0.01) {
  let a = 0, b = samples.length - 1;
  while (a < b && Math.abs(samples[a]) < threshold) a++;
  while (b > a && Math.abs(samples[b]) < threshold) b--;
  const pad = Math.round(sr * 0.04);
  return samples.slice(Math.max(0, a - pad), Math.min(samples.length, b + pad));
}
