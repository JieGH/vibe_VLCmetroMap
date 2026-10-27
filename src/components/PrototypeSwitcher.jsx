// PrototypeSwitcher Component
// Floating bar docked bottom-center for instant switching between UI prototype variants.
// Complies with .agents/skills/prototype/UI.md specification.
import React, { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Info, X } from 'lucide-react';

export const VARIANTS = [
  {
    key: 'A',
    label: 'A: Location Multimodal Hub',
    shortLabel: 'Location Hub',
    concept: 'Concept 3: Location-First Multimodal Transit Hub',
    subtitle: 'Locate user & find nearest Metro + EMT stops within ~3 min walk',
    rationale:
      'Location-first architecture. Rather than dominating as a single-mode rail app, pressing Locate finds all available transportation—both Metro stations and EMT bus stops—within a 3-minute walking radius (~225m). Independent scrolling Metro and EMT lists provide fast, compact access to live departures.',
    pros: [
      'Zero map clutter: preserves the clean, high-contrast rail spine',
      'Location-first multimodal transit: shows nearby Metro and EMT departures within 3 min walk',
      'All / Split view: two independent scrolling columns for Metro and Bus side-by-side',
      'Authentic badges: crisp "m" and "EMT" emblem badges, no emojis'
    ],
    cons: [
      'Focuses on immediate walking proximity rather than network-wide line tracing'
    ],
    question: 'Does the 3-minute walking radius with independent split scrolling feel faster than switching screens?'
  },
  {
    key: 'B',
    label: 'B: Line-on-Demand Canvas',
    shortLabel: 'Line on Demand',
    concept: 'Concept 1: Line-on-Demand Multimodal Canvas',
    subtitle: 'Search bus lines (C1, 19, 95) & inspect live moving buses along route ribbon',
    rationale:
      'Map-first architecture. Bus routes are hidden by default to prevent "rainbow spaghetti." Searching a bus line in SearchBar or clicking a bus chip illuminates that line’s full route ribbon with casing and animates live active AVL buses moving along the corridor.',
    pros: [
      'Completely eliminates bus polyline clutter while retaining 120 FPS fluidity',
      'Live bus vehicles track in real-time along the route with heading & speed',
      'Inspect any bus route or stop directly from the SearchBar or quick pills',
      'Docked bottom Inspector Card shows active fleet count & headway'
    ],
    cons: [
      'Requires an initial search or tap to reveal a bus route'
    ],
    question: 'Does on-demand ribbon rendering provide superior cognitive clarity over pre-rendering the full 60-line bus web?'
  },
  {
    key: 'C',
    label: 'C: Dual-Lens Mode Switcher',
    shortLabel: 'Dual-Lens Switcher',
    concept: 'Concept 4: Dual-Lens Mode Switcher',
    subtitle: 'Tactile [Metro | Bus | All] mode control in header',
    rationale:
      'Provides an explicit tactile mode switcher in the top bar. In Bus Mode, the map transforms into an EMT bus network: circular trunks (C1, C2, C3) and primary arterials (19, 95) become prominent lines, and tapping any bus stop opens a dedicated Bus Stop Departure Board.',
    pros: [
      'Uncompromising domain optimization: each mode gets bespoke styling',
      'Circular lines (C1, C2, C3) and key trunks highlighted prominently',
      'Dedicated Bus Stop Board shows real-time countdowns for bus stops',
      '"All" mode overlays both systems for unified geographic exploration'
    ],
    cons: [
      'Mode switcher introduces manual cognitive toggling'
    ],
    question: 'Do local commuters prefer distinct modal lenses, or do they expect all transit modes merged simultaneously?'
  }
];

