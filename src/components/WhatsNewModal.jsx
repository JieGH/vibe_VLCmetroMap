import React, { useEffect } from 'react';
import { X, Train, Map, Navigation, SunMoon, MessageSquare, Check } from 'lucide-react';
import { useTranslation } from '../i18n';
import AppBadge, { VersionPill } from './AppBadge';

/**
 * Native-feeling "What's New" modal dialog.
 * Highlights key updates and feature improvements in bullet-point format.
 * Provides a direct gateway to contact the author for feedback or requests.
 */
const WhatsNewModal = ({ isOpen, onClose, onOpenFeedback }) => {
  const { t } = useTranslation();

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

  const features = [
    {
      icon: <Train size={18} color="#00A862" />,
      title: t('whatsNew.item1Title'),
      desc: t('whatsNew.item1Desc'),
    },
    {
      icon: <Map size={18} color="#007AFF" />,
      title: t('whatsNew.item2Title'),
      desc: t('whatsNew.item2Desc'),
    },
    {
      icon: <Navigation size={18} color="#EB2323" />,
      title: t('whatsNew.item3Title'),
      desc: t('whatsNew.item3Desc'),
    },
    {
      icon: <SunMoon size={18} color="#FFD100" />,
      title: t('whatsNew.item4Title'),
      desc: t('whatsNew.item4Desc'),
    },
    {
      icon: <MessageSquare size={18} color="#9C27B0" />,
      title: t('whatsNew.item5Title'),
      desc: t('whatsNew.item5Desc'),
    },
  ];

  return (
    <div
      className="whats-new-modal-backdrop"
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
        aria-labelledby="whats-new-modal-title"
        className="glass-panel whats-new-modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(480px, 100%)',
          maxHeight: 'calc(100vh - 48px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))',
          borderRadius: '16px',
          background: 'var(--bg-glass, rgba(30, 30, 30, 0.85))',
          border: '1px solid var(--border-color)',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-color)',
            background: 'var(--bg-hover)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
            <AppBadge size={36} />
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h2
                  id="whats-new-modal-title"
                  style={{
                    fontSize: '1.05rem',
                    fontWeight: 800,
                    margin: 0,
                    color: 'var(--text-primary)',
                    lineHeight: 1.2,
                  }}
                >
                  {t('whatsNew.title')}
                </h2>
                <VersionPill style={{ fontSize: '0.7rem', padding: '2px 8px' }} />
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                {t('whatsNew.subtitle')}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="whats-new-close-icon-btn"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%',
              flexShrink: 0,
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Bullet Points Body */}
        <div
          style={{
            padding: '20px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <ul
            role="list"
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            {features.map((feature, idx) => (
              <li
                key={idx}
                role="listitem"
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  padding: '12px',
                  borderRadius: '12px',
                  background: 'var(--bg-hover)',
                  border: '1px solid var(--border-color)',
                }}
              >
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: 'rgba(0, 0, 0, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    marginTop: '2px',
                  }}
                >
                  {feature.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}>
                    {feature.title}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.4, marginTop: '4px' }}>
                    {feature.desc}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: '16px 20px',
            borderTop: '1px solid var(--border-color)',
            background: 'var(--bg-hover)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          {onOpenFeedback && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenFeedback();
              }}
              className="whats-new-contact-btn"
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '10px',
                border: '1px solid var(--border-color)',
                background: 'rgba(0, 122, 255, 0.08)',
                color: 'var(--accent-blue, #007AFF)',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'all 0.15s ease',
              }}
            >
              <MessageSquare size={15} />
              <span>{t('whatsNew.contactAuthorForMore')}</span>
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="whats-new-confirm-btn"
            style={{
              width: '100%',
              padding: '11px 16px',
              borderRadius: '10px',
              border: 'none',
              background: 'var(--accent-blue, #007AFF)',
              color: '#ffffff',
              fontSize: '0.88rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'opacity 0.15s ease',
            }}
          >
            <Check size={16} />
            <span>{t('whatsNew.close')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default WhatsNewModal;
