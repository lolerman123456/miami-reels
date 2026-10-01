import React from 'react';
import {
  AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, staticFile, spring, interpolate, delayRender, continueRender,
  useCurrentFrame, useVideoConfig,
} from 'remotion';
// @ts-ignore plain JS module shared with the node pipeline
import { sfxCues, statAt } from './cues.js';
import { Screen, ScreenSpec } from './Screen';

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
  image?: { file: string; path: { x: number; y: number; zoom: number; at?: number }[] | null; label: string } | null; // AI render instead of the map
  photos?: { files: { file: string; credit: string }[]; at: number; style?: string | null } | null; // real photos after the 3D orbit ('fast' = TikTok punch cuts)
  reveal?: { at: number; text: string; label?: string | null } | null; // guess-it game: countdown, then the answer pops
  screen?: ScreenSpec | null; // how-to walkthrough: a browser window with typing, clicks and results
  stats?: { value: string; label: string }[] | null; // big numbers that count up while the narrator says them
  source?: string | null; // where the facts come from, shown small
  hit?: string | null;
  shotType?: string | null;
  sfx?: string | null;
  videoOffset?: number; // parallel renders: this scene's clip starts at this scene frame
  from: number;
  duration: number;
  video: string;
};
export type ReelProps = {
  fps: number; width: number; height: number; durationInFrames: number;
  narration: string | null; music: string | null;
  captions: Word[]; scenes: Scene[];
  noAudio?: boolean; // parallel renders are silent; audio is mixed afterwards
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

export const Reel: React.FC<ReelProps> = ({ narration, music, captions, scenes, durationInFrames, noAudio }) => {
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

      {!noAudio && narration && <Audio src={staticFile(narration)} />}
      {!noAudio && music && <Audio src={staticFile(music)} volume={0.12} loop />}
      {!noAudio && <SoundEffects scenes={scenes} />}
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------------------

const SceneView: React.FC<{ scene: Scene; index: number }> = ({ scene, index }) => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, scene.duration], [1.02, 1.07]);
  return (
    <AbsoluteFill>
      {scene.image ? <ImageView scene={scene} /> : (
        <AbsoluteFill style={{ transform: `scale(${scale})` }}>
          <Sequence from={scene.videoOffset ?? 0} layout="none">
            <OffthreadVideo src={staticFile(scene.video)} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </Sequence>
        </AbsoluteFill>
      )}
      {scene.photos && !scene.image && <PhotoReel scene={scene} />}
      <AbsoluteFill style={{
        background: scene.image ? 'linear-gradient(180deg, rgba(0,0,0,.18) 0%, rgba(0,0,0,0) 25%, rgba(0,0,0,0) 80%, rgba(0,0,0,.2) 100%)'
          : 'linear-gradient(180deg, rgba(0,0,0,.5) 0%, rgba(0,0,0,0) 32%, rgba(0,0,0,0) 58%, rgba(0,0,0,.55) 100%)',
      }} />
      {scene.kind === 'hook' && <Hook scene={scene} />}
      {scene.kind === 'item' && <Item scene={scene} />}
      {scene.kind === 'outro' && <Outro scene={scene} />}
    </AbsoluteFill>
  );
};

// Real photos of the place after the 3D orbit: each one slowly pushes in while drifting a different way, with soft
// crossfades between them and between the map and the first photo. Calm motion only (no tilt/bounce), credit shown small.
const PhotoReel: React.FC<{ scene: Scene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { files, at, style } = scene.photos!;
  if (style === 'fast') return <FastPhotos scene={scene} />;
  const start = Math.round(scene.duration * at), X = 10;
  const each = Math.max(24, (scene.duration - start) / files.length);
  const DRIFT = [[-3, -2], [3, -1.5], [-2, 2], [2.5, 2]];
  return (
    <AbsoluteFill>
      {files.map((p, k) => {
        const t0 = start + k * each, t1 = t0 + each + X;
        if (frame < t0 - 1 || frame > t1 + X) return null;
        const inE = ease(frame, t0, X + 4), outE = k === files.length - 1 ? 1 : 1 - ease(frame, t0 + each, X);
        const u = Math.min(1, Math.max(0, (frame - t0) / (each + X)));
        const e = (1 - Math.cos(Math.PI * u)) / 2;
        const [dx, dy] = DRIFT[k % DRIFT.length];
        return (
          <AbsoluteFill key={k} style={{ opacity: inE * outE, overflow: 'hidden', background: '#000' }}>
            <Img src={staticFile(p.file)} style={{
              width: '100%', height: '100%', objectFit: 'cover', filter: 'saturate(1.18) contrast(1.06) brightness(1.04)',
              transform: `scale(${1.08 + 0.16 * e}) translate(${dx * e}%, ${dy * e}%)`,
            }} />
            <div style={{ position: 'absolute', top: 1080, right: 40, background: 'rgba(8,10,16,.55)', padding: '5px 12px', borderRadius: 8, maxWidth: 520 }}>
              <span style={{ fontFamily: FONT, fontWeight: 700, fontSize: 18, color: '#fff' }}>Photo: {p.credit}</span>
            </div>
          </AbsoluteFill>
        );
      })}
    </AbsoluteFill>
  );
};

