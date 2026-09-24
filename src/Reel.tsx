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
  from: number;
  duration: number;
  video: string;
};
export type ReelProps = {
  fps: number; width: number; height: number; durationInFrames: number;
  narration: string | null; music: string | null;
  captions: Word[]; scenes: Scene[];
};

const YELLOW = '#FFE14D';
const RED = '#FF3B3B';
const FONT = "'Archivo Black', 'Arial Black', Impact, sans-serif";
const EMOJI = "'Apple Color Emoji', 'Noto Color Emoji', sans-serif";

const outline = (px: number, color = '#000') => {
  const s: string[] = [];
  for (let a = 0; a < 16; a++) {
    const r = (a / 16) * Math.PI * 2;
    s.push(`${(Math.cos(r) * px).toFixed(1)}px ${(Math.sin(r) * px).toFixed(1)}px 0 ${color}`);
  }
  s.push(`0 ${px + 6}px ${px * 2}px rgba(0,0,0,.55)`);
  return s.join(',');
};

// ---------------------------------------------------------------------------

// Bundled font so the Mac and the Linux cloud runner render identically
const useBundledFont = () => {
  const [handle] = React.useState(() => delayRender('Loading font'));
  React.useEffect(() => {
    new FontFace('Archivo Black', `url(${staticFile('fonts/ArchivoBlack-Regular.ttf')})`).load()
      .then(f => { document.fonts.add(f); continueRender(handle); })
      .catch(() => continueRender(handle));
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

      {narration && <Audio src={staticFile(narration)} />}
      {music && <Audio src={staticFile(music)} volume={0.12} loop />}
      <SoundEffects scenes={scenes} />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------------------

const SceneView: React.FC<{ scene: Scene; index: number }> = ({ scene, index }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const punch = spring({ frame, fps, config: { damping: 14, stiffness: 120 } });
  const scale = interpolate(punch, [0, 1], [1.14, 1]) * interpolate(frame, [0, scene.duration], [1, 1.05]);

  // hook + #1 get a camera shake on entry
  const shakeAmt = (scene.kind === 'hook' || scene.rank === 1) ? interpolate(frame, [0, 14], [22, 0], { extrapolateRight: 'clamp' }) : 0;
  const sx = Math.sin(frame * 2.3) * shakeAmt, sy = Math.cos(frame * 3.1) * shakeAmt;

  const flash = index === 0 ? 0 : interpolate(frame, [0, 6], [0.85, 0], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ transform: `translate(${sx}px, ${sy}px) scale(${scale})` }}>
        <OffthreadVideo src={staticFile(scene.video)} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </AbsoluteFill>
      <AbsoluteFill style={{
        background: 'linear-gradient(180deg, rgba(0,0,0,.55) 0%, rgba(0,0,0,0) 38%, rgba(0,0,0,0) 55%, rgba(0,0,0,.55) 100%)',
      }} />
      {scene.kind === 'hook' && <Hook scene={scene} />}
      {scene.kind === 'item' && <Item scene={scene} />}
      {scene.kind === 'outro' && <Outro scene={scene} />}
      <AbsoluteFill style={{ backgroundColor: '#fff', opacity: flash }} />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------------------

const Pop: React.FC<{ delay?: number; children: React.ReactNode; from?: number; rotate?: number; style?: React.CSSProperties }> = (
  { delay = 0, children, from = 0, rotate = 0, style },
) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 9, stiffness: 180, mass: 0.7 } });
  return (
    <div style={{
      transform: `scale(${interpolate(s, [0, 1], [from, 1])}) rotate(${interpolate(s, [0, 1], [rotate, 0])}deg)`,
      opacity: frame < delay ? 0 : 1, ...style,
    }}>{children}</div>
  );
};

const Bob: React.FC<{ children: React.ReactNode; speed?: number; amp?: number; phase?: number }> = ({ children, speed = 0.12, amp = 14, phase = 0 }) => {
  const frame = useCurrentFrame();
  return <div style={{ transform: `translateY(${Math.sin(frame * speed + phase) * amp}px) rotate(${Math.sin(frame * speed * 0.7 + phase) * 6}deg)` }}>{children}</div>;
};

