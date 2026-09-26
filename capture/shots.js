// Camera moves. Each returns heading/pitch (radians) and range (meters) for t in [0,1].
// Shared by the renderer; keep it dependency-free.

const easeInOutCubic = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeInOutSine = t => -(Math.cos(Math.PI * t) - 1) / 2;
const easeOutExpo = t => t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
const lerp = (a, b, t) => a + (b - a) * t;
const logLerp = (a, b, t) => a * Math.pow(b / a, t);

// Where the camera sits at the very end of a shot (flyto starts there so the cut is invisible).
export function endPose(shot, rad) { return poseAt(shot, 1, rad); }

export function poseAt(shot, t, rad) {
  const R = shot.range ?? 700;
  const P = rad(shot.pitch ?? -28);
  const H = rad(shot.heading ?? 0);
  const dir = shot.dir ?? 1;

  switch (shot.type) {
    case 'orbit': { // slow cinematic spin around the target
      const deg = shot.degrees ?? 70;
      return { h: H + dir * rad(deg) * easeInOutSine(t), p: P, r: R };
    }
    case 'dive': { // hook: fast drop from very high up, slams in then settles
      const e = easeOutExpo(t);
      return { h: H + dir * rad(120) * e, p: lerp(rad(-89), P, e), r: logLerp(R * 60, R, e) };
    }
    case 'zoomin': {
      const e = easeInOutCubic(t);
      return { h: H + dir * rad(60) * e, p: lerp(rad(-85), P, e), r: logLerp(R * 12, R, e) };
    }
    case 'pullout': {
      const e = easeInOutCubic(t);
      return { h: H + dir * rad(60) * e, p: lerp(P, rad(-70), e), r: logLerp(R, R * 10, e) };
    }
    case 'arrive': { // fast swoop in from high above (first ~22%), then a slow-motion circle over the place
      const k = shot.fast ?? 0.22;
      if (t < k) {
        const e = easeOutCubic(t / k);
        return { h: H - dir * rad(50) * (1 - e), p: lerp(rad(-80), P, e), r: logLerp(R * 25, R, e) };
      }
      const u = (t - k) / (1 - k);
      return { h: H + dir * rad(shot.degrees ?? 45) * easeInOutSine(u), p: P, r: R * (1 - 0.1 * u) };
    }
    case 'flyto': { // zoom out from the previous place, fly fast to this one, drop in, then slow orbit
      // needs shot.prev (previous shot) and shot.dist (m between the two places); c = how far the look-at point has moved
      const k = shot.fast ?? 0.3;
      if (!shot.prev && t < k) return poseAt({ ...shot, type: 'arrive', degrees: 0 }, t, rad);
      if (!shot.prev) return { h: H + dir * rad(shot.degrees ?? 40) * easeInOutSine((t - k) / (1 - k)), p: P, r: R * (1 - 0.08 * (t - k) / (1 - k)) };
      const p0 = poseAt(shot.prev, 1, rad);
      if (t < k) {
        const u = t / k, e = easeInOutCubic(u), bump = Math.sin(Math.PI * u);
        const top = Math.max((shot.dist ?? 3000) * 1.1, R * 5, p0.r * 3);
        const logR = Math.log(p0.r) + (Math.log(R) - Math.log(p0.r)) * e;
        const lift = Math.max(0, Math.log(top) - (Math.log(p0.r) + Math.log(R)) / 2);
        // shortest way round for the heading
        let dh = H - p0.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        return { h: p0.h + dh * e, p: Math.max(rad(-88), lerp(p0.p, P, e) - rad(40) * bump), r: Math.exp(logR + lift * bump), c: easeInOutCubic(Math.min(1, u * 1.05)) };
      }
      const u = (t - k) / (1 - k);
      return { h: H + dir * rad(shot.degrees ?? 40) * easeInOutSine(u), p: P, r: R * (1 - 0.08 * u), c: 1 };
    }
    case 'push':
    default: { // slow drift toward the target
      const e = easeInOutSine(t);
      return { h: H + dir * rad(25) * e, p: lerp(P - rad(8), P, e), r: lerp(R * 1.7, R * 0.8, e) };
    }
  }
}
