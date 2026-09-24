// Camera moves. Each returns heading/pitch (radians) and range (meters) for t in [0,1].
// Shared by the renderer; keep it dependency-free.

const easeInOutCubic = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeInOutSine = t => -(Math.cos(Math.PI * t) - 1) / 2;
const easeOutExpo = t => t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
const lerp = (a, b, t) => a + (b - a) * t;
const logLerp = (a, b, t) => a * Math.pow(b / a, t);

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
    case 'push':
    default: { // slow drift toward the target
      const e = easeInOutSine(t);
      return { h: H + dir * rad(25) * e, p: lerp(P - rad(8), P, e), r: lerp(R * 1.7, R * 0.8, e) };
    }
  }
}
