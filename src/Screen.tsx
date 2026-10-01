// "How to" walkthrough inside a Reel scene (owner, Oct 1): after the map, a browser window slides up over it and we watch
// the steps happen — the address gets typed, the cursor glides to each field and types, buttons press with a ripple,
// results slide in with amounts counting up, a claim gets submitted. Every step is timed to the word the narrator says
// (make.mjs resolves step.t from the captions), and cues.js adds typing ticks / clicks / dings at the same frames.
// It's an illustration of the real site (labelled), not a recording of it.
import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';

export type ScreenStep = { do: 'url' | 'type' | 'click' | 'check'; t: number; field?: number; text?: string; target?: string; row?: number };
export type ScreenSpec = {
  at: number; start?: 'blank' | 'results'; site: string;
  fields?: { label: string; hint?: string }[];
  results?: { name: string; where: string; kind: string; amount: string }[];
  query?: string; steps: ScreenStep[];
};

const BLUE = '#1769FF';
const FONT = "'Montserrat', 'Helvetica Neue', Arial, sans-serif";
const UI = "'Helvetica Neue', Arial, sans-serif";
const ease = (f: number, d = 0, dur = 10) =>
  interpolate(f - d, [0, dur], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: t => 1 - Math.pow(1 - t, 3) });
const smooth = (u: number) => (1 - Math.cos(Math.PI * Math.min(1, Math.max(0, u)))) / 2;

// window geometry (frame px)
const WX = 50, WY = 250, WW = 980, WH = 880, CHROME = 92;
// element centres in window coords (cursor targets)
const ADDRESS = { x: 420, y: 46 };
const fieldBox = (i: number) => ({ x: 60, y: CHROME + 196 + i * 136, w: WW - 120, h: 78 });
const SEARCH_BTN = { x: 60, y: CHROME + 196 + 3 * 136 + 4, w: WW - 120, h: 88 };
const rowBox = (i: number) => ({ x: 40, y: CHROME + 110 + i * 150, w: WW - 80, h: 132 });
const CLAIM_BTN = { x: 60, y: CHROME + 110 + 3 * 150 + 34, w: WW - 120, h: 88 };
const centre = (b: { x: number; y: number; w: number; h: number }, dx = 0.5) => ({ x: b.x + b.w * dx, y: b.y + b.h / 2 });

export const TYPE_RATE = 2; // frames per character
export function stepEnd(s: ScreenStep) {
  const n = (s.text || '').length;
  if (s.do === 'url') return s.t + 4 + n * TYPE_RATE + 8;
  if (s.do === 'type') return s.t + 6 + n * TYPE_RATE;
  return s.t + 8;
}

function targetOf(s: ScreenStep) {
  if (s.do === 'url') return ADDRESS;
  if (s.do === 'type') return centre(fieldBox(s.field ?? 0), 0.12);
  if (s.do === 'check') { const b = rowBox(s.row ?? 0); return { x: b.x + 52, y: b.y + b.h / 2 }; }
  if (s.target === 'claim') return centre(CLAIM_BTN);
  return centre(SEARCH_BTN);
}

