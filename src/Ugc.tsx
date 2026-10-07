// UGC edit (owner, Oct 7): a talking-head clip about NEAR, edited like top UGC ads — upscaled base video (prepared with
// ffmpeg), a countdown timer box at the top for tension, word-by-word captions with emojis (current word in Near blue),
// small pop-ups that keep it friendly ("as long as they have the app ofc 😌"), jump-cut punch-ins, ticks/pops, end card.
import React from 'react';
import {
  AbsoluteFill, Audio, OffthreadVideo, Sequence, continueRender, delayRender, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig,
} from 'remotion';

export type UgcWord = { w: string; s: number; e: number };          // frames
export type UgcProps = {
  durationInFrames: number;
  video: string;
  timer: { line1: string; line2: string; seconds: number };
  chunks: { words: UgcWord[]; emoji?: string; s: number; e: number }[];
  pops: { text: string; at: number; dur: number; y?: number }[];
  zooms: { at: number; scale: number }[];
  endCard?: { at: number; text: string };
  fit?: { scale: number; y: number };   // shrink + move the footage (origin top centre)
  safe?: boolean;                       // keep overlays inside the 4:5 centre
};

const BLUE = '#1769FF';
const useFonts = () => {
  const [h] = React.useState(() => delayRender('fonts'));
  React.useEffect(() => {
    Promise.all([
      new FontFace('Inter', `url(${staticFile('InterVariable.woff2')})`, { weight: '100 900' }).load(),
      new FontFace('Mont', `url(${staticFile('Montserrat-900.woff2')})`, { weight: '900' }).load(),
    ]).then(fs => { fs.forEach(f => document.fonts.add(f)); continueRender(h); }).catch(() => continueRender(h));
  }, [h]);
};

