// Viral clip Reel (owner, Oct 3): "only in dade meets kalshi" — a real viral video with light, clean, news-style edits:
//   intro: black card, a WARNING card fades in/out (sensitive footage only), then the story card fades in
//          (headline + 2–3 lines, "pause to read") — no typing, no game sounds (owner: only the video's own audio)
//   video: plays; near the start it freezes ~3 s while numbered markers point at who is who, and a bottom strip of stills
//          cropped from the footage (① SUSPECT, ② WHITE SUV…) appears and stays for the rest of the video
//   situation box on top, short captions above the strip, credit + @getnearapp at the bottom
// Fonts: Oswald (headlines, TV-news style) + Roboto Condensed (text).
import React from 'react';
import {
  AbsoluteFill, Freeze, Img, OffthreadVideo, Sequence, staticFile, interpolate, useCurrentFrame,
  delayRender, continueRender,
} from 'remotion';

export type ViralLabel = { text: string; x: number; y: number; thumb?: string | null };
export type ViralProps = {
  durationInFrames: number;
  video: string; videoW: number; videoH: number; clipFrames: number;
  fill?: boolean; focusX?: number; // full 9:16 when the action fits a vertical crop (focusX = where to center it)
  intro: { frames: number; warning: boolean; title: string; sub?: string; context?: string };
  banner: string;
  captions: { at: number; text: string }[]; // at = frame in the clip
  freeze: { at: number; hold: number; labels: ViralLabel[] } | null;
  credit: string;
};

const BLUE = '#1769FF';
const W = 1080, H = 1920;
const HEAD = "'Oswald', 'Roboto Condensed', sans-serif";
const TEXT = "'Roboto Condensed', 'Oswald', sans-serif";
export const WARN_FRAMES = 75;

const useFonts = () => {
  const [handle] = React.useState(() => delayRender('fonts'));
  React.useEffect(() => {
    const faces = [
      new FontFace('Oswald', `url(${staticFile('fonts/Oswald-var.woff2')})`, { weight: '200 700' }),
      new FontFace('Roboto Condensed', `url(${staticFile('fonts/RobotoCondensed-var.woff2')})`, { weight: '100 900' }),
    ];
    Promise.all(faces.map(f => f.load().then(x => document.fonts.add(x)).catch(() => {}))).then(() => continueRender(handle));
  }, [handle]);
};

// where the sharp video sits: full 9:16 (vertical footage, or wide footage whose action fits a vertical crop) or full
// width a bit above center with a blurred copy filling top and bottom
export const videoRect = (vw: number, vh: number, fill = false, focusX = 0.5) => {
  if (fill || vw / vh < 0.8) {
    const scale = Math.max(W / vw, H / vh);
    const width = Math.round(vw * scale), height = Math.round(vh * scale);
    const left = Math.round(Math.min(0, Math.max(W - width, W / 2 - focusX * width)));
    return { left, top: Math.round((H - height) / 2), width, height };
  }
  const height = Math.round((W * vh) / vw);
  return { left: 0, top: Math.round((H - height) / 2) - 140, width: W, height };
};

const VideoLayer: React.FC<{ p: ViralProps; muted?: boolean; startFrom?: number }> = ({ p, muted, startFrom = 0 }) => {
  const r = videoRect(p.videoW, p.videoH, p.fill, p.focusX);
  const src = staticFile(p.video);
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <OffthreadVideo src={src} startFrom={startFrom} muted style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(40px) brightness(0.4)', transform: 'scale(1.15)' }} />
      <OffthreadVideo src={src} startFrom={startFrom} muted={muted} style={{ position: 'absolute', left: r.left, top: r.top, width: r.width, height: r.height, objectFit: 'cover' }} />
    </AbsoluteFill>
  );
};