// TikTok style: hard cuts between photos, each one punches in (quick zoom) with a white flash, then keeps drifting.
const FastPhotos: React.FC<{ scene: Scene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { files, at } = scene.photos!;
  const start = Math.round(scene.duration * at);
  const each = Math.max(18, (scene.duration - start) / files.length);
  const k = Math.min(files.length - 1, Math.floor(Math.max(0, frame - start) / each));
  if (frame < start) return null;
  const t = frame - start - k * each;
  const punch = interpolate(t, [0, 8], [1.32, 1.08], { extrapolateRight: 'clamp', easing: x => 1 - Math.pow(1 - x, 3) });
  const drift = interpolate(t, [8, each], [0, 0.06], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const flash = interpolate(t, [0, 5], [0.55, 0], { extrapolateRight: 'clamp' });
  const dir = k % 2 ? 1 : -1;
  const p = files[k];
  return (
    <AbsoluteFill style={{ background: '#000', overflow: 'hidden' }}>
      <Img src={staticFile(p.file)} style={{
        width: '100%', height: '100%', objectFit: 'cover', filter: 'saturate(1.25) contrast(1.08) brightness(1.05)',
        transform: `scale(${punch + drift}) translate(${dir * drift * 30}%, 0)`,
      }} />
      <AbsoluteFill style={{ background: '#fff', opacity: flash }} />
      <div style={{ position: 'absolute', top: 1080, right: 40, background: 'rgba(8,10,16,.55)', padding: '5px 12px', borderRadius: 8, maxWidth: 520 }}>
        <span style={{ fontFamily: FONT, fontWeight: 700, fontSize: 18, color: '#fff' }}>Photo: {p.credit}</span>
      </div>
    </AbsoluteFill>
  );
};

// Guess-it game: "GUESS 🤔", then 3·2·1 in the last 1.5 s, then the answer slams in with a flash.
const Reveal: React.FC<{ scene: Scene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const r = scene.reveal!;
  const at = Math.round(scene.duration * r.at);
  const before = at - frame;
  if (before > 0) {
    const n = Math.ceil(before / 15);
    const counting = n <= 3;
    const pulse = counting ? interpolate((before - 1) % 15, [8, 14], [1, 1.35], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 1;
    return (
      <div style={{ position: 'absolute', top: 700, left: 0, right: 0, display: 'flex', justifyContent: 'center', opacity: ease(frame, 4, 8) }}>
        <div style={{ background: counting ? BLUE : GLASS, borderRadius: 999, padding: counting ? '10px 64px' : '16px 40px', boxShadow: SHADOW, transform: `scale(${pulse})` }}>
          <span style={{ fontFamily: FONT, fontWeight: 900, fontSize: counting ? 150 : 64, color: '#fff' }}>{counting ? n : 'GUESS 🤔'}</span>
        </div>
      </div>
    );
  }
  const e = ease(frame, at, 6);
  const flash = interpolate(frame - at, [0, 6], [0.7, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <>
      <AbsoluteFill style={{ background: '#fff', opacity: flash }} />
      <div style={{ position: 'absolute', top: 660, left: 40, right: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        <div style={{ background: BLUE, borderRadius: 24, padding: '14px 44px', boxShadow: SHADOW, transform: `scale(${1.3 - 0.3 * e})`, opacity: e }}>
          <span style={{ fontFamily: FONT, fontWeight: 900, fontSize: fitSize(r.text, 150, 960), color: '#fff', whiteSpace: 'nowrap' }}>{r.text}</span>
        </div>
        {r.label && <div style={{ background: GLASS, borderRadius: 12, padding: '8px 22px', opacity: e }}>
          <span style={{ fontFamily: FONT, fontWeight: 800, fontSize: 36, color: '#fff' }}>{r.label}</span>
        </div>}
      </div>
    </>
  );
};

// Render on white: the camera starts on the whole building and glides from one focus spot to the next
const ImageView: React.FC<{ scene: Scene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const img = scene.image!;
  const path = img.path && img.path.length ? img.path : [{ x: 0.5, y: 0.5, zoom: 1, at: 0 }, { x: 0.5, y: 0.45, zoom: 1.4, at: 30 }];
  // hold on each spot until the narrator names the next one, then glide there in ~0.4 s (starting just before the word)
  const GLIDE = 12, LEAD = 6;
  const times = path.map((p, k) => (k === 0 ? 0 : Math.max(0, (p.at ?? (k * scene.duration) / path.length) - LEAD)));
  let k = 0;
  while (k + 1 < path.length && frame >= times[k + 1]) k++;
  const a = path[Math.max(0, k - 1)], b = path[k];
  const u = k === 0 ? 1 : Math.min(1, (frame - times[k]) / GLIDE);
  const e = (1 - Math.cos(Math.PI * u)) / 2;
  const since = frame - times[k] - GLIDE;
  const drift = since > 0 ? Math.min(0.06, since * 0.0015) : 0; // slow push while holding
  const x = a.x + (b.x - a.x) * e, y = a.y + (b.y - a.y) * e, z = (a.zoom + (b.zoom - a.zoom) * e) * (1 + drift);
  // the 1024x1536 render fills the 1080x1920 frame; move the focus point to the middle of the screen
  const fade = ease(frame, 0, 8);
  return (
    <AbsoluteFill style={{ background: '#fff', opacity: fade }}>
      <AbsoluteFill style={{ transform: `translate(${(0.5 - x) * 100}%, ${(0.4 - y) * 100}%) scale(${z})`, transformOrigin: `${x * 100}% ${y * 100}%` }}>
        <Img src={staticFile(img.file)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </AbsoluteFill>
      <div style={{ position: 'absolute', top: 1080, right: 40, background: 'rgba(8,10,16,.55)', padding: '6px 14px', borderRadius: 8 }}>
        <span style={{ fontFamily: FONT, fontWeight: 700, fontSize: 22, color: '#fff', letterSpacing: 1 }}>{img.label}</span>
      </div>
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
              fontFamily: FONT, fontWeight: 900, fontSize: fitSize(line, i === 0 ? 104 : 112, 900), lineHeight: 1.02,
              color: '#fff', textAlign: 'center', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: -1,
              background: i === lines.length - 1 ? BLUE : GLASS, padding: '10px 26px 14px', borderRadius: 16, boxShadow: SHADOW,
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
  const badge = scene.badge || '';
  // a how-to screen takes over the frame: the place header fades out as the browser window slides in
  const hide = scene.screen ? 1 - ease(frame, Math.round(scene.duration * scene.screen.at) - 6, 8) : 1;
  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', opacity: hide, top: 200, left: 60, right: 60, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 14 }}>
        {(badge || scene.rank != null) && (
          <div style={{ opacity: e1, transform: `translateX(${(1 - e1) * -40}px)`, display: 'flex', gap: 12 }}>
            {scene.rank != null && (
              <div style={{ background: '#fff', padding: '10px 22px', borderRadius: 12, boxShadow: SHADOW }}>
                <span style={{ fontFamily: FONT, fontWeight: 900, fontSize: 64, color: BLUE, whiteSpace: 'nowrap' }}>#{scene.rank}</span>
              </div>
            )}
            {badge && (
              <div style={{ background: BLUE, padding: '10px 24px', borderRadius: 12, boxShadow: SHADOW }}>
                <span style={{ fontFamily: FONT, fontWeight: 900, fontSize: fitSize(badge, 64, scene.rank != null ? 560 : 700), color: '#fff', letterSpacing: 0.5, whiteSpace: 'nowrap' }}>{badge}</span>
              </div>
            )}
          </div>
        )}
        <div style={{ opacity: e2, transform: `translateX(${(1 - e2) * -40}px)`, ...(scene.image ? { background: GLASS, padding: '8px 20px 12px', borderRadius: 14 } : {}) }}>
          <span style={{ fontFamily: FONT, fontWeight: 900, fontSize: fitSize(String(scene.overlay), 104, 900), color: '#fff', textShadow: SHADOW, textTransform: 'uppercase', letterSpacing: -1, lineHeight: 1 }}>{scene.overlay}</span>
        </div>
        {scene.sub && (
          <div style={{ opacity: e3, transform: `translateX(${(1 - e3) * -40}px)`, background: GLASS, padding: '10px 20px', borderRadius: 10, maxWidth: 900 }}>
            <span style={{ fontFamily: FONT, fontWeight: 700, fontSize: 38, color: '#fff', lineHeight: 1.25 }}>{scene.sub}</span>
          </div>
        )}
      </div>
      {scene.stats && scene.stats.length > 0 && <Stats scene={scene} />}
      {scene.source && <SourceTag text={scene.source} />}
      {scene.alert && <AlertBanner text={scene.alert} at={ALERT_AT} />}
      {scene.reveal && <Reveal scene={scene} />}
      {scene.screen && <Screen spec={scene.screen} duration={scene.duration} />}
    </AbsoluteFill>
  );
};

// Stat cards: the number counts up from zero when it appears ("$110M", "1,100 TONS", "+61%"); years just fade in.
const Stats: React.FC<{ scene: Scene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const stats = (scene.stats || []).slice(0, 2);
  return (
    <div style={{ position: 'absolute', top: 890, left: 60, right: 60, display: 'flex', gap: 18 }}>
      {stats.map((st, i) => {
        const at = statAt(scene, i);
        const e = ease(frame, at, 9);
        const c = ease(frame, at, 20);
        return (
          <div key={i} style={{ opacity: e, transform: `translateY(${(1 - e) * 30}px)`, flex: 1, minWidth: 0,
            background: GLASS, borderRadius: 16, padding: '14px 22px 16px', borderLeft: `10px solid ${BLUE}`, boxShadow: SHADOW }}>
            <div style={{ fontFamily: FONT, fontWeight: 900, fontSize: fitSize(st.value, stats.length > 1 ? 80 : 96, stats.length > 1 ? 330 : 760), color: '#fff', lineHeight: 1.05, whiteSpace: 'nowrap' }}>
              {countUp(st.value, c)}
            </div>
            <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 28, color: '#BFD4FF', textTransform: 'uppercase', marginTop: 4, lineHeight: 1.2 }}>{st.label}</div>
          </div>
        );
      })}
    </div>
  );
};

function countUp(value: string, p: number) {
  const m = value.match(/\d[\d,]*(\.\d+)?/);
  if (!m || p >= 1) return value;
  const raw = m[0], n = parseFloat(raw.replace(/,/g, ''));
  const isYear = /^(1[5-9]|20)\d\d$/.test(raw);
  if (!isFinite(n) || isYear) return value;
  const dec = m[1] ? m[1].length - 1 : 0;
  const cur = n * p;
  const txt = raw.includes(',') || n >= 10000
    ? cur.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })
    : cur.toFixed(dec);
  return value.slice(0, m.index) + txt + value.slice((m.index || 0) + raw.length);
}

const SourceTag: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const e = ease(frame, 10, 10);
  return (
    <div style={{ position: 'absolute', bottom: 205, left: 60, right: 60, display: 'flex', opacity: e * 0.92 }}>
      <div style={{ background: 'rgba(8,10,16,.6)', padding: '6px 14px', borderRadius: 8, maxWidth: 900 }}>
        <span style={{ fontFamily: FONT, fontWeight: 700, fontSize: 24, color: '#fff', letterSpacing: 0.5 }}>SOURCE: {text.toUpperCase()}</span>
      </div>
    </div>
  );
};

// Re-hook banner
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
        position: 'absolute', top: 1190, left: 0, right: 0, display: 'flex', justifyContent: 'center',
        opacity: e, transform: `translateY(${(1 - e) * 10}px)`,
      }}>
       <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '2px 22px', maxWidth: 940,
         background: 'rgba(8,10,16,.66)', padding: '10px 26px 14px', borderRadius: 18 }}>
        {g.words.map((w, i) => {
          const active = t >= w.start && t < w.end + 0.05;
          return (
            <span key={i} style={{
              fontFamily: FONT, fontWeight: 900, fontSize: 76, textTransform: 'uppercase', lineHeight: 1.12,
              color: active ? '#4D8DFF' : '#fff', textShadow: '0 2px 6px rgba(0,0,0,.6)',
            }}>{w.text}</span>
          );
        })}
       </div>
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
  const cues: { at: number; file: string; volume: number }[] = sfxCues(scenes);
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
