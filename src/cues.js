// Sound-effect cues for a Reel (shared by the Remotion composition and the parallel pipeline's ffmpeg audio mix).
// scenes: [{ kind, from, duration, sub, alert, stats, hit, shotType, sfx }] in frames. Returns [{ at (frame), file, volume }].
// sfx "hard" (default): explosion/impact/crash hits, loud. "soft": the old subtle set.
export const ALERT_AT = 40;

// when stat card i of a scene appears (frames into the scene); also used by the graphics so sound and count-up line up
export const statAt = (scene, i) => Math.max(16, Math.round(scene.duration * (0.2 + 0.32 * i)));

export function sfxCues(scenes) {
  const cues = [];
  const items = scenes.filter(s => s.kind === 'item');
  const last = items[items.length - 1];
  const add = (at, name, volume) => cues.push({ at: Math.max(0, Math.round(at)), file: `sfx/${name}.wav`, volume });
  scenes.forEach(s => {
    const hard = s.sfx !== 'soft';
    if (s.kind === 'hook') {
      if (hard) { add(0, s.hit || 'explosion', 0.75); add(4, 'impact', 0.45); }
      else { add(0, 'boom', 0.35); add(3, 'tick', 0.3); add(8, 'tick', 0.3); }
    } else if (s.shotType === 'flyto') {
      add(s.from - 6, 'swoosh', hard ? 0.6 : 0.35);
    } else {
      add(s.from - 8, 'whoosh', hard ? 0.55 : 0.3);
    }
    if (s.kind === 'item') {
      if (hard) {
        add(s.from + (s.shotType === 'flyto' ? Math.round(s.duration * 0.3) : 2), s.hit || 'impact', s.hit ? 0.8 : 0.55);
        add(s.from + 8, 'tick', 0.4);
      } else {
        add(s.from + 3, 'tick', 0.32); add(s.from + 8, 'pop', 0.18);
        if (s.sub) add(s.from + 13, 'tick', 0.22);
      }
      (s.stats || []).slice(0, 2).forEach((_, i) => {
        add(s.from + statAt(s, i), 'count', hard ? 0.5 : 0.3);
        add(s.from + statAt(s, i) + 19, hard ? 'impact' : 'pop', hard ? 0.4 : 0.2);
      });
    }
    if (s === last && s.from > 45) add(s.from - 40, 'riser', hard ? 0.4 : 0.22);
    if (s.alert) add(s.from + ALERT_AT, hard ? 'crash' : 'boom', hard ? 0.6 : 0.3);
    if (s.kind === 'outro') { add(s.from + 3, 'ding', hard ? 0.45 : 0.3); if (hard) add(s.from + 2, 'impact', 0.35); }
  });
  return cues;
}
