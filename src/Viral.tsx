// Viral clip Reel (owner, Oct 3): "only in dade meets kalshi" — a real viral video with light, clean edits:
//   intro (3 s): first frame blurred + "viewer discretion is advised" (if sensitive) + the hook typed in with key clicks
//   play: the video with a situation box up top and short "what's happening" captions at the bottom
//   freeze: at the key moment the video stops, blue labels (SUSPECT, DRIVER…) pop in with arrows and typing sounds
//   credit + @getnearapp at the bottom the whole time
import React from 'react';
import {
  AbsoluteFill, Audio, Freeze, OffthreadVideo, Sequence, staticFile, interpolate, useCurrentFrame,
  delayRender, continueRender,
} from 'remotion';

export type ViralLabel = { text: string; x: number; y: number };
export type ViralProps = {
  durationInFrames: number;
  video: string; videoW: number; videoH: number; clipFrames: number;
  fill?: boolean; focusX?: number; // owner, Oct 3: full 9:16 when the action fits a vertical crop (focusX = where to center it)
  intro: { frames: number; warning: boolean; title: string; sub?: string; context?: string }; // context = the pause-to-read card
  banner: string;
  captions: { at: number; text: string }[]; // at = frame in the clip
  freeze: { at: number; hold: number; labels: ViralLabel[] } | null;
  credit: string;
};

const BLUE = '#1769FF';
const W = 1080, H = 1920;

const useFonts = () => {
  const [handle] = React.useState(() => delayRender('fonts'));
  React.useEffect(() => {
    const faces = ['700', '800', '900'].map(w => new FontFace('Montserrat', `url(${staticFile(`fonts/Montserrat-${w}.woff2`)})`, { weight: w }));
    Promise.all(faces.map(f => f.load().then(x => document.fonts.add(x)).catch(() => {}))).then(() => continueRender(handle));
  }, [handle]);
};

// where the sharp video sits: full width, a bit above center (wide footage) or full screen (vertical footage)
export const videoRect = (vw: number, vh: number, fill = false, focusX = 0.5) => {
  if (fill || vw / vh < 0.8) { // cover the whole 9:16 frame, centered on the action
    const scale = Math.max(W / vw, H / vh);
    const width = Math.round(vw * scale), height = Math.round(vh * scale);
    const left = Math.round(Math.min(0, Math.max(W - width, W / 2 - focusX * width)));
    return { left, top: Math.round((H - height) / 2), width, height };
  }
  const height = Math.round((W * vh) / vw);
  return { left: 0, top: Math.round((H - height) / 2) - 60, width: W, height };
};

const VideoLayer: React.FC<{ p: ViralProps; muted?: boolean; startFrom?: number; blurAll?: boolean }> = ({ p, muted, startFrom = 0, blurAll }) => {
  const r = videoRect(p.videoW, p.videoH, p.fill, p.focusX);
  const src = staticFile(p.video);
  return (
    <AbsoluteFill style={{ background: '#000', filter: blurAll ? 'blur(28px) brightness(0.55)' : undefined }}>
      <OffthreadVideo src={src} startFrom={startFrom} muted style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(40px) brightness(0.45)', transform: 'scale(1.15)' }} />
      <OffthreadVideo src={src} startFrom={startFrom} muted={muted} style={{ position: 'absolute', left: r.left, top: r.top, width: r.width, height: r.height, objectFit: 'cover' }} />
    </AbsoluteFill>
  );
};

const typed = (text: string, frame: number, start: number, perChar = 1.3) => text.slice(0, Math.max(0, Math.floor((frame - start) / perChar)));

