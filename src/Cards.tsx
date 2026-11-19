// TruLoader concept Reels (pipeline/trucktips.mjs): hook → one big card per point → TruLoader outro.
// Same dark US map look as Lanes.tsx; each card can shade states (fuel by region, top-paying states) or dim the map.
import React from 'react';
import { AbsoluteFill, Audio, Img, Sequence, staticFile, interpolate, spring, useCurrentFrame, useVideoConfig, Easing } from 'remotion';

export type CardItem = { start: number; dur: number; kicker: string; big: string; title: string; sub: string; shade?: Record<string, string>; cam?: { cx: number; cy: number; s: number } };
export type CardsProps = {
  durationInFrames: number; hookFrames: number; outroFrames: number;
  title: [string, string]; tag: string; states: { d: string; name?: string }[]; mapW: number; mapH: number;
  items: CardItem[]; colors: { primary: string; secondary: string; accent: string };
  cta: string; site: string; source: string; narration: string | null; music?: string | null; showMap?: boolean;
};

const FONT = 'Inter, Arial, sans-serif';
const useFonts = () => {
  React.useEffect(() => {
    const f = new FontFace('Inter', `url(${staticFile('fonts/InterVariable.woff2')})`, { weight: '100 900' });
    f.load().then((x) => (document as any).fonts.add(x)).catch(() => {});
  }, []);
};

// Camera: full map during the hook, then flies to each card's states (item.cam) and back out for the outro.
function camAt(p: CardsProps, frame: number) {
  const full = { cx: p.mapW / 2, cy: p.mapH / 2, s: 1 };
  let i = -1; p.items.forEach((it, k) => { if (frame >= it.start) i = k; });
  if (i < 0) return full;
  const end = p.items[p.items.length - 1].start + p.items[p.items.length - 1].dur;
  const camOf = (k: number) => (k >= 0 && k < p.items.length && p.items[k].cam) || full;
  const from = frame >= end ? camOf(p.items.length - 1) : camOf(i - 1), to = frame >= end ? full : camOf(i);
  const k = interpolate(frame - (frame >= end ? end : p.items[i].start), [0, 18], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) });
  return { cx: from.cx + (to.cx - from.cx) * k, cy: from.cy + (to.cy - from.cy) * k, s: from.s + (to.s - from.s) * k };
}

const MapBg: React.FC<{ p: CardsProps; shade?: Record<string, string> }> = ({ p, shade }) => {
  const frame = useCurrentFrame();
  const W = 1080, base = W / p.mapW, cam = camAt(p, frame), sc = base * cam.s * (1 + frame * 0.0002);
  return (
    <svg width={W} height={1920} style={{ position: 'absolute', inset: 0, opacity: p.showMap === false ? 0.25 : 1 }}>
      <g transform={`translate(${W / 2},${620}) scale(${sc}) translate(${-cam.cx},${-cam.cy})`}>
        {p.states.map((st, i) => (
          <path key={i} d={st.d} fill={(shade && st.name && shade[st.name]) || '#13203a'} stroke={p.colors.primary} strokeOpacity={0.55} strokeWidth={1.2 * base / sc * 1.5} />
        ))}
      </g>
    </svg>
  );
};

