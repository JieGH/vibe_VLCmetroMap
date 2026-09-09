// PROTOTYPE — throwaway UI exploration for issue #47 ("make the splash
// screen more artistic and fun"). Not wired into the real app by default;
// only mounts when the URL carries a `?variant=A|B|C` param (see the gate in
// App.jsx). Never shipped: gated additionally on `import.meta.env.PROD`.
//
// Three structurally different takes on the splash's art style, switchable
// via a floating bottom bar. Each variant is fully self-contained (its own
// <style> block) so deleting this file removes the whole experiment.
import React, { useEffect, useState } from 'react';

const VARIANTS = ['A', 'B', 'C'];

const LINE_COLORS = ['#E2001A', '#FFD100', '#00994D', '#7A3FA0', '#0072BC', '#8B5A2B'];

// ─── Variant A — "Network Sketch" ──────────────────────────────────────────
// Curved, hand-drawn-feeling paths (not straight spokes) converge on the
// central station; a small train dot rides the red line in on a loop while
// the paths keep re-drawing themselves, sketch-style.
const VariantA = () => (
  <div className="proto-a-root">
    <style>{`
      .proto-a-root { position: fixed; inset: 0; z-index: 20000; background: #14141c;
        display: flex; flex-direction: column; align-items: center; justify-content: center; }
      .proto-a-svg { width: 220px; height: 220px; overflow: visible; }
      .proto-a-path { fill: none; stroke-linecap: round; stroke-width: 5;
        stroke-dasharray: 140; animation: protoADraw 2.4s ease-in-out infinite; }
      @keyframes protoADraw {
        0% { stroke-dashoffset: 140; opacity: 0.25; }
        45% { stroke-dashoffset: 0; opacity: 1; }
        80% { stroke-dashoffset: 0; opacity: 1; }
        100% { stroke-dashoffset: -140; opacity: 0.25; }
      }
      .proto-a-train { animation: protoATrain 2.4s ease-in-out infinite; }
      @keyframes protoATrain {
        0% { offset-distance: 0%; opacity: 0; }
        10% { opacity: 1; }
        45% { offset-distance: 100%; opacity: 1; }
        50% { opacity: 0; }
        100% { opacity: 0; }
      }
      .proto-a-core { animation: protoACore 2.4s ease-in-out infinite; transform-origin: 110px 110px; }
      @keyframes protoACore {
        0%, 40% { transform: scale(0.6); opacity: 0.4; }
        50% { transform: scale(1.15); opacity: 1; }
        70%, 100% { transform: scale(1); opacity: 1; }
      }
      .proto-a-title { color: #fff; font: 800 22px system-ui; margin-top: 22px; letter-spacing: 0.5px; }
      .proto-a-sub { color: #9a9aa8; font: 500 12px system-ui; margin-top: 4px; }
    `}</style>
    <svg viewBox="0 0 220 220" className="proto-a-svg" aria-hidden="true">
      <path className="proto-a-path" style={{ stroke: LINE_COLORS[2], animationDelay: '0s' }}
        d="M 20 40 Q 60 90 110 110" />
      <path className="proto-a-path" style={{ stroke: LINE_COLORS[1], animationDelay: '0.15s' }}
        d="M 200 60 Q 150 60 110 110" />
      <path className="proto-a-path" style={{ stroke: LINE_COLORS[3], animationDelay: '0.3s' }}
        d="M 30 190 Q 70 140 110 110" />
      <path className="proto-a-path" id="protoATrainPath" style={{ stroke: LINE_COLORS[0], animationDelay: '0.05s' }}
        d="M 195 195 Q 160 150 110 110" />
      <circle r="4.5" fill="#fff" className="proto-a-train" style={{ offsetPath: "path('M 195 195 Q 160 150 110 110')" }} />
      <circle cx="110" cy="110" r="9" fill="#14141c" stroke="#fff" strokeWidth="2.5" className="proto-a-core" />
    </svg>
    <div className="proto-a-title">Metro Valencia</div>
    <div className="proto-a-sub">Live Map &amp; Real-time Arrivals</div>
  </div>
);
VariantA.label = 'Network Sketch';