const fade = (f: number, a: number, b: number, len = 6) =>
  interpolate(f, [a, a + len, b - len, b], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

const Wordmark: React.FC = () => (
  <div style={{ position: 'absolute', top: 290, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
    <span style={{ background: BLUE, color: '#fff', fontFamily: HEAD, fontWeight: 600, fontSize: 44, letterSpacing: 1, padding: '8px 30px', borderRadius: 999 }}>getnearapp</span>
  </div>
);

const Intro: React.FC<{ p: ViralProps }> = ({ p }) => {
  const f = useCurrentFrame();
  const W0 = p.intro.warning ? WARN_FRAMES : 0;
  return (
    <AbsoluteFill style={{ background: '#000', textAlign: 'center' }}>
      <div style={{ opacity: interpolate(f, [0, 6, p.intro.frames - 6, p.intro.frames], [0, 1, 1, 0], { extrapolateRight: 'clamp' }) }}><Wordmark /></div>
      {W0 > 0 && (
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '0 90px', opacity: fade(f, 0, W0, 6) }}>
          <div style={{ color: BLUE, fontFamily: HEAD, fontWeight: 700, fontSize: 112, letterSpacing: 8 }}>WARNING</div>
          <div style={{ marginTop: 26, color: '#fff', fontFamily: TEXT, fontWeight: 500, fontSize: 44, lineHeight: 1.4 }}>
            Some viewers may find the following video disturbing.<br />Viewer discretion is advised.
          </div>
        </AbsoluteFill>
      )}
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '0 84px', opacity: fade(f, W0, p.intro.frames, 6) }}>
        <div style={{ color: '#fff', fontFamily: HEAD, fontWeight: 700, fontSize: 84, lineHeight: 1.08, textTransform: 'uppercase' }}>{p.intro.title}</div>
        <div style={{ width: 120, height: 8, background: BLUE, borderRadius: 4, margin: '34px 0' }} />
        {p.intro.context
          ? <div style={{ color: 'rgba(255,255,255,.92)', fontFamily: TEXT, fontWeight: 500, fontSize: 44, lineHeight: 1.38 }}>{p.intro.context}</div>
          : p.intro.sub ? <div style={{ color: 'rgba(255,255,255,.85)', fontFamily: TEXT, fontWeight: 500, fontSize: 40 }}>{p.intro.sub}</div> : null}
        {p.intro.context && <div style={{ marginTop: 40, color: BLUE, fontFamily: HEAD, fontWeight: 600, fontSize: 30, letterSpacing: 3 }}>⏸ PAUSE TO READ</div>}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const Banner: React.FC<{ text: string }> = ({ text }) => {
  const f = useCurrentFrame();
  return (
    <div style={{ position: 'absolute', top: 210, left: 50, right: 50, opacity: interpolate(f, [0, 6], [0, 1], { extrapolateRight: 'clamp' }),
      background: 'rgba(6,14,34,.88)', borderLeft: `12px solid ${BLUE}`, borderRadius: 14, padding: '20px 28px',
      color: '#fff', fontFamily: HEAD, fontWeight: 600, fontSize: 46, lineHeight: 1.2, textTransform: 'uppercase', boxShadow: '0 14px 40px rgba(0,0,0,.45)' }}>
      {text}
    </div>
  );
};

const Caption: React.FC<{ text: string; bottom: number }> = ({ text, bottom }) => {
  const f = useCurrentFrame();
  return (
    <div style={{ position: 'absolute', bottom, left: 70, right: 70, textAlign: 'center', opacity: interpolate(f, [0, 4], [0, 1], { extrapolateRight: 'clamp' }) }}>
      <span style={{ background: 'rgba(0,0,0,.75)', color: '#fff', fontFamily: TEXT, fontWeight: 700, fontSize: 46, lineHeight: 1.45, padding: '6px 18px', borderRadius: 10, boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone' }}>{text}</span>
    </div>
  );
};

const num = (i: number) => '①②③'[i] || String(i + 1);

// numbered markers on the frozen frame — small circles, nudged apart so they never overlap
const Markers: React.FC<{ p: ViralProps }> = ({ p }) => {
  const f = useCurrentFrame();
  const r = videoRect(p.videoW, p.videoH, p.fill, p.focusX);
  const placed: { x: number; y: number }[] = [];
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: `rgba(0,0,0,${interpolate(f, [0, 5], [0, 0.3], { extrapolateRight: 'clamp' })})` }} />
      {(p.freeze?.labels || []).map((l, i) => {
        let x = r.left + l.x * r.width, y = r.top + l.y * r.height;
        if (x < 50 || x > W - 50) return null;
        for (const q of placed) if (Math.hypot(q.x - x, q.y - y) < 90) { y = q.y + 90; }
        placed.push({ x, y });
        const k = interpolate(f, [2 + i * 5, 7 + i * 5], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        return (
          <div key={i} style={{ position: 'absolute', left: x - 38, top: y - 38, width: 76, height: 76, borderRadius: 38, background: BLUE, border: '5px solid #fff',
            color: '#fff', fontFamily: HEAD, fontWeight: 700, fontSize: 40, display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: k, transform: `scale(${0.7 + 0.3 * k})`, boxShadow: '0 8px 24px rgba(0,0,0,.5)' }}>{i + 1}</div>
        );
      })}
    </AbsoluteFill>
  );
};

// who's who strip: stills cropped from the footage, numbered to match the markers
const Legend: React.FC<{ p: ViralProps; bottom: number }> = ({ p, bottom }) => {
  const f = useCurrentFrame();
  const outK = interpolate(f, [(p.freeze?.hold || 60) - 6, p.freeze?.hold || 60], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const labels = (p.freeze?.labels || []).slice(0, 3);
  return (
    <div style={{ position: 'absolute', bottom, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 22 }}>
      {labels.map((l, i) => {
        const k = Math.min(outK, interpolate(f, [3 + i * 5, 9 + i * 5], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
        return (
          <div key={i} style={{ width: 300, background: 'rgba(6,14,34,.9)', borderRadius: 16, overflow: 'hidden', opacity: k, transform: `translateY(${(1 - k) * 30}px)`, boxShadow: '0 10px 30px rgba(0,0,0,.5)' }}>
            {l.thumb && <Img src={staticFile(l.thumb)} style={{ width: 300, height: 170, objectFit: 'cover', display: 'block' }} />}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderTop: `5px solid ${BLUE}` }}>
              <span style={{ color: BLUE, fontFamily: HEAD, fontWeight: 700, fontSize: 38 }}>{num(i)}</span>
              <span style={{ color: '#fff', fontFamily: HEAD, fontWeight: 600, fontSize: 32, textTransform: 'uppercase', lineHeight: 1.05 }}>{l.text}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export const Viral: React.FC<ViralProps> = (p) => {
  useFonts();
  const I = p.intro.frames;
  const hasFreeze = !!(p.freeze && p.freeze.labels.length);
  const F = hasFreeze ? Math.min(p.freeze!.at, p.clipFrames - 1) : null;
  const Hd = F !== null ? p.freeze!.hold : 0;
  const after = F !== null ? p.clipFrames - F : 0;
  const caps = [...p.captions].sort((a, b) => a.at - b.at);
  const at = (cf: number) => I + cf + (F !== null && cf >= F ? Hd : 0); // clip frame → composition frame
  const legendBottom = 560, captionBottom = 420;
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      {(F ?? p.clipFrames) > 0 && <Sequence from={I} durationInFrames={F ?? p.clipFrames}><VideoLayer p={p} /></Sequence>}
      {F !== null && <>
        <Sequence from={I + F} durationInFrames={Hd}><Freeze frame={F}><VideoLayer p={p} muted /></Freeze></Sequence>
        {after > 0 && <Sequence from={I + F + Hd} durationInFrames={after}><VideoLayer p={p} startFrom={F} /></Sequence>}
        <Sequence from={I + F} durationInFrames={Hd}><Markers p={p} /></Sequence>
        <Sequence from={I + F} durationInFrames={Hd}><Legend p={p} bottom={legendBottom} /></Sequence>
      </>}
      <Sequence durationInFrames={I}><Intro p={p} /></Sequence>
      <Sequence from={I}><Banner text={p.banner} /></Sequence>
      {caps.map((c, i) => {
        const from = at(c.at), to = i + 1 < caps.length ? at(caps[i + 1].at) : p.durationInFrames;
        return to > from ? <Sequence key={i} from={from} durationInFrames={to - from}><Caption text={c.text} bottom={captionBottom} /></Sequence> : null;
      })}
      <Sequence from={I}>
        <div style={{ position: 'absolute', bottom: 300, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 14 }}>
          <span style={{ background: 'rgba(6,14,34,.8)', color: '#fff', fontFamily: TEXT, fontWeight: 700, fontSize: 28, padding: '8px 16px', borderRadius: 8 }}>🎥 {p.credit}</span>
          <span style={{ background: BLUE, color: '#fff', fontFamily: TEXT, fontWeight: 700, fontSize: 28, padding: '8px 16px', borderRadius: 8 }}>@getnearapp</span>
        </div>
      </Sequence>
    </AbsoluteFill>
  );
};