export const PrototypeSwitcher = ({ currentVariant = 'A', onSelectVariant }) => {
  const [showInfo, setShowInfo] = useState(false);

  const currentIndex = Math.max(
    0,
    VARIANTS.findIndex(v => v.key.toUpperCase() === String(currentVariant).toUpperCase())
  );
  const current = VARIANTS[currentIndex] || VARIANTS[0];

  const changeVariant = useCallback((targetKey) => {
    if (onSelectVariant) {
      onSelectVariant(targetKey);
    }
    // Update URL search param without full page reload
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('variant', targetKey);
      window.history.pushState({}, '', url.toString());
    }
  }, [onSelectVariant]);

  const handlePrev = useCallback(() => {
    const prevIdx = (currentIndex - 1 + VARIANTS.length) % VARIANTS.length;
    changeVariant(VARIANTS[prevIdx].key);
  }, [currentIndex, changeVariant]);

  const handleNext = useCallback(() => {
    const nextIdx = (currentIndex + 1) % VARIANTS.length;
    changeVariant(VARIANTS[nextIdx].key);
  }, [currentIndex, changeVariant]);

  // Keyboard navigation: ArrowLeft and ArrowRight (ignoring text inputs)
  useEffect(() => {
    const onKeyDown = (e) => {
      const tag = e.target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || e.target?.isContentEditable) {
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handlePrev, handleNext]);

  return (
    <>
      {/* Floating Bottom Bar Docked Above Safe Area */}
      <nav
        aria-label="Prototype Variant Switcher"
        className="prototype-switcher-dock"
        style={{
          position: 'fixed',
          bottom: 'max(14px, env(safe-area-inset-bottom, 14px))',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 900,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '5px 8px',
          background: 'rgba(18, 22, 33, 0.92)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.22)',
          borderRadius: 999,
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.08)',
          color: '#ffffff',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          userSelect: 'none',
        }}
      >
        {/* Left Arrow Button */}
        <button
          type="button"
          onClick={handlePrev}
          title="Previous variant (← key)"
          aria-label="Previous variant"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 32,
            height: 32,
            borderRadius: '50%',
            border: 'none',
            background: 'rgba(255, 255, 255, 0.12)',
            color: '#ffffff',
            cursor: 'pointer',
            transition: 'background 0.15s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.22)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)')}
        >
          <ChevronLeft size={18} />
        </button>

        {/* Current Variant Pill & Info Trigger */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '2px 10px',
            cursor: 'pointer',
          }}
          onClick={() => setShowInfo(true)}
          title="Click to view design rationale & research notes"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 20,
                height: 20,
                borderRadius: '50%',
                background: '#D62828',
                color: '#ffffff',
                fontSize: '0.72rem',
                fontWeight: 900,
              }}
            >
              {current.key}
            </span>
            <span style={{ fontSize: '0.88rem', fontWeight: 800, letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>
              {current.label}
            </span>
            <span
              style={{
                fontSize: '0.68rem',
                color: '#ffb74d',
                background: 'rgba(255, 183, 77, 0.16)',
                padding: '2px 6px',
                borderRadius: 4,
                fontWeight: 700,
              }}
            >
              PROTOTYPE
            </span>
          </div>
          <span style={{ fontSize: '0.68rem', color: 'rgba(255, 255, 255, 0.65)', marginTop: 1 }}>
            {currentIndex + 1} of {VARIANTS.length} · Use ← / → keys
          </span>
        </div>

        {/* Right Arrow Button */}
        <button
          type="button"
          onClick={handleNext}
          title="Next variant (→ key)"
          aria-label="Next variant"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 32,
            height: 32,
            borderRadius: '50%',
            border: 'none',
            background: 'rgba(255, 255, 255, 0.12)',
            color: '#ffffff',
            cursor: 'pointer',
            transition: 'background 0.15s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.22)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)')}
        >
          <ChevronRight size={18} />
        </button>

        {/* Info Rationale Button */}
        <button
          type="button"
          onClick={() => setShowInfo(!showInfo)}
          title="Inspect Design Rationale"
          aria-label="Inspect Design Rationale"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 32,
            height: 32,
            borderRadius: '50%',
            border: 'none',
            background: showInfo ? '#D62828' : 'rgba(255, 255, 255, 0.12)',
            color: '#ffffff',
            cursor: 'pointer',
            marginLeft: 2,
            transition: 'background 0.15s ease',
          }}
        >
          <Info size={16} />
        </button>
      </nav>

      {/* Design Rationale Modal Drawer */}
      {showInfo && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Prototype Design Rationale"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 950,
            background: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setShowInfo(false)}
        >
          <div
            style={{
              width: 'min(560px, 92vw)',
              maxHeight: '86vh',
              overflowY: 'auto',
              background: 'var(--bg-panel, #1a202c)',
              border: '1px solid var(--border-color, rgba(255,255,255,0.2))',
              borderRadius: 18,
              boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
              color: 'var(--text-primary, #ffffff)',
              padding: 24,
              fontFamily: 'system-ui, -apple-system, sans-serif',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: 6,
                      background: '#D62828',
                      color: '#ffffff',
                      fontSize: '0.75rem',
                      fontWeight: 800,
                    }}
                  >
                    VARIANT {current.key}
                  </span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #a0aec0)' }}>
                    {current.concept}
                  </span>
                </div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '4px 0 6px', letterSpacing: '-0.02em' }}>
                  {current.label}
                </h3>
                <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary, #a0aec0)', lineHeight: 1.4 }}>
                  {current.subtitle}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowInfo(false)}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  border: 'none',
                  background: 'var(--bg-hover, rgba(255,255,255,0.1))',
                  color: 'inherit',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Variant Switcher Pill Tabs inside Modal */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 8,
                marginTop: 18,
                marginBottom: 20,
              }}
            >
              {VARIANTS.map((v) => {
                const isActive = v.key === current.key;
                return (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => changeVariant(v.key)}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 10,
                      border: isActive ? '2px solid #D62828' : '1px solid var(--border-color, rgba(255,255,255,0.15))',
                      background: isActive ? 'rgba(214, 40, 40, 0.15)' : 'var(--bg-hover, rgba(255,255,255,0.05))',
                      color: isActive ? '#ffffff' : 'var(--text-secondary, #a0aec0)',
                      cursor: 'pointer',
                      textAlign: 'center',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 2,
                    }}
                  >
                    <span style={{ fontWeight: 800, fontSize: '0.9rem' }}>Variant {v.key}</span>
                    <span style={{ fontSize: '0.72rem', opacity: 0.85 }}>{v.shortLabel}</span>
                  </button>
                );
              })}
            </div>

            {/* Design Rationale */}
            <div style={{ marginBottom: 16 }}>
              <h4 style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary, #a0aec0)', marginBottom: 6 }}>
                Design Architecture & Philosophy
              </h4>
              <p style={{ fontSize: '0.92rem', lineHeight: 1.55 }}>
                {current.rationale}
              </p>
            </div>

            {/* Trade-offs Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12, marginBottom: 18 }}>
              <div
                style={{
                  background: 'rgba(76, 175, 80, 0.08)',
                  border: '1px solid rgba(76, 175, 80, 0.25)',
                  borderRadius: 10,
                  padding: '10px 14px',
                }}
              >
                <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#4caf50', textTransform: 'uppercase', marginBottom: 6 }}>
                  Key Strengths (Pros)
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.84rem', lineHeight: 1.5 }}>
                  {current.pros.map((p, i) => (
                    <li key={i} style={{ marginBottom: 4 }}>{p}</li>
                  ))}
                </ul>
              </div>

              <div
                style={{
                  background: 'rgba(255, 152, 0, 0.08)',
                  border: '1px solid rgba(255, 152, 0, 0.25)',
                  borderRadius: 10,
                  padding: '10px 14px',
                }}
              >
                <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#ff9800', textTransform: 'uppercase', marginBottom: 6 }}>
                  Trade-off & Consideration (Cons)
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.84rem', lineHeight: 1.5 }}>
                  {current.cons.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Empirical Question */}
            <div
              style={{
                background: 'rgba(33, 150, 243, 0.08)',
                border: '1px solid rgba(33, 150, 243, 0.25)',
                borderRadius: 10,
                padding: '10px 14px',
                marginBottom: 20,
              }}
            >
              <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#2196f3', textTransform: 'uppercase', marginBottom: 4 }}>
                Research Question This Answers (Section 6)
              </div>
              <p style={{ margin: 0, fontSize: '0.86rem', fontStyle: 'italic', lineHeight: 1.45 }}>
                "{current.question}"
              </p>
            </div>

            {/* Footer Close */}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setShowInfo(false)}
                style={{
                  padding: '8px 18px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#D62828',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '0.86rem',
                  cursor: 'pointer',
                }}
              >
                Close Rationale
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default PrototypeSwitcher;
