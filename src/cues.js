// Sound-effect cues for a Reel (shared by the Remotion composition and the parallel pipeline's ffmpeg audio mix).
// scenes: [{ kind, from, duration, sub, alert }] in frames. Returns [{ at (frame), file, volume }].
export const ALERT_AT = 40;
export function sfxCues(scenes) {
  const cues = [];
  const items = scenes.filter(s => s.kind === 'item');
  const last = items[items.length - 1];
  scenes.forEach(s => {
    if (s.kind === 'hook') {
      cues.push({ at: 0, file: 'sfx/boom.wav', volume: 0.35 });
      cues.push({ at: 3, file: 'sfx/tick.wav', volume: 0.3 });
      cues.push({ at: 8, file: 'sfx/tick.wav', volume: 0.3 });
    } else {
      cues.push({ at: Math.max(0, s.from - 8), file: 'sfx/whoosh.wav', volume: 0.3 });
    }
    if (s.kind === 'item') {
      cues.push({ at: s.from + 3, file: 'sfx/tick.wav', volume: 0.32 });
      cues.push({ at: s.from + 8, file: 'sfx/pop.wav', volume: 0.18 });
      if (s.sub) cues.push({ at: s.from + 13, file: 'sfx/tick.wav', volume: 0.22 });
    }
    if (s === last && s.from > 45) cues.push({ at: s.from - 40, file: 'sfx/riser.wav', volume: 0.22 });
    if (s.alert) cues.push({ at: s.from + ALERT_AT, file: 'sfx/boom.wav', volume: 0.3 });
    if (s.kind === 'outro') cues.push({ at: s.from + 3, file: 'sfx/ding.wav', volume: 0.3 });
  });
  return cues;
}
