import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(ROOT, '.env') });

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;

export function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: opts.quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit', cwd: opts.cwd || ROOT });
    let err = '';
    p.stderr?.on('data', d => { err += d; });
    p.on('close', code => code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}\n${err.slice(-2000)}`)));
  });
}

export function readJSON(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
export function writeJSON(file, data) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(data, null, 2)); }

export function step(msg) { console.log(`\n▶ ${msg}`); }

// Write mono Float32 samples as 16-bit PCM WAV
export function writeWav(file, samples, sampleRate) {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + samples.length * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24); buf.writeUInt32LE(sampleRate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
  fs.writeFileSync(file, buf);
}