// owner, Oct 3: black brand card instead of the blurred frame — wordmark on top, a WARNING card (Near blue) for sensitive
// footage, then the hook typed in
export const warnFrames = (p: ViralProps) => (p.intro.warning ? 75 : 0);
export const CONTEXT_FRAMES = 66; // owner, Oct 3: a quick black card explaining what happened, "pause to read"
const contextAt = (p: ViralProps) => (p.intro.context ? p.intro.frames - CONTEXT_FRAMES : p.intro.frames);
const Intro: React.FC<{ p: ViralProps }> = ({ p }) => {
  const f = useCurrentFrame();
  const W0 = warnFrames(p);
  const out = interpolate(f, [p.intro.frames - 8, p.intro.frames], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const warnOp = W0 ? interpolate(f, [0, 8, W0 - 8, W0], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 0;
  const hookOp = interpolate(f, [W0, W0 + 6], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ background: '#000', opacity: out, fontFamily: 'Montserrat', textAlign: 'center' }}>
      <div style={{ position: 'absolute', top: 300, left: 0, right: 0, display: 'flex', justifyContent: 'center', opacity: interpolate(f, [0, 10], [0, 1], { extrapolateRight: 'clamp' }) }}>
        <span style={{ background: BLUE, color: '#fff', fontWeight: 800, fontStyle: 'italic', fontSize: 46, padding: '12px 34px', borderRadius: 999 }}>getnearapp</span>
      </div>
      {W0 > 0 && f < W0 && (
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '0 90px', opacity: warnOp }}>
          <div style={{ color: BLUE, fontWeight: 900, fontSize: 104, letterSpacing: 6 }}>WARNING</div>
          <div style={{ marginTop: 34, color: '#fff', fontWeight: 700, fontSize: 40, lineHeight: 1.4 }}>
            Some viewers may find the following video disturbing.<br />Viewer discretion is advised.
          </div>
        </AbsoluteFill>
      )}
      {f >= W0 && f < contextAt(p) && (
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '0 80px', opacity: hookOp }}>
          <div style={{ color: '#fff', fontWeight: 900, fontSize: 80, lineHeight: 1.05, textTransform: 'uppercase', letterSpacing: -1, minHeight: 250 }}>
            {typed(p.intro.title, f, W0 + 4, 1)}<span style={{ color: BLUE, opacity: f % 16 < 8 ? 1 : 0 }}>|</span>
          </div>
          {p.intro.sub && (
            <div style={{ marginTop: 34, color: 'rgba(255,255,255,.8)', fontWeight: 700, fontSize: 34, lineHeight: 1.3, opacity: interpolate(f, [W0 + 30, W0 + 45], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>
              {p.intro.sub}
            </div>
          )}
        </AbsoluteFill>
      )}
      {p.intro.context && f >= contextAt(p) && (
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '0 90px', opacity: interpolate(f, [contextAt(p), contextAt(p) + 5], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>
          <div style={{ border: `3px solid ${BLUE}`, color: BLUE, fontWeight: 900, fontSize: 34, letterSpacing: 3, padding: '10px 24px', borderRadius: 12, marginBottom: 40 }}>⏸ PAUSE TO READ</div>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 44, lineHeight: 1.38, textAlign: 'left' }}>{p.intro.context}</div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};

const Banner: React.FC<{ text: string }> = ({ text }) => {
  const f = useCurrentFrame();
  const slide = interpolate(f, [0, 10], [-40, 0], { extrapolateRight: 'clamp' });
  return (
    <div style={{ position: 'absolute', top: 200, left: 50, right: 50, transform: `translateY(${slide}px)`, opacity: interpolate(f, [0, 10], [0, 1], { extrapolateRight: 'clamp' }),
      background: 'rgba(6,14,34,.88)', borderLeft: `12px solid ${BLUE}`, borderRadius: 18, padding: '24px 30px', fontFamily: 'Montserrat',
      color: '#fff', fontWeight: 800, fontSize: 40, lineHeight: 1.22, boxShadow: '0 14px 40px rgba(0,0,0,.45)' }}>
      {typed(text, f, 8, 1)}
    </div>
  );
};

const Caption: React.FC<{ text: string }> = ({ text }) => {
  const f = useCurrentFrame();
  return (
    <div style={{ position: 'absolute', bottom: 420, left: 70, right: 70, textAlign: 'center', fontFamily: 'Montserrat', opacity: interpolate(f, [0, 6], [0, 1], { extrapolateRight: 'clamp' }) }}>
      <span style={{ background: 'rgba(0,0,0,.72)', color: '#fff', fontWeight: 800, fontSize: 42, lineHeight: 1.45, padding: '8px 18px', borderRadius: 12, boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone' }}>{text}</span>
    </div>
  );
};

const Labels: React.FC<{ p: ViralProps }> = ({ p }) => {
  const f = useCurrentFrame();
  const r = videoRect(p.videoW, p.videoH, p.fill, p.focusX);
  const dim = interpolate(f, [0, 8], [0, 0.35], { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ fontFamily: 'Montserrat' }}>
      <AbsoluteFill style={{ background: `rgba(0,0,0,${dim})` }} />
      <div style={{ position: 'absolute', top: Math.max(r.top + 24, 330), right: 40, color: '#fff', fontWeight: 900, fontSize: 30, background: 'rgba(0,0,0,.55)', padding: '8px 16px', borderRadius: 10, opacity: f % 30 < 20 ? 1 : 0.4 }}>❚❚ PAUSED</div>
      {(p.freeze?.labels || []).map((l, i) => {
        const s = 10 + i * 22;
        const k = interpolate(f, [s, s + 8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        const px = r.left + l.x * r.width, py = r.top + l.y * r.height;
        if (px < 40 || px > W - 40 || py < 300 || py > H - 300) return null; // cropped out in full-screen mode
        const above = py - r.top > 260;
        const lx = Math.min(W - 330, Math.max(30, px - 150)), ly = Math.min(H - 520, Math.max(380, above ? py - 230 : py + 130));
        return (
          <React.Fragment key={i}>
            <svg width={W} height={H} style={{ position: 'absolute', inset: 0, opacity: k }}>
              <line x1={px} y1={py} x2={lx + 150} y2={above ? ly + 92 : ly} stroke="#fff" strokeWidth={6} strokeLinecap="round" />
              <circle cx={px} cy={py} r={16 * k} fill={BLUE} stroke="#fff" strokeWidth={5} />
            </svg>
            <div style={{ position: 'absolute', left: lx, top: ly, transform: `scale(${0.8 + 0.2 * k})`, opacity: k, background: BLUE, color: '#fff', fontWeight: 900,
              fontSize: 44, letterSpacing: 1, padding: '16px 28px', borderRadius: 16, boxShadow: '0 10px 30px rgba(0,0,0,.5)', whiteSpace: 'nowrap' }}>
              {typed(l.text.toUpperCase(), f, s, 1.2) || ' '}
            </div>
          </React.Fragment>
        );
      })}
    </AbsoluteFill>
  );
};

// sound cues (frame, file, volume) — exported so the pipeline can sanity-check timing
export const viralCues = (p: ViralProps) => {
  const cues: { at: number; file: string; volume: number }[] = [];
  const keys = (start: number, n: number, per: number) => { for (let i = 0; i < n; i += 2) cues.push({ at: Math.round(start + i * per), file: 'sfx/key.wav', volume: 0.5 }); };
  cues.push({ at: 0, file: 'sfx/boom.wav', volume: 0.45 });
  if (p.intro.warning) cues.push({ at: warnFrames(p), file: 'sfx/whoosh.wav', volume: 0.3 });
  if (p.intro.context) cues.push({ at: contextAt(p), file: 'sfx/pop.wav', volume: 0.4 });
  keys(warnFrames(p) + 4, Math.min(p.intro.title.length, 60), 1);
  const I = p.intro.frames;
  cues.push({ at: I - 4, file: 'sfx/whoosh.wav', volume: 0.4 });
  keys(I + 8, Math.min(p.banner.length, 70), 1);
  if (p.freeze && p.freeze.labels.length) {
    const t = I + p.freeze.at;
    cues.push({ at: t, file: 'sfx/impact.wav', volume: 0.5 });
    p.freeze.labels.forEach((l, i) => { cues.push({ at: t + 10 + i * 22, file: 'sfx/pop.wav', volume: 0.5 }); keys(t + 10 + i * 22, l.text.length, 1.2); });
    cues.push({ at: t + p.freeze.hold - 6, file: 'sfx/whoosh.wav', volume: 0.35 });
  }
  return cues;
};

export const Viral: React.FC<ViralProps> = (p) => {
  useFonts();
  const I = p.intro.frames;
  const F = p.freeze && p.freeze.labels.length ? Math.min(p.freeze.at, p.clipFrames - 1) : null;
  const Hd = F !== null ? p.freeze!.hold : 0;
  const after = F !== null ? p.clipFrames - F : 0;
  const caps = [...p.captions].sort((a, b) => a.at - b.at);
  // clip frame → composition frame
  const at = (cf: number) => I + cf + (F !== null && cf >= F ? Hd : 0);
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <Sequence from={I} durationInFrames={F ?? p.clipFrames}><VideoLayer p={p} /></Sequence>
      {F !== null && <>
        <Sequence from={I + F} durationInFrames={Hd}><Freeze frame={F}><VideoLayer p={p} muted /></Freeze></Sequence>
        <Sequence from={I + F + Hd} durationInFrames={after}><VideoLayer p={p} startFrom={F} /></Sequence>
        <Sequence from={I + F} durationInFrames={Hd}><Labels p={p} /></Sequence>
      </>}
      <Sequence durationInFrames={I}><Intro p={p} /></Sequence>
      <Sequence from={I}><Banner text={p.banner} /></Sequence>
      {caps.map((c, i) => {
        const from = at(c.at), to = i + 1 < caps.length ? at(caps[i + 1].at) : p.durationInFrames;
        return to > from ? <Sequence key={i} from={from} durationInFrames={to - from}><Caption text={c.text} /></Sequence> : null;
      })}
      <Sequence from={I}>
      <div style={{ position: 'absolute', bottom: 300, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 16, fontFamily: 'Montserrat' }}>
        <span style={{ background: 'rgba(6,14,34,.8)', color: '#fff', fontWeight: 800, fontSize: 28, padding: '10px 18px', borderRadius: 10 }}>🎥 {p.credit}</span>
        <span style={{ background: BLUE, color: '#fff', fontWeight: 800, fontSize: 28, padding: '10px 18px', borderRadius: 10 }}>@getnearapp</span>
      </div>
      </Sequence>
      {viralCues(p).map((c, i) => <Sequence key={`a${i}`} from={c.at} durationInFrames={45}><Audio src={staticFile(c.file)} volume={c.volume} /></Sequence>)}
    </AbsoluteFill>
  );
};
