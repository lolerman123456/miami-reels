// TruLoader weekly "highest paying lanes" Reel: dark US map, the camera flies lane to lane (countdown #N → #1),
// an arc draws from origin to destination with a truck dot, and a card shows the lane, $/mi and load count.
// Data comes from pipeline/truloader.mjs (truloader.com/api/public/top-lanes), points are pre-projected (Albers USA).
import React from 'react';
import { AbsoluteFill, Audio, Img, Sequence, staticFile, interpolate, spring, useCurrentFrame, useVideoConfig, Easing } from 'remotion';

export type LanePt = { x: number; y: number; label: string };
export type Lane = { rank: number; from: LanePt; to: LanePt; rate: string; sub: string };
export type LanesProps = {
  durationInFrames: number;
  hookFrames: number; laneFrames: number; outroFrames: number;
  laneStarts?: number[]; laneDurs?: number[]; music?: string | null;
  states: { d: string }[]; mapW: number; mapH: number;
  week: string; title: [string, string]; lanes: Lane[];
  colors: { primary: string; secondary: string; accent: string };
  cta: string; site: string; narration: string | null;
};

const FONT = 'Inter, Arial, sans-serif';
const starts = (p: LanesProps) => p.laneStarts || p.lanes.map((_, i) => p.hookFrames + i * p.laneFrames);
const durs = (p: LanesProps) => p.laneDurs || p.lanes.map(() => p.laneFrames);
const lanesEndOf = (p: LanesProps) => { const s = starts(p), d = durs(p); return s.length ? s[s.length - 1] + d[d.length - 1] : p.hookFrames; };
const laneIndex = (p: LanesProps, frame: number) => { const s = starts(p); let i = -1; for (let k = 0; k < s.length; k++) if (frame >= s[k]) i = k; return frame >= lanesEndOf(p) ? p.lanes.length : i; };

const useFonts = () => {
  React.useEffect(() => {
    const f = new FontFace('Inter', `url(${staticFile('fonts/InterVariable.woff2')})`, { weight: '100 900' });
    f.load().then((x) => (document as any).fonts.add(x)).catch(() => {});
  }, []);
};

// Map camera: scale + center in map coordinates, for each frame.
function camera(p: LanesProps, frame: number) {
  const full = { cx: p.mapW / 2, cy: p.mapH / 2, s: 1 };
  const shot = (l: Lane) => {
    const cx = (l.from.x + l.to.x) / 2, cy = (l.from.y + l.to.y) / 2;
    const span = Math.max(Math.abs(l.from.x - l.to.x), Math.abs(l.from.y - l.to.y) * 1.3, 60);
    return { cx, cy, s: Math.min(9, Math.max(1.4, (p.mapW * 0.45) / span)) };
  };
  if (frame < p.hookFrames) return full;
  const i = laneIndex(p, frame);
  if (i >= p.lanes.length) {
    const k = interpolate(frame - lanesEndOf(p), [0, 20], [0, 1], { extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) });
    const a = shot(p.lanes[p.lanes.length - 1]);
    return { cx: a.cx + (full.cx - a.cx) * k, cy: a.cy + (full.cy - a.cy) * k, s: a.s + (full.s - a.s) * k };
  }
  const prev = i === 0 ? full : shot(p.lanes[i - 1]);
  const cur = shot(p.lanes[i]);
  const k = interpolate(frame - starts(p)[i], [0, 16], [0, 1], { extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) });
  return { cx: prev.cx + (cur.cx - prev.cx) * k, cy: prev.cy + (cur.cy - prev.cy) * k, s: prev.s + (cur.s - prev.s) * k };
}

const arcPath = (a: LanePt, b: LanePt) => {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
  const bend = Math.min(80, len * 0.35);
  return { d: `M${a.x},${a.y} Q${mx - (dy / len) * bend},${my + (dx / len) * bend - bend * 0.3} ${b.x},${b.y}`,
    c: [mx - (dy / len) * bend, my + (dx / len) * bend - bend * 0.3] as [number, number] };
};
const qpt = (a: LanePt, c: [number, number], b: LanePt, t: number) => ({
  x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * c[0] + t * t * b.x,
  y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * c[1] + t * t * b.y,
});