export const Screen: React.FC<{ spec: ScreenSpec; duration: number }> = ({ spec, duration }) => {
  const frame = useCurrentFrame();
  const t0 = Math.round(duration * spec.at);
  if (frame < t0 - 1) return null;
  const f = frame;
  const steps = spec.steps;
  const inE = ease(f, t0, 14);

  // ---- state at this frame
  let page: 'blank' | 'search' | 'loading' | 'results' | 'claimed' = spec.start === 'results' ? 'results' : 'blank';
  let url = spec.start === 'results' ? spec.site : '';
  const values: string[] = (spec.fields || []).map(() => '');
  let checked = -1, resultsAt = spec.start === 'results' ? t0 : -1, pageAt = t0, pressed: { t: number; x: number; y: number } | null = null;
  let typingField = -1;
  for (const s of steps) {
    if (f < s.t) break;
    if (s.do === 'url') {
      const n = Math.max(0, Math.min(spec.site.length, Math.floor((f - s.t - 4) / TYPE_RATE) + 1));
      url = spec.site.slice(0, n);
      const done = s.t + 4 + spec.site.length * TYPE_RATE + 8;
      if (f >= done) { page = 'search'; pageAt = done; }
    } else if (s.do === 'type') {
      const txt = s.text || '';
      const n = Math.max(0, Math.min(txt.length, Math.floor((f - s.t - 6) / TYPE_RATE) + 1));
      values[s.field ?? 0] = f >= s.t + 6 ? txt.slice(0, n) : '';
      typingField = s.field ?? 0;
    } else if (s.do === 'click') {
      const p = targetOf(s); pressed = { t: s.t, ...p };
      typingField = -1;
      if (s.target === 'claim') { if (f >= s.t + 8) { page = 'claimed'; pageAt = s.t + 8; } }
      else { page = f >= s.t + 16 ? 'results' : 'loading'; pageAt = s.t; resultsAt = s.t + 16; }
    } else if (s.do === 'check') {
      checked = s.row ?? 0; const p = targetOf(s); pressed = { t: s.t, ...p };
    }
  }

  // ---- cursor: glides (12 frames, eased) to each step's target, arriving just as the step starts
  let cur = spec.start === 'results' ? { x: WW * 0.62, y: WH * 0.72 } : { x: WW * 0.7, y: WH * 0.8 };
  for (const s of steps) {
    const p = targetOf(s);
    const from = cur;
    if (f >= s.t) { cur = p; continue; }
    const u = smooth((f - (s.t - 14)) / 14);
    cur = { x: from.x + (p.x - from.x) * u, y: from.y + (p.y - from.y) * u };
    break;
  }
  const press = pressed && f - pressed.t < 14 ? f - pressed.t : -1;

  // slow push-in on the window so it never sits still
  const push = 1 + 0.045 * smooth((f - t0) / Math.max(1, duration - t0));

  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: 'rgba(5,8,16,.72)', opacity: inE }} />
      <div style={{ position: 'absolute', left: WX, top: WY, width: WW, height: WH, opacity: inE,
        transform: `translateY(${(1 - inE) * 90}px) scale(${(0.94 + 0.06 * inE) * push})`, transformOrigin: '50% 45%' }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: 30, overflow: 'hidden', background: '#fff',
          boxShadow: '0 30px 80px rgba(0,0,0,.6), 0 0 0 2px rgba(255,255,255,.18)' }}>
          {/* browser chrome */}
          <div style={{ height: CHROME, background: '#EEF1F6', display: 'flex', alignItems: 'center', padding: '0 26px', gap: 12, borderBottom: '2px solid #DDE2EA' }}>
            {['#FF5F57', '#FEBC2E', '#28C840'].map(c => <div key={c} style={{ width: 20, height: 20, borderRadius: 10, background: c }} />)}
            <div style={{ marginLeft: 22, flex: 1, height: 54, borderRadius: 27, background: '#fff', border: `3px solid ${page === 'blank' && url ? BLUE : '#D5DBE5'}`,
              display: 'flex', alignItems: 'center', padding: '0 22px', gap: 12 }}>
              <span style={{ fontSize: 24 }}>🔒</span>
              <span style={{ fontFamily: UI, fontSize: 32, color: '#111', fontWeight: 500 }}>{url}</span>
              {page === 'blank' && <Caret f={f} />}
            </div>
          </div>
          {/* page */}
          <div style={{ position: 'absolute', top: CHROME, left: 0, right: 0, bottom: 0 }}>
            {page === 'blank' && <Blank />}
            {(page === 'search' || page === 'loading') && <SearchPage spec={spec} values={values} typing={typingField} f={f} enter={ease(f, pageAt, 10)} pressing={page === 'loading' ? f - (pressed?.t ?? f) : -1} />}
            {page === 'results' && <Results spec={spec} f={f} at={resultsAt} checked={checked} claimPress={press >= 0 && pressed && pressed.y > CLAIM_BTN.y - 10 ? press : -1} />}
            {page === 'claimed' && <Claimed f={f} at={pageAt} />}
            {(page === 'loading' || (page === 'search' && f - pageAt < 8)) && (
              <div style={{ position: 'absolute', top: 0, left: 0, height: 6, background: BLUE,
                width: `${Math.min(100, ((f - (page === 'loading' ? (pressed?.t ?? f) : pageAt - 8)) / 16) * 100)}%` }} />
            )}
          </div>
        </div>
        {/* click ripple + cursor (above the window content) */}
        {press >= 0 && pressed && (
          <div style={{ position: 'absolute', left: pressed.x - 60, top: pressed.y - 60, width: 120, height: 120, borderRadius: 60,
            border: `6px solid ${BLUE}`, opacity: interpolate(press, [0, 14], [0.9, 0]), transform: `scale(${interpolate(press, [0, 14], [0.2, 1.1])})` }} />
        )}
        <Cursor x={cur.x} y={cur.y} down={press >= 0 && press < 5} />
      </div>
      <div style={{ position: 'absolute', top: WY - 62, left: WX, display: 'flex', gap: 10, opacity: inE }}>
        <div style={{ background: BLUE, borderRadius: 10, padding: '6px 16px' }}>
          <span style={{ fontFamily: FONT, fontWeight: 900, fontSize: 26, color: '#fff', letterSpacing: 1 }}>STEP BY STEP</span>
        </div>
        <div style={{ background: 'rgba(8,10,16,.7)', borderRadius: 10, padding: '6px 16px' }}>
          <span style={{ fontFamily: FONT, fontWeight: 700, fontSize: 24, color: '#fff' }}>Illustration · example names</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Caret: React.FC<{ f: number }> = ({ f }) => (
  <div style={{ width: 3, height: 34, background: BLUE, opacity: Math.floor(f / 8) % 2 ? 0 : 1, marginLeft: -8 }} />
);

