// NEAR "text story" Reels (owner, Oct 6): an animated iMessage group chat that tells a tiny story ending on NEAR —
// bubbles pop in with iMessage sounds, typing dots, tapbacks, a camera that punches in on each message and zooms into the
// NEAR screenshot, and a loop back to the first message. Rendered by pipeline/chatreel.mjs (props from a story JSON).
import React from 'react';
import {
  AbsoluteFill, Audio, Img, Sequence, continueRender, delayRender, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig,
} from 'remotion';

export type ChatMsg = {
  from: string;            // 'me' = the sender (blue, right); anything else = a friend's name (gray, left)
  text?: string;
  card?: boolean;          // the NEAR crossed-paths screenshot (mock, or `image` when we have a real screenshot)
  image?: string;          // file in the public dir (a real NEAR screenshot)
  at: number;              // frame it lands
  react?: { emoji: string; at: number };
};
export type ChatProps = {
  durationInFrames: number;
  chatName: string;
  messages: ChatMsg[];
  cardPlace?: string; cardTime?: string;
  zoom?: { from: number; to: number };   // camera zoom into the card
  hook?: string;                          // big line over the empty thread in the first ~2.5 s (text-story opener)
};

const BLUE_IM = '#0A84FF', GRAY_IM = '#26252A', NEAR = '#1769FF';
const FONT = "'Inter', -apple-system, sans-serif";
const W = 1080, TOP = 330, BOTTOM = 1660, PAD = 50, MAXW = 800, FS = 54, LH = 68;

const useFonts = () => {
  const [handle] = React.useState(() => delayRender('fonts'));
  React.useEffect(() => {
    new FontFace('Inter', `url(${staticFile('fonts/InterVariable.woff2')})`, { weight: '100 900' }).load()
      .then(f => { document.fonts.add(f); continueRender(handle); }).catch(() => continueRender(handle));
  }, [handle]);
};

// rough text layout (deterministic, so scrolling and zoom targets can be computed without measuring the DOM)
const lines = (t: string) => {
  const words = t.split(' '); let n = 1, cur = 0; const per = (MAXW - 2 * 30) / (FS * 0.56);
  for (const w of words) { if (cur + w.length + (cur ? 1 : 0) > per) { n++; cur = w.length; } else cur += w.length + (cur ? 1 : 0); }
  return n;
};
const CARD_H = 600;
const heightOf = (m: ChatMsg, showName: boolean) => (m.card || m.image ? CARD_H : lines(m.text || '') * LH + 40) + (showName ? 42 : 0);

const Typing: React.FC<{ f: number }> = ({ f }) => (
  <div style={{ background: GRAY_IM, borderRadius: 40, padding: '26px 30px', display: 'inline-flex', gap: 10 }}>
    {[0, 1, 2].map(i => <div key={i} style={{ width: 18, height: 18, borderRadius: 9, background: '#8E8E93', opacity: 0.4 + 0.6 * Math.max(0, Math.sin((f - i * 4) / 4)) }} />)}
  </div>
);

