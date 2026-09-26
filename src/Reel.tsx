import React from 'react';
import {
  AbsoluteFill, Audio, OffthreadVideo, Sequence, staticFile, spring, interpolate, delayRender, continueRender,
  useCurrentFrame, useVideoConfig,
} from 'remotion';

export type Word = { text: string; start: number; end: number; scene: number };
export type Scene = {
  kind: 'hook' | 'item' | 'outro';
  rank: number | null;
  overlay: string | string[];
  sub: string | null;
  emoji: string | null;
  emojis: string[] | null;
  alert?: string | null;
  note?: string | null;
  badge?: string | null;
  from: number;
  duration: number;
  video: string;
};
export type ReelProps = {
  fps: number; width: number; height: number; durationInFrames: number;
  narration: string | null; music: string | null;
  captions: Word[]; scenes: Scene[];
};

// Near brand: blue + white on dark glass. Calm motion only (fades/slides, no bounce, no tilt).
const BLUE = '#1769FF';
const YELLOW = BLUE; // legacy names kept for old code paths
const RED = BLUE;
const FONT = "'Montserrat', 'Helvetica Neue', Arial, sans-serif";
const EMOJI = "'Apple Color Emoji', 'Noto Color Emoji', sans-serif";
const GLASS = 'rgba(8,10,16,.72)';
const SHADOW = '0 4px 18px rgba(0,0,0,.55)';
const outline = (_px: number, _color = '#000') => SHADOW;

// eased 0→1 over `dur` frames starting at `delay` (no overshoot)
const ease = (frame: number, delay = 0, dur = 10) =>
  interpolate(frame - delay, [0, dur], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: t => 1 - Math.pow(1 - t, 3) });

// ---------------------------------------------------------------------------

// Bundled fonts so the Mac and the Linux cloud runner render identically
const useBundledFont = () => {
  const [handle] = React.useState(() => delayRender('Loading font'));
  React.useEffect(() => {
    const faces = [
      new FontFace('Montserrat', `url(${staticFile('fonts/Montserrat-700.woff2')})`, { weight: '700' }),
      new FontFace('Montserrat', `url(${staticFile('fonts/Montserrat-800.woff2')})`, { weight: '800' }),
      new FontFace('Montserrat', `url(${staticFile('fonts/Montserrat-900.woff2')})`, { weight: '900' }),
      new FontFace('Montserrat', `url(${staticFile('fonts/Montserrat-800i.woff2')})`, { weight: '800', style: 'italic' }),
    ];
    Promise.all(faces.map(f => f.load().then(x => document.fonts.add(x)).catch(() => {})))
      .then(() => continueRender(handle));
  }, [handle]);
};

export const Reel: React.FC<ReelProps> = ({ narration, music, captions, scenes, durationInFrames }) => {
  useBundledFont();
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {scenes.map((s, i) => (
        <Sequence key={i} from={s.from} durationInFrames={s.duration + (i === scenes.length - 1 ? 30 : 0)}>
          <SceneView scene={s} index={i} />
        </Sequence>
      ))}

      <Captions words={captions} />
      <ProgressBar total={durationInFrames} />
      <Attribution />
      <Brand />

      {narration && <Audio src={staticFile(narration)} />}
      {music && <Audio src={staticFile(music)} volume={0.12} loop />}
      <SoundEffects scenes={scenes} />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------------------

const SceneView: React.FC<{ scene: Scene; index: number }> = ({ scene, index }) => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, scene.duration], [1.02, 1.07]);
  const fadeIn = index === 0 ? 1 : ease(frame, 0, 6);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ transform: `scale(${scale})` }}>
        <OffthreadVideo src={staticFile(scene.video)} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </AbsoluteFill>
      <AbsoluteFill style={{
        background: 'linear-gradient(180deg, rgba(0,0,0,.5) 0%, rgba(0,0,0,0) 32%, rgba(0,0,0,0) 58%, rgba(0,0,0,.55) 100%)',
      }} />
      {scene.kind === 'hook' && <Hook scene={scene} />}
      {scene.kind === 'item' && <Item scene={scene} />}
      {scene.kind === 'outro' && <Outro scene={scene} />}
      <AbsoluteFill style={{ backgroundColor: '#000', opacity: 1 - fadeIn }} />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------------------

