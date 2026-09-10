import React, { useEffect, useState } from 'react';
import { ChevronLeft, Info, Languages } from 'lucide-react';
import { FONT_SIZE_CONFIG } from '../utils/fontSize';
import { MOBILE_BREAKPOINT_PX } from '../utils/layout';
import { useDragToDismiss } from '../utils/useDragToDismiss';
import { useTranslation, SUPPORTED_LANGUAGES } from '../i18n';

const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= MOBILE_BREAKPOINT_PX
  );
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT_PX);
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);
  return isMobile;
};

const Sidebar = ({
  isOpen,
  onToggleSidebar,
  trainStats = { live: 0, confirmed: 0 },
  onOpenAbout,
  fontSize = 'default',
  onSelectFontSize,
}) => {
  const isMobile = useIsMobile();
  const { t, language, setLanguage } = useTranslation();
  const { handleProps, cardStyle: dragStyle } = useDragToDismiss({
    onDismiss: onToggleSidebar,
    enabled: isMobile && isOpen,
    threshold: 70,
  });

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (e.defaultPrevented) return;
        if (typeof document !== 'undefined' && document.querySelector('[role="dialog"]')) return;
        onToggleSidebar();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onToggleSidebar]);

  return (
    <>
      {/* Backdrop for closing menu card by tapping outside on the map */}
      <div
        className={`sidebar-backdrop ${isOpen ? 'active' : ''}`}
        onClick={onToggleSidebar}
        aria-hidden="true"
        data-testid="sidebar-backdrop"
      />

      {/* Sidebar Container */}
      <div 
        className={`sidebar glass-panel ${!isOpen ? 'collapsed' : ''}`} 
        style={{ padding: '20px', ...dragStyle }}
      >
        {/* Mobile drag handle for swipe-down dismiss */}
        <div
          className="sheet-drag-handle-wrap mobile-only-drag-handle"
          data-testid="sidebar-drag-handle"
          {...handleProps}
        >
          <div className="sheet-drag-handle" />
        </div>

        <div
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}
          {...(isMobile ? handleProps : {})}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '10px',
              background: 'linear-gradient(135deg, #FFD100 0%, #E2001A 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, color: '#fff', fontSize: '1.1rem'
            }}>
              V
            </div>
            <div>
              <h1 style={{ fontSize: '1.1rem', fontWeight: 700, letterSpacing: '-0.3px' }}>Xarxa</h1>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{t('sidebar.subtitle')}</div>
            </div>
          </div>

          <button 
            onClick={onToggleSidebar}
            onPointerDown={(e) => e.stopPropagation()}
            style={{ 
              padding: '6px', 
              borderRadius: '8px', 
              background: 'var(--bg-hover)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
            title={isOpen ? t('sidebar.collapseSidebar') : t('sidebar.expandSidebar')}
          >
            <ChevronLeft size={20} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Font Size Adjustment Control */}
          <div className="sidebar-font-size-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <h2 style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)' }}>
                {t('sidebar.textSize')}
              </h2>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                {t(`sidebar.fontSize.${FONT_SIZE_CONFIG[fontSize] ? fontSize : 'default'}`)}
              </span>
            </div>
            <div className="font-size-control-group" role="group" aria-label={t('sidebar.textSizeSelectionAria')}>
              {Object.values(FONT_SIZE_CONFIG).map((opt) => {
                const isSelected = fontSize === opt.id;
                const label = t(`sidebar.fontSize.${opt.id}`);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onSelectFontSize && onSelectFontSize(opt.id)}
                    className={`font-size-option-btn ${isSelected ? 'active' : ''}`}
                    aria-pressed={isSelected}
                    aria-label={t('sidebar.fontSizeOptionTitle', { label })}
                    title={t('sidebar.fontSizeOptionTitle', { label })}
                  >
                    <span className="font-size-option-preview" style={{ fontSize: `${opt.scale * 0.85}rem` }}>
                      Aa
                    </span>
                    <span className="font-size-option-label">{opt.shortLabel}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Language Selection Control */}
          <div className="sidebar-language-section" style={{ paddingTop: '8px' }}>
            <h2 style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
              <Languages size={12} style={{ verticalAlign: '-1px', marginRight: '4px' }} />
              {t('sidebar.language')}
            </h2>
            <div className="lang-option-group" role="group" aria-label={t('sidebar.language')}>
              {SUPPORTED_LANGUAGES.map((lang) => {
                const isSelected = language === lang;
                const name = t(`sidebar.languageNames.${lang}`);
                return (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => setLanguage(lang)}
                    className={`lang-option-btn ${isSelected ? 'active' : ''}`}
                    aria-pressed={isSelected}
                    aria-label={t('sidebar.languageOptionAria', { language: name })}
                    title={name}
                  >
                    <span className="lang-option-preview">{lang.toUpperCase()}</span>
                    <span className="lang-option-label">{name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Live Stats & Footer */}
          <div style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
            <h2 style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
              {t('sidebar.liveNetwork')}
            </h2>
            <div style={{ display: 'flex', gap: '8px' }}>
              <div style={{
                flex: 1, padding: '10px 12px', borderRadius: '10px',
                background: 'var(--bg-hover)', textAlign: 'center',
              }}>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#4CAF50', lineHeight: 1 }}>
                  {trainStats.live}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  {t('sidebar.liveTrains')}
                </div>
              </div>
              <div style={{
                flex: 1, padding: '10px 12px', borderRadius: '10px',
                background: 'var(--bg-hover)', textAlign: 'center',
              }}>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#FFD100', lineHeight: 1 }}>
                  {trainStats.confirmed}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  {t('sidebar.confirmed')}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '8px', lineHeight: 1.5 }}>
              <span>{t('sidebar.systemLabel')}</span>
              <span style={{ opacity: 0.6, fontVariantNumeric: 'tabular-nums' }}>v{__APP_VERSION__}</span>
            </div>

            <button
              type="button"
              onClick={onOpenAbout}
              aria-label={t('sidebar.aboutLegalAria')}
              style={{
                marginTop: '12px',
                width: '100%',
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-hover)',
                color: 'var(--text-secondary)',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                transition: 'all 0.2s ease',
              }}
              className="about-legal-btn"
            >
              <Info size={14} />
              <span>{t('sidebar.aboutLegalButton')}</span>
            </button>
          </div>

        </div>
      </div>
    </>
  );
};

export default Sidebar;

