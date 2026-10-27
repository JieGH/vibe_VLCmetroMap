// PrototypeSwitcher Component
// Floating bar docked bottom-center for instant switching between UI prototype variants.
// Complies with .agents/skills/prototype/UI.md specification.
import React, { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Info, X } from 'lucide-react';
import { useTranslation } from '../i18n';

// The variants are identified by key only; every word they show lives in the dictionaries (prototype.<key>.*).
export const VARIANTS = [{ key: 'A' }, { key: 'B' }, { key: 'C' }];

const PRO_KEYS = ['pro1', 'pro2', 'pro3', 'pro4'];

const describeVariant = (key, t) => ({
  key,
  label: t(`prototype.${key}.label`),
  shortLabel: t(`prototype.${key}.shortLabel`),
  concept: t(`prototype.${key}.concept`),
  subtitle: t(`prototype.${key}.subtitle`),
  rationale: t(`prototype.${key}.rationale`),
  pros: PRO_KEYS.map((p) => t(`prototype.${key}.${p}`)),
  cons: [t(`prototype.${key}.con1`)],
  question: t(`prototype.${key}.question`),
});

export const PrototypeSwitcher = ({ currentVariant = 'A', onSelectVariant }) => {
  const { t } = useTranslation();
  const [showInfo, setShowInfo] = useState(false);

  const currentIndex = Math.max(
    0,
    VARIANTS.findIndex(v => v.key.toUpperCase() === String(currentVariant).toUpperCase())
  );
  const current = describeVariant((VARIANTS[currentIndex] || VARIANTS[0]).key, t);

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
        aria-label={t('prototype.switcherAria')}
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
          title={t('prototype.prevTitle')}
          aria-label={t('prototype.prevAria')}
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
          title={t('prototype.infoTrigger')}
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
              {t('prototype.badge')}
            </span>
          </div>
          <span style={{ fontSize: '0.68rem', color: 'rgba(255, 255, 255, 0.65)', marginTop: 1 }}>
            {t('prototype.counter', { index: currentIndex + 1, total: VARIANTS.length })}
          </span>
        </div>

        {/* Right Arrow Button */}
        <button
          type="button"
          onClick={handleNext}
          title={t('prototype.nextTitle')}
          aria-label={t('prototype.nextAria')}
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
          title={t('prototype.inspect')}
          aria-label={t('prototype.inspect')}
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
          aria-label={t('prototype.rationaleAria')}
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
                    {t('prototype.variantUpper', { key: current.key })}
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
                    <span style={{ fontWeight: 800, fontSize: '0.9rem' }}>{t('prototype.variant', { key: v.key })}</span>
                    <span style={{ fontSize: '0.72rem', opacity: 0.85 }}>{t(`prototype.${v.key}.shortLabel`)}</span>
                  </button>
                );
              })}
            </div>

            {/* Design Rationale */}
            <div style={{ marginBottom: 16 }}>
              <h4 style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary, #a0aec0)', marginBottom: 6 }}>
                {t('prototype.rationaleHeading')}
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
                  {t('prototype.prosHeading')}
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
                  {t('prototype.consHeading')}
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
                {t('prototype.questionHeading')}
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
                {t('prototype.closeRationale')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default PrototypeSwitcher;