const Hook: React.FC<{ scene: Scene }> = ({ scene }) => {
  const lines = Array.isArray(scene.overlay) ? scene.overlay : [scene.overlay];
  const emojis = scene.emojis ?? [];
  const spots = [
    { left: 70, top: 190, r: -18 }, { left: 800, top: 170, r: 16 },
    { left: 90, top: 870, r: 12 }, { left: 790, top: 890, r: -14 },
  ];
  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', top: 470, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
        {lines.map((line, i) => (
          <Pop key={i} delay={3 + i * 7} rotate={i % 2 ? 8 : -8}>
            <div style={{
              fontFamily: FONT, fontSize: fitSize(line, i === 0 ? 124 : 100, 960), lineHeight: 1, color: i === 0 ? '#fff' : YELLOW,
              textShadow: outline(9), textAlign: 'center', whiteSpace: 'nowrap', letterSpacing: -1,
            }}>{line}</div>
          </Pop>
        ))}
      </div>
      {emojis.slice(0, 4).map((e, i) => (
        <div key={i} style={{ position: 'absolute', left: spots[i].left, top: spots[i].top }}>
          <Pop delay={10 + i * 4} rotate={spots[i].r * 3}>
            <Bob phase={i * 1.7}>
              <div style={{ fontFamily: EMOJI, fontSize: 190, transform: `rotate(${spots[i].r}deg)`, filter: 'drop-shadow(0 12px 18px rgba(0,0,0,.5))' }}>{e}</div>
            </Bob>
          </Pop>
        </div>
      ))}
    </AbsoluteFill>
  );
};

const Item: React.FC<{ scene: Scene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const top = scene.rank === 1;
  const slam = spring({ frame, fps, config: { damping: 11, stiffness: 150 } });
  const nameIn = spring({ frame: frame - 5, fps, config: { damping: 13, stiffness: 140 } });

  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', top: 210, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 26 }}>
          <div style={{
            transform: `scale(${interpolate(slam, [0, 1], [3.2, 1])}) rotate(${interpolate(slam, [0, 1], [-25, -6])}deg)`,
            opacity: interpolate(slam, [0, 0.2], [0, 1], { extrapolateRight: 'clamp' }),
            width: 230, height: 230, borderRadius: 40, background: top ? RED : YELLOW,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 18px 40px rgba(0,0,0,.5)', border: '8px solid #000',
          }}>
            <span style={{ fontFamily: FONT, fontSize: 150, color: top ? '#fff' : '#000', letterSpacing: -6, marginLeft: -8 }}>#{scene.rank}</span>
          </div>
          {scene.emoji && (
            <Pop delay={9} rotate={40}>
              <Bob><div style={{ fontFamily: EMOJI, fontSize: top ? 210 : 180, filter: 'drop-shadow(0 12px 18px rgba(0,0,0,.5))' }}>{scene.emoji}</div></Bob>
            </Pop>
          )}
        </div>

        <div style={{
          marginTop: 36, transform: `translateX(${interpolate(nameIn, [0, 1], [-1100, 0])}px) rotate(-2deg)`,
          background: '#000', padding: '14px 38px 20px', borderRadius: 18,
        }}>
          <span style={{ fontFamily: FONT, fontSize: fitSize(String(scene.overlay), 118, 780), color: '#fff', letterSpacing: -1 }}>{scene.overlay}</span>
        </div>

        {scene.sub && (
          <Pop delay={14} from={0.3} style={{ marginTop: 22 }}>
            <div style={{ background: top ? YELLOW : RED, padding: '12px 28px', borderRadius: 999, transform: 'rotate(2deg)', border: '5px solid #000' }}>
              <span style={{ fontFamily: FONT, fontSize: 52, color: top ? '#000' : '#fff' }}>{scene.sub}</span>
            </div>
          </Pop>
        )}
      </div>
    </AbsoluteFill>
  );
};