const Pop: React.FC<{ delay?: number; children: React.ReactNode; from?: number; rotate?: number; style?: React.CSSProperties }> = (
  { delay = 0, children, style },
) => {
  const frame = useCurrentFrame();
  const e = ease(frame, delay, 10);
  return <div style={{ opacity: e, transform: `translateY(${(1 - e) * 24}px)`, ...style }}>{children}</div>;
};

const Hook: React.FC<{ scene: Scene }> = ({ scene }) => {
  const lines = Array.isArray(scene.overlay) ? scene.overlay : [scene.overlay];
  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', top: 430, left: 60, right: 60, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        {lines.map((line, i) => (
          <Pop key={i} delay={2 + i * 5}>
            <div style={{
              fontFamily: FONT, fontWeight: 900, fontSize: fitSize(line, i === 0 ? 112 : 124, 960), lineHeight: 1.02,
              color: i === lines.length - 1 ? BLUE : '#fff', textShadow: SHADOW, textAlign: 'center', whiteSpace: 'nowrap',
              textTransform: 'uppercase', letterSpacing: -1,
            }}>{line}</div>
          </Pop>
        ))}
        {scene.note && (
          <Pop delay={4 + lines.length * 5}>
            <div style={{ background: GLASS, padding: '10px 22px', borderRadius: 12, marginTop: 8 }}>
              <span style={{ fontFamily: FONT, fontWeight: 700, fontSize: 32, color: '#fff' }}>{scene.note}</span>
            </div>
          </Pop>
        )}
      </div>
    </AbsoluteFill>
  );
};

const Item: React.FC<{ scene: Scene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const e1 = ease(frame, 2, 9), e2 = ease(frame, 7, 9), e3 = ease(frame, 12, 9);
  const badge = scene.rank != null ? `#${scene.rank}` : (scene.badge || '');
  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', top: 200, left: 60, right: 60, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 14 }}>
        {badge && (
          <div style={{ opacity: e1, transform: `translateX(${(1 - e1) * -40}px)`, background: BLUE, padding: '10px 24px', borderRadius: 12, boxShadow: SHADOW }}>
            <span style={{ fontFamily: FONT, fontWeight: 900, fontSize: fitSize(badge, 64, 700), color: '#fff', letterSpacing: 0.5, whiteSpace: 'nowrap' }}>{badge}</span>
          </div>
        )}
        <div style={{ opacity: e2, transform: `translateX(${(1 - e2) * -40}px)` }}>
          <span style={{ fontFamily: FONT, fontWeight: 900, fontSize: fitSize(String(scene.overlay), 104, 900), color: '#fff', textShadow: SHADOW, textTransform: 'uppercase', letterSpacing: -1, lineHeight: 1 }}>{scene.overlay}</span>
        </div>
        {scene.sub && (
          <div style={{ opacity: e3, transform: `translateX(${(1 - e3) * -40}px)`, background: GLASS, padding: '10px 20px', borderRadius: 10, maxWidth: 900 }}>
            <span style={{ fontFamily: FONT, fontWeight: 700, fontSize: 38, color: '#fff', lineHeight: 1.25 }}>{scene.sub}</span>
          </div>
        )}
      </div>
      {scene.alert && <AlertBanner text={scene.alert} at={ALERT_AT} />}
    </AbsoluteFill>
  );
};