const MapLayer: React.FC<{ p: LanesProps }> = ({ p }) => {
  const frame = useCurrentFrame();
  const cam = camera(p, frame);
  const W = 1080, VIEW_H = 1240; // map area: full width, upper part of the frame
  const base = W / p.mapW;
  const scale = base * cam.s;
  const tx = W / 2 - cam.cx * scale, ty = VIEW_H / 2 + 60 - cam.cy * scale;
  const cur = laneIndex(p, frame);
  return (
    <svg width={W} height={1920} style={{ position: 'absolute', inset: 0 }}>
      <defs>
        <radialGradient id="glow"><stop offset="0%" stopColor={p.colors.accent} stopOpacity="0.9" /><stop offset="100%" stopColor={p.colors.accent} stopOpacity="0" /></radialGradient>
      </defs>
      <g transform={`translate(${tx},${ty}) scale(${scale})`}>
        {p.states.map((s, i) => (
          <path key={i} d={s.d} fill="#13203a" stroke={p.colors.primary} strokeOpacity={0.55} strokeWidth={1.2 / scale * base} />
        ))}
        {p.lanes.map((l, i) => {
          const start = starts(p)[i];
          if (frame < start) return null;
          const t = frame - start;
          const prog = interpolate(t, [12, 40], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.quad) });
          const arc = arcPath(l.from, l.to);
          const active = i === cur;
          const sw = (active ? 4 : 2) / scale * base;
          const truck = qpt(l.from, arc.c, l.to, prog);
          const r = 7 / scale * base;
          return (
            <g key={i} opacity={active ? 1 : 0.45}>
              <path d={arc.d} fill="none" stroke={active ? p.colors.accent : p.colors.primary} strokeWidth={sw}
                pathLength={1} strokeDasharray={1} strokeDashoffset={1 - prog} strokeLinecap="round" />
              <circle cx={l.from.x} cy={l.from.y} r={r} fill={p.colors.primary} stroke="#fff" strokeWidth={r * 0.35} />
              {prog > 0.98 && <circle cx={l.to.x} cy={l.to.y} r={r} fill={p.colors.accent} stroke="#fff" strokeWidth={r * 0.35} />}
              {active && prog > 0 && prog < 1 && <circle cx={truck.x} cy={truck.y} r={r * 2.4} fill="url(#glow)" />}
              {active && prog > 0 && prog < 1 && <circle cx={truck.x} cy={truck.y} r={r * 0.9} fill="#fff" />}
            </g>
          );
        })}
      </g>
    </svg>
  );
};

