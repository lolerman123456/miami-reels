// Synthesized sound effects (no licensing issues). Generated once into assets/sfx.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, run } from './util.mjs';

const SFX = {
  whoosh: ['-f', 'lavfi', '-i', 'anoisesrc=d=0.7:c=pink:a=0.9',
           '-af', "highpass=f=250,lowpass=f=5000,afade=t=in:d=0.4:curve=exp,afade=t=out:st=0.4:d=0.3,volume=1.4"],
  boom:   ['-f', 'lavfi', '-i', "aevalsrc='0.95*sin(2*PI*(42+90*exp(-9*t))*t)*exp(-2.2*t)+0.25*(random(0)-0.5)*exp(-30*t)':d=1.6:s=44100",
           '-af', 'lowpass=f=900,volume=1.6'],
  pop:    ['-f', 'lavfi', '-i', "aevalsrc='0.8*sin(2*PI*(1100-7000*t)*t)*exp(-35*t)':d=0.16:s=44100"],
  ding:   ['-f', 'lavfi', '-i', "aevalsrc='0.45*sin(2*PI*1318*t)*exp(-3.5*t)+0.3*sin(2*PI*1976*t)*exp(-4.5*t)+0.15*sin(2*PI*2637*t)*exp(-6*t)':d=1.4:s=44100"],
  tick:   ['-f', 'lavfi', '-i', "aevalsrc='0.6*sin(2*PI*2400*t)*exp(-90*t)+0.3*sin(2*PI*1200*t)*exp(-60*t)':d=0.08:s=44100"],
  riser:  ['-f', 'lavfi', '-i', "aevalsrc='0.35*sin(2*PI*(200*t+300*t*t))*t/1.5+0.2*(random(0)-0.5)*t/1.5':d=1.5:s=44100",
           '-af', 'highpass=f=150,afade=t=out:st=1.4:d=0.1'],
};

export async function ensureSfx() {
  const dir = path.join(ROOT, 'assets', 'sfx');
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, args] of Object.entries(SFX)) {
    const file = path.join(dir, `${name}.wav`);
    if (!fs.existsSync(file)) await run('ffmpeg', ['-y', '-loglevel', 'error', ...args, '-ac', '2', file]);
  }
  return dir;
}
