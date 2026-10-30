import React, { useEffect } from 'react';
import { X, ShieldCheck, FileText, Database, Activity } from 'lucide-react';
import { getLegalInfo } from '../utils/legalInfo';
import { useTranslation } from '../i18n';
import AppBadge, { VersionPill } from './AppBadge';

/**
 * Native-feeling About & Legal / Licenses modal.
 * Displays formal copyright, license terms, and third-party
 * attributions cleanly without exposing raw developer repository links.
 */
const AboutModal = ({ isOpen, onClose, trainStats = { live: 0, confirmed: 0 } }) => {
  const { t, language } = useTranslation();
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

  const legalInfo = getLegalInfo(language);
  const { attributions, privacy } = legalInfo;

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
          maxHeight: 'calc(100dvh - 48px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))',
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
          className="about-modal-header"
          style={{
            padding: '20px 20px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid var(--border-color)',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
            <AppBadge size={44} />
            <div style={{ minWidth: 0 }}>
              <h2
                id="about-modal-title"
                style={{ fontSize: '1.15rem', fontWeight: 800, letterSpacing: '-0.3px', margin: 0 }}
              >
                {legalInfo.name}
              </h2>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                {legalInfo.subtitle}
              </div>
              <VersionPill style={{ marginTop: '6px' }} />
            </div>
          </div>

          <button
            type="button"
            className="about-modal-close"
            onClick={onClose}
            aria-label={t('aboutModal.closeAria')}
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
              flexShrink: 0,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div
          className="about-modal-body"
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
          {/* What the app is */}
          <section>
            <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)', marginBottom: '6px' }}>
              {t('aboutModal.whatTitle')}
            </div>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
              {t('aboutModal.tagline')}. {t('aboutModal.whatBody')}
            </p>
          </section>

          {/* Live Network Status Section */}
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
                marginBottom: '10px',
              }}
            >
              <Activity size={16} color="#4CAF50" />
              <span>{t('sidebar.liveNetwork')}</span>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <div style={{
                flex: 1, padding: '10px 12px', borderRadius: '10px',
                background: 'rgba(0, 0, 0, 0.15)', textAlign: 'center',
              }}>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#4CAF50', lineHeight: 1 }}>
                  {trainStats.live}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  {t('sidebar.liveTrains')}
                </div>
              </div>
              <div style={{
                flex: 1, padding: '10px 12px', borderRadius: '10px',
                background: 'rgba(0, 0, 0, 0.15)', textAlign: 'center',
              }}>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#FFD100', lineHeight: 1 }}>
                  {trainStats.confirmed}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  {t('sidebar.confirmed')}
                </div>
              </div>
            </div>
          </section>

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
              <span>{t('aboutModal.copyrightLicense')}</span>
            </div>
            <p style={{ margin: '0 0 6px 0', fontWeight: 600, color: 'var(--text-primary)' }}>
              {legalInfo.copyright}
            </p>
            <p style={{ margin: '0 0 8px 0', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
              {legalInfo.licenseSummary}
            </p>
            <p style={{ margin: '0 0 8px 0', fontWeight: 600, fontSize: '0.78rem', color: 'var(--text-primary)' }}>
              {t('aboutModal.unofficial')}
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
              {legalInfo.disclaimer}
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
              <span>{t('aboutModal.dataAttributions')}</span>
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
          className="about-modal-footer"
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
            {t('aboutModal.done')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AboutModal;
