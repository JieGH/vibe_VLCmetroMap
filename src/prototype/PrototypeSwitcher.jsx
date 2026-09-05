// PROTOTYPE — throwaway. See ./README.md.
//
// Deliberately ugly: a high-contrast pill that could never be mistaken for part
// of a design being evaluated.
import React, { useEffect } from 'react';

const PrototypeSwitcher = ({ variants, current, names, onChange }) => {
  const index = Math.max(0, variants.indexOf(current));
  const step = (delta) => onChange(variants[(index + delta + variants.length) % variants.length]);

  useEffect(() => {
    const onKey = (e) => {
      const el = document.activeElement;
      const typing = el && (
        el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable
      );
      if (typing) return;
      if (e.key === 'ArrowLeft') step(-1);
      if (e.key === 'ArrowRight') step(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const arrow = {
    width: 34, height: 34, borderRadius: '50%', border: 'none', cursor: 'pointer',
    background: '#000', color: '#fff', fontSize: 17, lineHeight: 1,
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  };

  return (
    <div
      style={{
        position: 'fixed', bottom: 14, left: '50%', transform: 'translateX(-50%)',
        zIndex: 99999, display: 'flex', alignItems: 'center', gap: 10,
        padding: '6px 10px', borderRadius: 999,
        background: '#f2ff00', color: '#000',
        boxShadow: '0 6px 24px rgba(0,0,0,.45)',
        font: '600 13px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace',
        border: '2px solid #000',
      }}
    >
      <button style={arrow} onClick={() => step(-1)} title="Previous variant (←)">‹</button>
      <span style={{ minWidth: 190, textAlign: 'center', letterSpacing: '.02em' }}>
        {current} — {names[current]}
      </span>
      <button style={arrow} onClick={() => step(1)} title="Next variant (→)">›</button>
    </div>
  );
};

export default PrototypeSwitcher;