const Card: React.FC<{ p: LanesProps; l: Lane; idx: number }> = ({ p, l, idx }) => {
  const dur = durs(p)[idx];
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 14, stiffness: 160 } });
  const out = interpolate(frame, [dur - 8, dur], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const rate = spring({ frame: frame - 18, fps, config: { damping: 10, stiffness: 200 } });
  return (
    <div style={{ position: 'absolute', left: 60, right: 60, bottom: 230, opacity: out, transform: `translateY(${(1 - pop) * 120}px)` }}>
      <div style={{ background: 'rgba(11,18,32,0.92)', border: `3px solid ${p.colors.primary}`, borderRadius: 36, padding: '34px 44px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          <div style={{ background: p.colors.accent, color: p.colors.secondary, fontFamily: FONT, fontWeight: 900, fontSize: 58, borderRadius: 20, padding: '4px 22px' }}>#{l.rank}</div>
          <div style={{ color: '#fff', fontFamily: FONT, fontWeight: 800, fontSize: 46, lineHeight: 1.15 }}>
            {l.from.label}<span style={{ color: p.colors.accent }}> → </span>{l.to.label}
          </div>
        </div>
        <div style={{ marginTop: 18, display: 'flex', alignItems: 'baseline', gap: 14, transform: `scale(${0.6 + 0.4 * rate})`, transformOrigin: 'left center' }}>
          <div style={{ color: p.colors.accent, fontFamily: FONT, fontWeight: 900, fontSize: 132, letterSpacing: -3 }}>{l.rate}</div>
          <div style={{ color: '#fff', fontFamily: FONT, fontWeight: 700, fontSize: 48, opacity: 0.85 }}>/mi</div>
        </div>
        <div style={{ color: '#c8d3e6', fontFamily: FONT, fontWeight: 600, fontSize: 38, marginTop: 4 }}>{l.sub}</div>
      </div>
    </div>
  );
};

const Hook: React.FC<{ p: LanesProps }> = ({ p }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s1 = spring({ frame, fps, config: { damping: 9, stiffness: 220 } });
  const s2 = spring({ frame: frame - 8, fps, config: { damping: 9, stiffness: 220 } });
  const out = interpolate(frame, [p.hookFrames - 8, p.hookFrames], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', opacity: out, padding: 70 }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ color: '#fff', fontFamily: FONT, fontWeight: 900, fontSize: 104, lineHeight: 1.02, transform: `scale(${2 - s1})`, opacity: s1, textShadow: '0 8px 40px rgba(0,0,0,0.7)' }}>{p.title[0]}</div>
        <div style={{ display: 'inline-block', marginTop: 26, background: p.colors.primary, color: '#fff', fontFamily: FONT, fontWeight: 900, fontSize: 96, padding: '8px 34px', borderRadius: 24, transform: `scale(${2 - s2})`, opacity: Math.max(0, s2) }}>{p.title[1]}</div>
        <div style={{ marginTop: 34, color: p.colors.accent, fontFamily: FONT, fontWeight: 800, fontSize: 46, opacity: s2 }}>{p.week}</div>
      </div>
    </AbsoluteFill>
  );
};

const Outro: React.FC<{ p: LanesProps }> = ({ p }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - 6, fps, config: { damping: 12, stiffness: 150 } });
  return (
    <AbsoluteFill style={{ background: `rgba(11,18,32,${interpolate(frame, [0, 12], [0, 0.88], { extrapolateRight: 'clamp' })})`, justifyContent: 'center', alignItems: 'center', padding: 80 }}>
      <div style={{ textAlign: 'center', opacity: s, transform: `translateY(${(1 - s) * 60}px)` }}>
        <Img src={staticFile('logo-white.png')} style={{ width: 760 }} />
        <div style={{ marginTop: 50, color: '#fff', fontFamily: FONT, fontWeight: 800, fontSize: 62, lineHeight: 1.15 }}>{p.cta}</div>
        <div style={{ marginTop: 40, display: 'inline-block', background: p.colors.accent, color: p.colors.secondary, fontFamily: FONT, fontWeight: 900, fontSize: 54, padding: '16px 40px', borderRadius: 999 }}>Try it free for 3 days</div>
        <div style={{ marginTop: 30, color: '#c8d3e6', fontFamily: FONT, fontWeight: 700, fontSize: 48 }}>{p.site}</div>
      </div>
    </AbsoluteFill>
  );
};

export const Lanes: React.FC<LanesProps> = (p) => {
  useFonts();
  const frame = useCurrentFrame();
  const lanesEnd = lanesEndOf(p);
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 35%, #12233f 0%, ${p.colors.secondary} 70%)` }}>
      <MapLayer p={p} />
      <div style={{ position: 'absolute', top: 70, left: 0, right: 0, display: 'flex', justifyContent: 'center', opacity: frame < p.hookFrames ? 0 : 1 }}>
        <Img src={staticFile('logo-white.png')} style={{ width: 420 }} />
      </div>
      {frame >= p.hookFrames && frame < lanesEnd && (
        <div style={{ position: 'absolute', top: 175, left: 0, right: 0, textAlign: 'center', color: p.colors.accent, fontFamily: FONT, fontWeight: 800, fontSize: 40, letterSpacing: 2 }}>TOP PAYING LANES · {p.week}</div>
      )}
      <Sequence durationInFrames={p.hookFrames}><Hook p={p} /></Sequence>
      {p.lanes.map((l, i) => (
        <Sequence key={i} from={starts(p)[i]} durationInFrames={durs(p)[i]}>
          <Card p={p} l={l} idx={i} />
          <Audio src={staticFile('sfx/whoosh.wav')} volume={0.3} />
        </Sequence>
      ))}
      <Sequence from={lanesEnd} durationInFrames={p.outroFrames}><Outro p={p} /></Sequence>
      <Sequence durationInFrames={20}><Audio src={staticFile('sfx/impact.wav')} volume={0.7} /></Sequence>
      {p.narration && <Audio src={staticFile(p.narration)} />}
      {p.music && <Audio src={staticFile(p.music)} volume={(f) => interpolate(f, [0, 15, p.durationInFrames - 45, p.durationInFrames], [0, 0.16, 0.16, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })} />}
      <div style={{ position: 'absolute', bottom: 60, left: 0, right: 0, textAlign: 'center', color: '#7f8ba3', fontFamily: FONT, fontWeight: 600, fontSize: 26 }}>Avg posted rates on load boards this week · source: truloader.com</div>
    </AbsoluteFill>
  );
};