const Card: React.FC<{ p: CardsProps; it: CardItem }> = ({ p, it }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 14, stiffness: 160 } });
  const big = spring({ frame: frame - 10, fps, config: { damping: 10, stiffness: 200 } });
  const out = interpolate(frame, [it.dur - 8, it.dur], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <div style={{ position: 'absolute', left: 60, right: 60, bottom: 230, opacity: out, transform: `translateY(${(1 - pop) * 120}px)` }}>
      <div style={{ background: 'rgba(11,18,32,0.93)', border: `3px solid ${p.colors.primary}`, borderRadius: 36, padding: '34px 44px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'inline-block', background: p.colors.accent, color: p.colors.secondary, fontFamily: FONT, fontWeight: 900, fontSize: 40, borderRadius: 16, padding: '4px 20px' }}>{it.kicker}</div>
        {it.big && <div style={{ marginTop: 14, color: p.colors.accent, fontFamily: FONT, fontWeight: 900, fontSize: it.big.length > 9 ? 92 : 128, letterSpacing: -3, lineHeight: 1.05, transform: `scale(${0.6 + 0.4 * big})`, transformOrigin: 'left center' }}>{it.big}</div>}
        <div style={{ marginTop: 12, color: '#fff', fontFamily: FONT, fontWeight: 800, fontSize: 54, lineHeight: 1.15 }}>{it.title}</div>
        {it.sub && <div style={{ color: '#c8d3e6', fontFamily: FONT, fontWeight: 600, fontSize: 38, marginTop: 12, lineHeight: 1.25 }}>{it.sub}</div>}
      </div>
    </div>
  );
};

const Hook: React.FC<{ p: CardsProps }> = ({ p }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s1 = spring({ frame, fps, config: { damping: 9, stiffness: 220 } });
  const s2 = spring({ frame: frame - 8, fps, config: { damping: 9, stiffness: 220 } });
  const out = interpolate(frame, [p.hookFrames - 8, p.hookFrames], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', opacity: out, padding: 70, background: 'rgba(11,18,32,0.55)' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ color: '#fff', fontFamily: FONT, fontWeight: 900, fontSize: 100, lineHeight: 1.04, transform: `scale(${2 - s1})`, opacity: s1, textShadow: '0 8px 40px rgba(0,0,0,0.7)' }}>{p.title[0]}</div>
        <div style={{ display: 'inline-block', marginTop: 26, background: p.colors.primary, color: '#fff', fontFamily: FONT, fontWeight: 900, fontSize: 88, lineHeight: 1.05, padding: '10px 34px', borderRadius: 24, transform: `scale(${2 - s2})`, opacity: Math.max(0, s2) }}>{p.title[1]}</div>
      </div>
    </AbsoluteFill>
  );
};

const Outro: React.FC<{ p: CardsProps }> = ({ p }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - 6, fps, config: { damping: 12, stiffness: 150 } });
  return (
    <AbsoluteFill style={{ background: `rgba(11,18,32,${interpolate(frame, [0, 12], [0, 0.9], { extrapolateRight: 'clamp' })})`, justifyContent: 'center', alignItems: 'center', padding: 80 }}>
      <div style={{ textAlign: 'center', opacity: s, transform: `translateY(${(1 - s) * 60}px)` }}>
        <Img src={staticFile('logo-white.png')} style={{ width: 760 }} />
        <div style={{ marginTop: 50, color: '#fff', fontFamily: FONT, fontWeight: 800, fontSize: 60, lineHeight: 1.15 }}>{p.cta}</div>
        <div style={{ marginTop: 40, display: 'inline-block', background: p.colors.accent, color: p.colors.secondary, fontFamily: FONT, fontWeight: 900, fontSize: 54, padding: '16px 40px', borderRadius: 999 }}>Try it free for 3 days</div>
        <div style={{ marginTop: 30, color: '#c8d3e6', fontFamily: FONT, fontWeight: 700, fontSize: 48 }}>{p.site}</div>
      </div>
    </AbsoluteFill>
  );
};

export const Cards: React.FC<CardsProps> = (p) => {
  useFonts();
  const frame = useCurrentFrame();
  const end = p.items.length ? p.items[p.items.length - 1].start + p.items[p.items.length - 1].dur : p.hookFrames;
  const cur = p.items.find((it) => frame >= it.start && frame < it.start + it.dur);
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 35%, #12233f 0%, ${p.colors.secondary} 70%)` }}>
      <MapBg p={p} shade={cur?.shade} />
      <div style={{ position: 'absolute', top: 70, left: 0, right: 0, display: 'flex', justifyContent: 'center', opacity: frame < p.hookFrames ? 0 : 1 }}>
        <Img src={staticFile('logo-white.png')} style={{ width: 420 }} />
      </div>
      {frame >= p.hookFrames && frame < end && (
        <div style={{ position: 'absolute', top: 175, left: 40, right: 40, textAlign: 'center', color: p.colors.accent, fontFamily: FONT, fontWeight: 800, fontSize: 40, letterSpacing: 2 }}>{p.tag}</div>
      )}
      <Sequence durationInFrames={p.hookFrames}><Hook p={p} /></Sequence>
      {p.items.map((it, i) => (
        <Sequence key={i} from={it.start} durationInFrames={it.dur}>
          <Card p={p} it={it} />
          <Audio src={staticFile('sfx/whoosh.wav')} volume={0.3} />
        </Sequence>
      ))}
      <Sequence from={end} durationInFrames={p.outroFrames}><Outro p={p} /></Sequence>
      <Sequence durationInFrames={20}><Audio src={staticFile('sfx/impact.wav')} volume={0.7} /></Sequence>
      {p.narration && <Audio src={staticFile(p.narration)} />}
      {p.music && <Audio src={staticFile(p.music)} volume={(f) => interpolate(f, [0, 15, p.durationInFrames - 45, p.durationInFrames], [0, 0.16, 0.16, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })} />}
      {p.source && <div style={{ position: 'absolute', bottom: 60, left: 40, right: 40, textAlign: 'center', color: '#7f8ba3', fontFamily: FONT, fontWeight: 600, fontSize: 26 }}>{p.source}</div>}
    </AbsoluteFill>
  );
};
