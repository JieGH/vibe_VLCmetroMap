import React, { useEffect } from 'react';
import { X, ShieldCheck, FileText, Database } from 'lucide-react';
import { APP_LEGAL_INFO } from '../utils/legalInfo';

/**
 * Native-feeling About & Legal / Licenses modal.
 * Displays formal copyright, open-source license terms, and third-party
 * attributions cleanly without exposing raw developer repository links.
 */
const AboutModal = ({ isOpen, onClose }) => {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const { attributions, privacy } = APP_LEGAL_INFO;

  return (
    <div
      className="about-modal-backdrop"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        paddingTop: 'calc(20px + env(safe-area-inset-top, 0px))',
        paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-modal-title"
        className="glass-panel about-modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(480px, 100%)',
          maxHeight: 'calc(100vh - 48px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          borderRadius: '18px',
          backgroundColor: 'var(--bg-panel-solid)',
          boxShadow: '0 20px 48px rgba(0, 0, 0, 0.55)',
          border: '1px solid var(--border-color)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 20px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid var(--border-color)',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #FFD100 0%, #E2001A 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                color: '#fff',
                fontSize: '1.25rem',
                boxShadow: '0 4px 12px rgba(226, 0, 26, 0.3)',
              }}
            >
              V
            </div>
            <div>
              <h2
                id="about-modal-title"
                style={{ fontSize: '1.15rem', fontWeight: 800, letterSpacing: '-0.3px', margin: 0 }}
              >
                {APP_LEGAL_INFO.name}
              </h2>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                {APP_LEGAL_INFO.subtitle} · <span style={{ fontVariantNumeric: 'tabular-nums' }}>v{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'build'}</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close About and Legal modal"
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              border: 'none',
              background: 'var(--bg-hover)',
              color: 'var(--text-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            fontSize: '0.84rem',
            lineHeight: 1.5,
          }}
        >
          {/* Copyright & License Section */}
          <section
            style={{
              padding: '14px',
              borderRadius: '12px',
              background: 'var(--bg-hover)',
              border: '1px solid var(--border-color)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontWeight: 700,
                fontSize: '0.88rem',
                color: 'var(--text-primary)',
                marginBottom: '8px',
              }}
            >
              <FileText size={16} color="#FFD100" />
              <span>Copyright & License</span>
            </div>
            <p style={{ margin: '0 0 6px 0', fontWeight: 600, color: 'var(--text-primary)' }}>
              {APP_LEGAL_INFO.copyright}
            </p>
            <p style={{ margin: '0 0 8px 0', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
              {APP_LEGAL_INFO.licenseSummary}
            </p>
            <div
              style={{
                padding: '8px 10px',
                borderRadius: '8px',
                background: 'rgba(0, 0, 0, 0.2)',
                fontSize: '0.72rem',
                color: 'var(--text-secondary)',
                lineHeight: 1.4,
              }}
            >
              {APP_LEGAL_INFO.disclaimer}
            </div>
          </section>

          {/* Third-Party Attributions Section */}
          <section>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontWeight: 700,
                fontSize: '0.88rem',
                color: 'var(--text-primary)',
                marginBottom: '10px',
              }}
            >
              <Database size={16} color="#4CAF50" />
              <span>Data & Attributions</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {Object.entries(attributions).map(([key, item]) => (
                <div
                  key={key}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '10px',
                    background: 'var(--bg-hover)',
                    border: '1px solid var(--border-color)',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--text-primary)', marginBottom: '3px' }}>
                    {item.title}
                  </div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                    {item.text}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Privacy & Device Data */}
          <section
            style={{
              padding: '14px',
              borderRadius: '12px',
              background: 'var(--bg-hover)',
              border: '1px solid var(--border-color)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontWeight: 700,
                fontSize: '0.88rem',
                color: 'var(--text-primary)',
                marginBottom: '8px',
              }}
            >
              <ShieldCheck size={16} color="#00B4D8" />
              <span>{privacy.title}</span>
            </div>
            <ul style={{ margin: 0, paddingLeft: '18px', color: 'var(--text-secondary)', fontSize: '0.78rem', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {privacy.points.map((point, idx) => (
                <li key={idx} style={{ lineHeight: 1.45 }}>{point}</li>
              ))}
            </ul>
          </section>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--border-color)',
            display: 'flex',
            justifyContent: 'flex-end',
            flexShrink: 0,
            background: 'var(--bg-panel-solid)',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              width: '100%',
              minHeight: '44px',
              borderRadius: '10px',
              border: 'none',
              background: 'var(--bg-hover-active)',
              color: 'var(--text-primary)',
              fontWeight: 700,
              fontSize: '0.86rem',
              cursor: 'pointer',
              transition: 'background 0.2s ease',
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

export default AboutModal;