export const Ugc: React.FC<UgcProps> = (p) => {
  useFonts();
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  // jump-cut punch-ins: hold a zoom level per segment, eased over 3 frames
  let scale = 1;
  for (let i = 0; i < p.zooms.length; i++) if (f >= p.zooms[i].at) {
    const prev = i ? p.zooms[i - 1].scale : 1;
    scale = interpolate(f, [p.zooms[i].at, p.zooms[i].at + 3], [prev, p.zooms[i].scale], { extrapolateRight: 'clamp' });
  }
  const left = Math.max(0, Math.ceil(p.timer.seconds - f / fps));
  const fit = p.fit?.scale ?? 1;
  const chunk = p.chunks.find(c => f >= c.s && f < c.e);
  return (
    <AbsoluteFill style={{ background: '#000', overflow: 'hidden' }}>
      {/* 4:5-safe (owner, Oct 7: Meta masks 9:16 to the centre 1080x1350 on Feed/Explore/Profile, y 285–1635): the footage is
          shrunk/raised (fit) so face + phone stay inside it; a blurred copy fills the edges for full-screen Reels/Stories */}
      {fit < 1 && <AbsoluteFill style={{ transform: 'scale(1.25)', filter: 'blur(36px) brightness(.55)' }}><OffthreadVideo src={staticFile(p.video)} muted /></AbsoluteFill>}
      <AbsoluteFill style={{ transform: `translateY(${p.fit?.y ?? 0}px) scale(${fit})`, transformOrigin: '50% 0' }}>
        <AbsoluteFill style={{ transform: `scale(${scale})`, transformOrigin: '50% 70%' }}>
          <OffthreadVideo src={staticFile(p.video)} />
        </AbsoluteFill>
      </AbsoluteFill>

      {/* countdown timer box (like the reference): two small lines + a big mm:ss */}
      <div style={{ position: 'absolute', top: p.safe ? 300 : 210, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
        <div style={{ background: 'rgba(0,0,0,.82)', borderRadius: 14, padding: p.safe ? '12px 28px 4px' : '18px 34px 10px', textAlign: 'center', color: '#fff', fontFamily: 'Inter' }}>
          <div style={{ fontSize: p.safe ? 34 : 40, fontWeight: 600, lineHeight: 1.2 }}>{p.timer.line1}</div>
          <div style={{ fontSize: p.safe ? 34 : 40, fontWeight: 600, lineHeight: 1.2 }}>{p.timer.line2}</div>
          <div style={{ fontSize: p.safe ? 120 : 150, fontWeight: 300, lineHeight: 1.05, letterSpacing: 2, fontVariantNumeric: 'tabular-nums', color: left <= 3 ? '#ff4d4d' : '#fff' }}>00:{String(left).padStart(2, '0')}</div>
        </div>
      </div>

      {/* word-by-word captions */}
      {chunk && (() => {
        const s = spring({ frame: f - chunk.s, fps, config: { damping: 14, stiffness: 260, mass: 0.5 } });
        return (
          <div style={{ position: 'absolute', left: 60, right: 60, top: p.safe ? 1380 : 1400, textAlign: 'center', transform: `scale(${0.85 + 0.15 * s})` }}>
            <span style={{ fontFamily: 'Mont', fontWeight: 900, fontSize: 76, lineHeight: 1.12, textTransform: 'uppercase', WebkitTextStroke: '10px #000', paintOrder: 'stroke fill', textShadow: '0 6px 18px rgba(0,0,0,.55)' }}>
              {chunk.words.map((w, i) => <span key={i} style={{ color: f >= w.s && f < (chunk.words[i + 1]?.s ?? chunk.e) ? BLUE : '#fff' }}>{w.w}{i < chunk.words.length - 1 ? ' ' : ''}</span>)}
              {chunk.emoji && <span style={{ WebkitTextStroke: 0 }}> {chunk.emoji}</span>}
            </span>
          </div>
        );
      })()}

      {/* reassuring pop-ups */}
      {p.pops.map((pop, i) => {
        if (f < pop.at || f >= pop.at + pop.dur) return null;
        const inS = spring({ frame: f - pop.at, fps, config: { damping: 9, stiffness: 240, mass: 0.6 } });
        const out = interpolate(f, [pop.at + pop.dur - 6, pop.at + pop.dur], [1, 0], { extrapolateLeft: 'clamp' });
        return (
          <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: pop.y ?? 640, display: 'flex', justifyContent: 'center', opacity: out }}>
            <div style={{ transform: `scale(${inS})`, background: '#fff', color: '#111', border: `3px solid ${BLUE}`, fontFamily: 'Inter', fontWeight: 700, fontSize: 36, padding: '10px 22px', borderRadius: 30, boxShadow: '0 6px 18px rgba(0,0,0,.2)' }}>{pop.text}</div>
          </div>
        );
      })}

      {/* end card */}
      {p.endCard && f >= p.endCard.at && (() => {
        const s = spring({ frame: f - p.endCard.at, fps, config: { damping: 12, stiffness: 200 } });
        return (
          <div style={{ position: 'absolute', left: 0, right: 0, top: p.safe ? 1220 : 1600, display: 'flex', justifyContent: 'center' }}>
            <div style={{ transform: `translateY(${(1 - s) * 80}px)`, opacity: s, background: BLUE, color: '#fff', fontFamily: 'Inter', fontWeight: 850, fontSize: 46, padding: '22px 44px', borderRadius: 60, boxShadow: '0 14px 44px rgba(23,105,255,.55)' }}>{p.endCard.text}</div>
          </div>
        );
      })()}

      {/* sound: a soft tick each second of the countdown, a pop on each pop-up, a ding on the end card */}
      {[...Array(Math.floor(p.timer.seconds))].map((_, i) => <Sequence key={'t' + i} from={i * fps} durationInFrames={12}><Audio src={staticFile('sfx/tick.wav')} volume={0.12} /></Sequence>)}
      {p.pops.map((pop, i) => <Sequence key={'p' + i} from={pop.at} durationInFrames={20}><Audio src={staticFile('sfx/pop.wav')} volume={0.4} /></Sequence>)}
      {p.endCard && <Sequence from={p.endCard.at} durationInFrames={30}><Audio src={staticFile('sfx/ding.wav')} volume={0.4} /></Sequence>}
    </AbsoluteFill>
  );
};