// ─── Variant B — "Rising Skyline" ──────────────────────────────────────────
// A completely different composition: Line-colored bars rise from the floor
// like an equalizer, station-dot confetti pops above them, and the title
// types itself out beneath. No converging point at all.
const VariantB = () => (
  <div className="proto-b-root">
    <style>{`
      .proto-b-root { position: fixed; inset: 0; z-index: 20000; background: #0f0f16;
        display: flex; flex-direction: column; align-items: center; justify-content: center; overflow: hidden; }
      .proto-b-bars { display: flex; align-items: flex-end; gap: 8px; height: 100px; }
      .proto-b-bar { width: 14px; border-radius: 4px 4px 0 0; animation: protoBRise 1.8s ease-in-out infinite; }
      @keyframes protoBRise {
        0%, 100% { height: 14px; }
        50% { height: var(--h, 80px); }
      }
      .proto-b-confetti { position: absolute; width: 6px; height: 6px; border-radius: 50%;
        animation: protoBPop 1.8s ease-out infinite; opacity: 0; }
      @keyframes protoBPop {
        0% { transform: translate(0,0) scale(0.3); opacity: 0; }
        35% { opacity: 1; }
        100% { transform: translate(var(--dx), var(--dy)) scale(1); opacity: 0; }
      }
      .proto-b-title { color: #fff; font: 800 22px/1 system-ui; margin-top: 26px;
        white-space: nowrap; overflow: hidden; border-right: 2px solid #FFD100;
        animation: protoBType 1.8s steps(14) infinite, protoBBlink 0.6s step-end infinite; }
      @keyframes protoBType { 0%, 15% { width: 0 } 70%, 100% { width: 14ch } }
      @keyframes protoBBlink { 50% { border-color: transparent } }
      .proto-b-sub { color: #9a9aa8; font: 500 12px system-ui; margin-top: 8px; opacity: 0.8; }
    `}</style>
    <div style={{ position: 'relative' }}>
      <div className="proto-b-bars">
        {LINE_COLORS.map((c, i) => (
          <div key={c} className="proto-b-bar"
            style={{ background: c, '--h': `${40 + (i % 3) * 24}px`, animationDelay: `${i * 0.08}s` }} />
        ))}
      </div>
      {LINE_COLORS.map((c, i) => (
        <div key={`conf-${c}`} className="proto-b-confetti"
          style={{
            background: c,
            left: `${20 + i * 24}px`, top: '10px',
            '--dx': `${(i % 2 === 0 ? -1 : 1) * (20 + i * 6)}px`,
            '--dy': `${-40 - i * 8}px`,
            animationDelay: `${0.1 + i * 0.1}s`,
          }} />
      ))}
    </div>
    <div className="proto-b-title">Metro Valencia</div>
    <div className="proto-b-sub">Live Map &amp; Real-time Arrivals</div>
  </div>
);
VariantB.label = 'Rising Skyline';