// Re-hook banner: slams in mid-scene with a shake so attention snaps back
const ALERT_AT = 40;
const AlertBanner: React.FC<{ text: string; at: number }> = ({ text, at }) => {
  const frame = useCurrentFrame();
  const f = frame - at;
  if (f < 0 || f > 75) return null;
  const o = Math.min(ease(f, 0, 8), interpolate(f, [62, 75], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
  return (
    <div style={{ position: 'absolute', top: 760, left: 60, right: 60, display: 'flex', justifyContent: 'center', opacity: o }}>
      <div style={{ background: BLUE, padding: '14px 36px', borderRadius: 14, boxShadow: SHADOW }}>
        <span style={{ fontFamily: FONT, fontWeight: 900, fontSize: fitSize(text, 72, 900), color: '#fff', whiteSpace: 'nowrap' }}>{text}</span>
      </div>
    </div>
  );
};

const Outro: React.FC<{ scene: Scene }> = ({ scene }) => (
  <AbsoluteFill style={{ alignItems: 'center' }}>
    <div style={{ position: 'absolute', top: 440, left: 60, right: 60, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22 }}>
      <Pop delay={2}>
        <div style={{ fontFamily: FONT, fontWeight: 900, fontSize: 88, color: '#fff', textShadow: SHADOW, textAlign: 'center', lineHeight: 1.08, textTransform: 'uppercase' }}>
          {scene.overlay}
        </div>
      </Pop>
      <Pop delay={9}>
        <div style={{ background: BLUE, padding: '14px 32px', borderRadius: 14, boxShadow: SHADOW }}>
          <span style={{ fontFamily: FONT, fontWeight: 800, fontStyle: 'italic', fontSize: 50, color: '#fff' }}>follow @getnearapp</span>
        </div>
      </Pop>
    </div>
  </AbsoluteFill>
);

function fitSize(text: string, max: number, width: number) {
  // rough width estimate for Montserrat Black caps: ~0.74em per character
  return Math.min(max, Math.floor(width / (text.length * 0.74)));
}

// ---------------------------------------------------------------------------

const Captions: React.FC<{ words: Word[] }> = ({ words }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const groups = React.useMemo(() => chunk(words), [words]);
  const gi = groups.findIndex((g, i) => t >= g.start && t < (groups[i + 1] ? Math.min(groups[i + 1].start, g.end + 0.4) : g.end + 0.4));
  if (gi < 0) return null;
  const g = groups[gi];
  const e = ease(frame, Math.round(g.start * fps), 4);
  return (
    <AbsoluteFill>
      <div style={{
        position: 'absolute', top: 1200, left: 60, right: 60, display: 'flex', flexWrap: 'wrap', justifyContent: 'center',
        gap: '4px 24px', opacity: e, transform: `translateY(${(1 - e) * 10}px)`,
      }}>
        {g.words.map((w, i) => {
          const active = t >= w.start && t < w.end + 0.05;
          return (
            <span key={i} style={{
              fontFamily: FONT, fontWeight: 900, fontSize: 76, textTransform: 'uppercase', lineHeight: 1.12,
              color: active ? BLUE : '#fff', textShadow: '0 3px 12px rgba(0,0,0,.85), 0 0 2px rgba(0,0,0,.9)',
            }}>{w.text}</span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

function chunk(words: Word[]) {
  const groups: { words: Word[]; start: number; end: number }[] = [];
  let cur: Word[] = [];
  const flush = () => { if (cur.length) groups.push({ words: cur, start: cur[0].start, end: cur[cur.length - 1].end }); cur = []; };
  words.forEach((w, i) => {
    const prev = words[i - 1];
    const chars = cur.reduce((n, c) => n + c.text.length + 1, 0) + w.text.length;
    if (cur.length && (cur.length >= 3 || w.scene !== prev.scene || /[.,!?…]$/.test(prev.text) || chars > 20)) flush();
    cur.push(w);
  });
  flush();
  return groups;
}

// ---------------------------------------------------------------------------

const ProgressBar: React.FC<{ total: number }> = ({ total }) => {
  const frame = useCurrentFrame();
  return <div style={{ position: 'absolute', top: 0, left: 0, height: 8, width: `${(frame / total) * 100}%`, background: BLUE }} />;
};

const Brand: React.FC = () => (
  <div style={{ position: 'absolute', bottom: 150, left: 0, right: 0, display: 'flex', justifyContent: 'center', opacity: 0.9 }}>
    <span style={{ fontFamily: FONT, fontWeight: 800, fontStyle: 'italic', fontSize: 34, color: '#fff', textShadow: SHADOW }}>getnearapp</span>
  </div>
);

const Attribution: React.FC = () => (
  <div style={{ position: 'absolute', top: 24, left: 26, display: 'flex', alignItems: 'baseline', gap: 10, opacity: 0.85 }}>
    <span style={{ fontFamily: "'Helvetica Neue', Arial, sans-serif", fontWeight: 600, fontSize: 30, color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,.8)' }}>Google</span>
    <span style={{ fontFamily: "'Helvetica Neue', Arial, sans-serif", fontSize: 20, color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,.8)' }}>Imagery ©2026 Google</span>
  </div>
);

// ---------------------------------------------------------------------------

const SoundEffects: React.FC<{ scenes: Scene[] }> = ({ scenes }) => {
  // subtle: whoosh into every scene, soft ticks as each label lands, a light riser into the last item, chime on the outro
  const cues: { at: number; file: string; volume: number }[] = [];
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
  return (
    <>
      {cues.map((c, i) => (
        <Sequence key={i} from={c.at} durationInFrames={60} layout="none">
          <Audio src={staticFile(c.file)} volume={c.volume} />
        </Sequence>
      ))}
    </>
  );
};