const Cursor: React.FC<{ x: number; y: number; down: boolean }> = ({ x, y, down }) => (
  <svg width={56} height={56} viewBox="0 0 24 24" style={{ position: 'absolute', left: x - 6, top: y - 4, transform: `scale(${down ? 0.86 : 1})`,
    transformOrigin: '6px 4px', filter: 'drop-shadow(0 4px 6px rgba(0,0,0,.45))' }}>
    <path d="M5 2 L5 19 L9.4 14.8 L12.3 21.4 L15.2 20.1 L12.4 13.6 L18.5 13.6 Z" fill="#111" stroke="#fff" strokeWidth={1.4} strokeLinejoin="round" />
  </svg>
);

const Blank: React.FC = () => (
  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F7F9FC' }}>
    <span style={{ fontFamily: UI, fontSize: 36, color: '#A3ACBA', fontWeight: 600 }}>New Tab</span>
  </div>
);

const SearchPage: React.FC<{ spec: ScreenSpec; values: string[]; typing: number; f: number; enter: number; pressing: number }> = (
  { spec, values, typing, f, enter, pressing },
) => (
  <div style={{ position: 'absolute', inset: 0, background: '#fff', opacity: enter, transform: `translateY(${(1 - enter) * 20}px)` }}>
    <div style={{ background: '#0B1F44', padding: '26px 60px' }}>
      <div style={{ fontFamily: UI, fontWeight: 800, fontSize: 40, color: '#fff' }}>Unclaimed Property Search</div>
      <div style={{ fontFamily: UI, fontSize: 24, color: '#AFC3E8', marginTop: 4 }}>Search is free · {spec.site}</div>
    </div>
    {(spec.fields || []).map((fl, i) => {
      const b = fieldBox(i);
      const active = typing === i;
      return (
        <div key={i} style={{ position: 'absolute', left: b.x, top: b.y - CHROME - 44, width: b.w }}>
          <div style={{ fontFamily: UI, fontWeight: 700, fontSize: 26, color: '#33415C', marginBottom: 8 }}>
            {fl.label}{fl.hint && <span style={{ color: BLUE, fontWeight: 800 }}>  · {fl.hint}</span>}
          </div>
          <div style={{ height: b.h, borderRadius: 14, border: `3px solid ${active ? BLUE : '#CDD5E1'}`, display: 'flex', alignItems: 'center', padding: '0 22px',
            boxShadow: active ? `0 0 0 6px ${BLUE}22` : 'none', background: '#fff' }}>
            <span style={{ fontFamily: UI, fontSize: 36, fontWeight: 600, color: '#111', letterSpacing: 1 }}>{values[i]}</span>
            {active && <Caret f={f} />}
          </div>
        </div>
      );
    })}
    <div style={{ position: 'absolute', left: SEARCH_BTN.x, top: SEARCH_BTN.y - CHROME, width: SEARCH_BTN.w, height: SEARCH_BTN.h, borderRadius: 16,
      background: BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${pressing >= 0 && pressing < 6 ? 0.96 : 1})`,
      boxShadow: '0 10px 24px rgba(23,105,255,.35)' }}>
      <span style={{ fontFamily: FONT, fontWeight: 900, fontSize: 38, color: '#fff', letterSpacing: 2 }}>{pressing >= 0 ? 'SEARCHING…' : 'SEARCH'}</span>
    </div>
  </div>
);

const Results: React.FC<{ spec: ScreenSpec; f: number; at: number; checked: number; claimPress: number }> = ({ spec, f, at, checked, claimPress }) => {
  const rows = spec.results || [];
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#fff' }}>
      <div style={{ padding: '28px 44px 0', opacity: ease(f, at, 8) }}>
        <span style={{ fontFamily: UI, fontWeight: 800, fontSize: 36, color: '#0B1F44' }}>{rows.length} results for “{spec.query}”</span>
      </div>
      {rows.map((r, i) => {
        const b = rowBox(i), e = ease(f, at + 4 + i * 5, 10), c = ease(f, at + 6 + i * 5, 22);
        const on = checked === i;
        return (
          <div key={i} style={{ position: 'absolute', left: b.x, top: b.y - CHROME, width: b.w, height: b.h, borderRadius: 18,
            border: `3px solid ${on ? BLUE : '#E2E7EF'}`, background: on ? '#EEF4FF' : '#fff', opacity: e, transform: `translateX(${(1 - e) * 60}px)`,
            display: 'flex', alignItems: 'center', padding: '0 28px', gap: 24 }}>
            <div style={{ width: 46, height: 46, borderRadius: 10, border: `3px solid ${on ? BLUE : '#B9C3D3'}`, background: on ? BLUE : '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {on && <span style={{ color: '#fff', fontSize: 32, fontWeight: 900, fontFamily: UI }}>✓</span>}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: UI, fontWeight: 800, fontSize: 32, color: '#111' }}>{r.name}</div>
              <div style={{ fontFamily: UI, fontSize: 24, color: '#5B6678', marginTop: 4 }}>{r.where} · {r.kind}</div>
            </div>
            <div style={{ fontFamily: FONT, fontWeight: 900, fontSize: 44, color: BLUE }}>{countUp(r.amount, c)}</div>
          </div>
        );
      })}
      <div style={{ position: 'absolute', left: CLAIM_BTN.x, top: CLAIM_BTN.y - CHROME, width: CLAIM_BTN.w, height: CLAIM_BTN.h, borderRadius: 16,
        background: checked >= 0 ? BLUE : '#C9D2E0', display: 'flex', alignItems: 'center', justifyContent: 'center',
        transform: `scale(${claimPress >= 0 && claimPress < 6 ? 0.96 : 1})`, opacity: ease(f, at + 14, 10) }}>
        <span style={{ fontFamily: FONT, fontWeight: 900, fontSize: 38, color: '#fff', letterSpacing: 2 }}>CLAIM</span>
      </div>
    </div>
  );
};

const Claimed: React.FC<{ f: number; at: number }> = ({ f, at }) => {
  const e = ease(f, at, 10);
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 26 }}>
      <div style={{ width: 190, height: 190, borderRadius: 95, background: BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center',
        transform: `scale(${0.6 + 0.4 * e})`, opacity: e, boxShadow: '0 16px 40px rgba(23,105,255,.4)' }}>
        <span style={{ fontFamily: UI, fontSize: 120, color: '#fff', fontWeight: 900 }}>✓</span>
      </div>
      <div style={{ fontFamily: FONT, fontWeight: 900, fontSize: 52, color: '#0B1F44', opacity: ease(f, at + 5, 10) }}>CLAIM STARTED</div>
      <div style={{ fontFamily: UI, fontWeight: 600, fontSize: 32, color: '#5B6678', opacity: ease(f, at + 9, 10) }}>Next: upload your ID</div>
    </div>
  );
};

function countUp(value: string, p: number) {
  const m = value.match(/\d[\d,]*(\.\d+)?/);
  if (!m || p >= 1) return value;
  const n = parseFloat(m[0].replace(/,/g, ''));
  const dec = m[1] ? m[1].length - 1 : 0;
  const txt = (n * p).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  return value.slice(0, m.index) + txt + value.slice((m.index || 0) + m[0].length);
}