// ─── Variant C — "Spinning Compass" ────────────────────────────────────────
// A rotating medallion: Line-colored arcs orbit the rim like a compass rose,
// the center mark spins and settles, and sonar rings pulse outward. Reads as
// a badge/logo mark rather than a diagram of lines meeting at a point.
const VariantC = () => (
  <div className="proto-c-root">
    <style>{`
      .proto-c-root { position: fixed; inset: 0; z-index: 20000; background: #17141f;
        display: flex; flex-direction: column; align-items: center; justify-content: center; }
      .proto-c-wrap { position: relative; width: 160px; height: 160px; }
      .proto-c-ring { position: absolute; inset: 0; border-radius: 50%;
        border: 2px solid rgba(255,255,255,0.15); animation: protoCSonar 2.2s ease-out infinite; }
      @keyframes protoCSonar { 0% { transform: scale(0.5); opacity: 0.9; } 100% { transform: scale(1.6); opacity: 0; } }
      .proto-c-rim { animation: protoCSpin 3.2s cubic-bezier(.2,.8,.2,1) infinite; transform-origin: 50% 50%; }
      @keyframes protoCSpin { 0% { transform: rotate(0deg); } 60% { transform: rotate(300deg); } 100% { transform: rotate(360deg); } }
      .proto-c-mark { animation: protoCMark 3.2s ease-in-out infinite; transform-origin: 50% 50%; }
      @keyframes protoCMark { 0%, 55% { transform: rotate(-20deg) scale(0.85); } 75% { transform: rotate(6deg) scale(1.1); } 100% { transform: rotate(0deg) scale(1); } }
      .proto-c-title { color: #fff; font: 800 22px system-ui; margin-top: 22px; animation: protoCBounce 3.2s ease-in-out infinite; }
      @keyframes protoCBounce { 0%, 60% { transform: translateY(6px); opacity: 0; } 75% { transform: translateY(-3px); opacity: 1; } 90%, 100% { transform: translateY(0); opacity: 1; } }
      .proto-c-sub { color: #9a9aa8; font: 500 12px system-ui; margin-top: 4px; }
    `}</style>
    <div className="proto-c-wrap">
      <div className="proto-c-ring" style={{ animationDelay: '0s' }} />
      <div className="proto-c-ring" style={{ animationDelay: '0.7s' }} />
      <div className="proto-c-ring" style={{ animationDelay: '1.4s' }} />
      <svg viewBox="0 0 160 160" width="160" height="160" className="proto-c-rim" aria-hidden="true">
        {LINE_COLORS.map((c, i) => {
          const a0 = (i / LINE_COLORS.length) * 360;
          const a1 = a0 + 360 / LINE_COLORS.length - 14;
          const toXY = (deg) => {
            const r = (deg - 90) * (Math.PI / 180);
            return [80 + 68 * Math.cos(r), 80 + 68 * Math.sin(r)];
          };
          const [x0, y0] = toXY(a0);
          const [x1, y1] = toXY(a1);
          const large = a1 - a0 > 180 ? 1 : 0;
          return (
            <path key={c} d={`M ${x0} ${y0} A 68 68 0 ${large} 1 ${x1} ${y1}`}
              fill="none" stroke={c} strokeWidth="7" strokeLinecap="round" />
          );
        })}
      </svg>
      <svg viewBox="0 0 160 160" width="160" height="160" className="proto-c-mark"
        style={{ position: 'absolute', inset: 0 }} aria-hidden="true">
        <circle cx="80" cy="80" r="26" fill="#17141f" stroke="#fff" strokeWidth="2" />
        <path d="M 68 68 L 92 92 M 92 68 L 68 92" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
      </svg>
    </div>
    <div className="proto-c-title">Metro Valencia</div>
    <div className="proto-c-sub">Live Map &amp; Real-time Arrivals</div>
  </div>
);
VariantC.label = 'Spinning Compass';

const VARIANT_COMPONENTS = { A: VariantA, B: VariantB, C: VariantC };

// ─── Switcher chrome ────────────────────────────────────────────────────────
const readVariant = () => {
  const v = new URLSearchParams(window.location.search).get('variant');
  return VARIANTS.includes(v) ? v : 'A';
};

const PrototypeSwitcher = ({ current, onChange }) => (
  <div
    style={{
      position: 'fixed', bottom: 18, left: '50%', transform: 'translateX(-50%)',
      zIndex: 20001, display: 'flex', alignItems: 'center', gap: 14,
      background: 'rgba(20,20,28,0.92)', border: '1px solid rgba(255,255,255,0.18)',
      borderRadius: 999, padding: '8px 16px', boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
      font: '600 13px system-ui', color: '#fff',
    }}
  >
    <button onClick={() => onChange(-1)} aria-label="Previous variant"
      style={{ background: 'none', border: 'none', color: '#fff', fontSize: 16, cursor: 'pointer' }}>←</button>
    <span>{current} — {VARIANT_COMPONENTS[current].label}</span>
    <button onClick={() => onChange(1)} aria-label="Next variant"
      style={{ background: 'none', border: 'none', color: '#fff', fontSize: 16, cursor: 'pointer' }}>→</button>
  </div>
);

const SplashPrototype = () => {
  const [variant, setVariant] = useState(readVariant);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('variant', variant);
    window.history.replaceState({}, '', url);
  }, [variant]);

  useEffect(() => {
    const onKey = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;
      if (e.key === 'ArrowLeft') cycle(-1);
      if (e.key === 'ArrowRight') cycle(1);
    };
    const cycle = (dir) => {
      setVariant((cur) => {
        const idx = VARIANTS.indexOf(cur);
        return VARIANTS[(idx + dir + VARIANTS.length) % VARIANTS.length];
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const cycle = (dir) => {
    setVariant((cur) => {
      const idx = VARIANTS.indexOf(cur);
      return VARIANTS[(idx + dir + VARIANTS.length) % VARIANTS.length];
    });
  };

  const Variant = VARIANT_COMPONENTS[variant];

  return (
    <>
      <Variant />
      <PrototypeSwitcher current={variant} onChange={cycle} />
    </>
  );
};

export default SplashPrototype;