const Outro: React.FC<{ scene: Scene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ alignItems: 'center' }}>
      <div style={{ position: 'absolute', top: 420, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
        <Pop delay={2} rotate={-6}>
          <div style={{ fontFamily: FONT, fontSize: 104, color: '#fff', textShadow: outline(9), textAlign: 'center', padding: '0 50px', lineHeight: 1.05 }}>
            {scene.overlay}
          </div>
        </Pop>
        {scene.sub && (
          <Pop delay={10}>
            <div style={{ background: YELLOW, padding: '12px 30px', borderRadius: 999, border: '5px solid #000' }}>
              <span style={{ fontFamily: FONT, fontSize: 54, color: '#000' }}>{scene.sub}</span>
            </div>
          </Pop>
        )}
        <div style={{ fontFamily: EMOJI, fontSize: 170, transform: `translateY(${Math.abs(Math.sin(frame * 0.2)) * 40}px)` }}>👇</div>
      </div>
    </AbsoluteFill>
  );
};

function fitSize(text: string, max: number, width: number) {
  // rough width estimate for a heavy font: ~0.72em per character
  return Math.min(max, Math.floor(width / (text.length * 0.72)));
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
  const enter = spring({ frame: frame - Math.round(g.start * fps), fps, config: { damping: 12, stiffness: 200 } });

  return (
    <AbsoluteFill>
      <div style={{
        position: 'absolute', top: 1180, left: 60, right: 60, display: 'flex', flexWrap: 'wrap', justifyContent: 'center',
        gap: '6px 34px', transform: `scale(${interpolate(enter, [0, 1], [0.7, 1])})`,
      }}>
        {g.words.map((w, i) => {
          const active = t >= w.start && t < w.end + 0.05;
          const said = t >= w.start;
          return (
            <span key={i} style={{
              fontFamily: FONT, fontSize: 84, textTransform: 'uppercase', lineHeight: 1.1,
              color: active ? YELLOW : '#fff', opacity: said ? 1 : 0.9,
              textShadow: outline(7), display: 'inline-block', transformOrigin: 'center bottom',
              transform: `scale(${active ? 1.1 : 1}) rotate(${active ? -2 : 0}deg)`,
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
  return (
    <div style={{ position: 'absolute', top: 0, left: 0, height: 10, width: `${(frame / total) * 100}%`, background: YELLOW, boxShadow: '0 0 12px rgba(255,225,77,.8)' }} />
  );
};

const Attribution: React.FC = () => (
  <div style={{ position: 'absolute', top: 24, left: 26, display: 'flex', alignItems: 'baseline', gap: 10, opacity: 0.85 }}>
    <span style={{ fontFamily: "'Helvetica Neue', Arial, sans-serif", fontWeight: 600, fontSize: 30, color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,.8)' }}>Google</span>
    <span style={{ fontFamily: "'Helvetica Neue', Arial, sans-serif", fontSize: 20, color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,.8)' }}>Imagery ©2026 Google</span>
  </div>
);

// ---------------------------------------------------------------------------

const SoundEffects: React.FC<{ scenes: Scene[] }> = ({ scenes }) => {
  const cues: { at: number; file: string; volume: number }[] = [];
  scenes.forEach((s, i) => {
    if (s.kind === 'hook') {
      cues.push({ at: 0, file: 'sfx/boom.wav', volume: 0.9 });
      cues.push({ at: 4, file: 'sfx/pop.wav', volume: 0.6 });
      cues.push({ at: 11, file: 'sfx/pop.wav', volume: 0.6 });
    } else {
      cues.push({ at: Math.max(0, s.from - 9), file: 'sfx/whoosh.wav', volume: 0.55 });
    }
    if (s.kind === 'item') {
      cues.push({ at: s.from + 2, file: s.rank === 1 ? 'sfx/boom.wav' : 'sfx/pop.wav', volume: s.rank === 1 ? 0.9 : 0.6 });
      cues.push({ at: s.from + 14, file: 'sfx/pop.wav', volume: 0.4 });
    }
    if (s.rank === 1) cues.push({ at: Math.max(0, s.from - 45), file: 'sfx/riser.wav', volume: 0.45 });
    if (s.kind === 'outro') cues.push({ at: s.from + 3, file: 'sfx/ding.wav', volume: 0.5 });
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