const NearCard: React.FC<{ place: string; time: string; f: number }> = ({ place, time, f }) => {
  const pulse = (f % 40) / 40;
  return (
    <div style={{ width: 600, height: CARD_H - 20, borderRadius: 34, overflow: 'hidden', background: '#fff', fontFamily: FONT, boxShadow: '0 10px 40px rgba(0,0,0,.4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '24px 28px 14px' }}>
        <div style={{ fontWeight: 900, fontSize: 40, color: NEAR, letterSpacing: 1 }}>NEAR</div>
        <div style={{ fontSize: 24, fontWeight: 700, color: '#666' }}>Crossed paths ✨</div>
      </div>
      <div style={{ position: 'relative', height: 220, background: 'linear-gradient(135deg,#dfe9ff,#c7d8ff)', overflow: 'hidden' }}>
        {[...Array(9)].map((_, i) => <div key={i} style={{ position: 'absolute', left: i * 75 - 20, top: 0, bottom: 0, width: 14, background: 'rgba(255,255,255,.7)', transform: 'skewX(-25deg)' }} />)}
        <div style={{ position: 'absolute', left: 0, right: 0, top: 120, height: 18, background: 'rgba(255,255,255,.8)' }} />
        <div style={{ position: 'absolute', left: 300 - 60 * (1 + pulse), top: 110 - 60 * (1 + pulse), width: 120 * (1 + pulse), height: 120 * (1 + pulse), borderRadius: '50%', background: NEAR, opacity: 0.35 * (1 - pulse) }} />
        <div style={{ position: 'absolute', left: 278, top: 88, width: 44, height: 44, borderRadius: 22, background: NEAR, border: '6px solid #fff' }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 22, padding: '24px 28px' }}>
        <div style={{ width: 96, height: 96, borderRadius: 48, background: 'linear-gradient(135deg,#f6a6b2,#c86dd7,#f7c46c)', filter: 'blur(6px)' }} />
        <div style={{ color: '#111' }}>
          <div style={{ fontSize: 34, fontWeight: 800 }}>You crossed paths</div>
          <div style={{ fontSize: 27, fontWeight: 600, color: '#555', marginTop: 4 }}>{time} · {place}</div>
        </div>
      </div>
      <div style={{ margin: '0 28px', background: NEAR, color: '#fff', borderRadius: 22, textAlign: 'center', padding: '18px 0', fontSize: 32, fontWeight: 800 }}>Say hi 👋</div>
    </div>
  );
};

export const Chat: React.FC<ChatProps> = (p) => {
  useFonts();
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  const msgs = p.messages;

  // layout: y of each message inside the thread
  let y = 0; const pos = msgs.map((m, i) => {
    const showName = m.from !== 'me' && (i === 0 || msgs[i - 1].from !== m.from);
    const top = y; const h = heightOf(m, showName); y += h + 18;
    return { top, h, showName };
  });
  const visible = msgs.filter(m => f >= m.at - 4).length;
  const typingFor = msgs.find(m => m.from !== 'me' && f >= m.at - 16 && f < m.at);
  const contentBottom = (visible ? pos[visible - 1].top + pos[visible - 1].h : 0) + (typingFor ? 120 : 0);
  // scroll so the newest message sits above the input bar (eased)
  // anchored to the bottom like a real thread with the keyboard down: the newest message always sits just above the input bar
  const target = contentBottom - (BOTTOM - TOP - 40);
  const prev = (visible > 1 ? pos[visible - 2].top + pos[visible - 2].h : 0) - (BOTTOM - TOP - 40);
  const lastAt = visible ? msgs[visible - 1].at : 0;
  const scroll = prev + (target - prev) * spring({ frame: f - lastAt + 4, fps, config: { damping: 18, stiffness: 140 } });

  // camera: slow push, a punch on every new message, a buzz-shake on the first, a zoom into the NEAR card
  const punch = msgs.reduce((s, m) => s + 0.03 * Math.max(0, 1 - Math.abs(f - m.at) / 8) * (f >= m.at - 2 ? 1 : 0), 0);
  let scale = 1 + f * 0.00012 + punch;
  const shake = f < 14 ? Math.sin(f * 2.4) * 10 * (1 - f / 14) : 0;
  let dx = 0, dy = 0;
  const ci = msgs.findIndex(m => m.card || m.image);
  if (p.zoom && ci >= 0) {
    // zoom around the screen center, then shift so the card's center lands in the middle of the frame
    const z = interpolate(f, [p.zoom.from, p.zoom.from + 14, p.zoom.to - 10, p.zoom.to], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    scale += z * 0.38;
    const cx = W - PAD - 300, cy = TOP + pos[ci].top - scroll + CARD_H / 2;
    dx = -z * scale * (cx - W / 2); dy = -z * scale * (cy - 960);
  }

  return (
    <AbsoluteFill style={{ background: '#000', fontFamily: FONT, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, transform: `translate(${shake + dx}px, ${dy}px) scale(${scale})`, transformOrigin: '540px 960px' }}>
        {/* thread */}
        <div style={{ position: 'absolute', left: 0, right: 0, top: TOP, bottom: 1920 - BOTTOM, overflow: 'hidden' }}>
          <div style={{ position: 'absolute', left: 0, right: 0, top: -scroll }}>
            {msgs.map((m, i) => {
              if (f < m.at - 4) return null;
              const s = spring({ frame: f - m.at + 4, fps, config: { damping: 13, stiffness: 220, mass: 0.6 } });
              const me = m.from === 'me';
              const { top, showName } = pos[i];
              const r = m.react && f >= m.react.at ? spring({ frame: f - m.react.at, fps, config: { damping: 10, stiffness: 260 } }) : 0;
              return (
                <div key={i} style={{ position: 'absolute', top, left: PAD, right: PAD, display: 'flex', flexDirection: 'column', alignItems: me ? 'flex-end' : 'flex-start' }}>
                  {showName && <div style={{ color: '#8E8E93', fontSize: 28, margin: '0 0 8px 26px' }}>{m.from}</div>}
                  <div style={{ position: 'relative', transform: `scale(${0.6 + 0.4 * s}) translateY(${(1 - s) * 30}px)`, transformOrigin: me ? 'right bottom' : 'left bottom', opacity: Math.min(1, s * 1.6) }}>
                    {m.card || m.image
                      ? (m.image ? <Img src={staticFile(m.image)} style={{ width: 600, height: CARD_H - 20, objectFit: 'cover', borderRadius: 34 }} /> : <NearCard place={p.cardPlace || 'Brightline Aventura'} time={p.cardTime || '8:42 AM'} f={f} />)
                      : <div style={{ maxWidth: MAXW, background: me ? `linear-gradient(180deg, #2E9BFF, ${BLUE_IM})` : GRAY_IM, color: '#fff', fontSize: FS, lineHeight: `${LH}px`, padding: '20px 30px', borderRadius: 44, fontWeight: 450 }}>{m.text}</div>}
                    {r > 0 && <div style={{ position: 'absolute', top: -34, [me ? 'left' : 'right']: -26, transform: `scale(${r})`, background: me ? GRAY_IM : BLUE_IM, border: '5px solid #000', borderRadius: 40, padding: '6px 14px', fontSize: 40 }}>{m.react!.emoji}</div>}
                  </div>
                </div>
              );
            })}
            {typingFor && (() => { const k = msgs.indexOf(typingFor); return <div style={{ position: 'absolute', top: (k ? pos[k - 1].top + pos[k - 1].h + 18 : 0) + (pos[k].showName ? 42 : 0), left: PAD }}><Typing f={f} /></div>; })()}
          </div>
        </div>
        {p.hook && f < 90 && <div style={{ position: 'absolute', left: 60, right: 60, top: 520, textAlign: 'center', color: '#fff', fontSize: 82, fontWeight: 850, lineHeight: 1.08,
          textShadow: '0 6px 30px rgba(0,0,0,.6)', opacity: interpolate(f, [0, 4, 72, 90], [0.6, 1, 1, 0]), transform: `scale(${interpolate(f, [0, 6], [1.12, 1], { extrapolateRight: 'clamp' })})` }}>{p.hook}</div>}
        {/* header */}
        <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: TOP - 20, background: 'rgba(22,22,24,.96)', borderBottom: '1px solid #2c2c2e', color: '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '34px 70px 0', fontSize: 36, fontWeight: 700 }}><span>9:41</span><span style={{ letterSpacing: 2 }}>5G 🔋</span></div>
          <div style={{ position: 'absolute', left: 40, top: 150, fontSize: 64, color: BLUE_IM }}>‹</div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 34 }}>
            <div style={{ display: 'flex' }}>{['#f39c6b', '#6bc3f3', '#b06bf3'].map((c, i) => <div key={i} style={{ width: 92, height: 92, borderRadius: 46, background: c, border: '4px solid #161618', marginLeft: i ? -28 : 0 }} />)}</div>
            <div style={{ fontSize: 30, marginTop: 10 }}>{p.chatName} ›</div>
          </div>
        </div>
        {/* input bar */}
        <div style={{ position: 'absolute', left: 30, right: 30, top: BOTTOM + 30, height: 90, borderRadius: 45, border: '2px solid #3a3a3c', color: '#5f5f63', fontSize: 34, display: 'flex', alignItems: 'center', paddingLeft: 36 }}>iMessage</div>
      </div>
      {/* sounds: received = pop, sent = swoosh, the screenshot = ding */}
      {msgs.map((m, i) => <Sequence key={i} from={Math.max(0, m.at - 2)} durationInFrames={30}><Audio src={staticFile(`sfx/${m.card || m.image ? 'ding' : m.from === 'me' ? 'swoosh' : 'pop'}.wav`)} volume={0.55} /></Sequence>)}
    </AbsoluteFill>
  );
};
