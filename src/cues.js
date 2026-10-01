// Sound-effect cues for a Reel (shared by the Remotion composition and the parallel pipeline's ffmpeg audio mix).
// scenes: [{ kind, from, duration, sub, alert, stats, hit, shotType, sfx }] in frames. Returns [{ at (frame), file, volume }].
// sfx "hard" (default): explosion/impact/crash hits, loud. "soft": the old subtle set.
export const ALERT_AT = 40;

// when stat card i of a scene appears (frames into the scene); also used by the graphics so sound and count-up line up
// (after the camera lands on fly-to scenes)
export const statAt = (scene, i) => Math.max(16, Math.round(scene.duration * ((scene.shotType === 'flyto' ? 0.34 : 0.2) + 0.28 * i)));

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
    if (s.screen) {
      // how-to walkthrough: window slides in, keys tick while typing, clicks pop, results / claim ding
      add(s.from + Math.round(s.duration * (s.screen.at ?? 0.15)), 'whoosh', 0.45);
      (s.screen.steps || []).forEach(st => {
        const n = st.do === 'url' ? (s.screen.site || '').length : (st.text || '').length;
        const t0 = s.from + st.t + (st.do === 'url' ? 4 : 6);
        if (st.do === 'url' || st.do === 'type') {
          for (let c = 0; c < n; c += 2) add(t0 + c * 2, 'tick', 0.22);
          if (st.do === 'url') add(t0 + n * 2 + 4, 'pop', 0.4); // enter
        } else {
          add(s.from + st.t, 'pop', 0.6);
          if (st.do === 'click' && st.target !== 'claim') { add(s.from + st.t + 16, 'ding', 0.4); add(s.from + st.t + 20, 'count', 0.35); }
          if (st.target === 'claim') add(s.from + st.t + 8, 'ding', 0.55);
        }
      });
    }
    if (s === last && s.from > 45) add(s.from - 40, 'riser', hard ? 0.4 : 0.22);
    if (s.alert) add(s.from + ALERT_AT, hard ? 'crash' : 'boom', hard ? 0.6 : 0.3);
    if (s.kind === 'outro') { add(s.from + 3, 'ding', hard ? 0.45 : 0.3); if (hard) add(s.from + 2, 'impact', 0.35); }
  });
  return cues;
}
