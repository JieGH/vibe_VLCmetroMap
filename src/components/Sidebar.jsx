import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Info, LayoutDashboard, Mail, Minus, Plus, Sun, Moon, SunMoon } from 'lucide-react';
import { FONT_SIZE_CONFIG, FONT_SIZES } from '../utils/fontSize';
import { MOBILE_BREAKPOINT_PX } from '../utils/layout';
import { useDragToDismiss } from '../utils/useDragToDismiss';
import { useTranslation, SUPPORTED_LANGUAGES, languageCode } from '../i18n';
import { isAndroid } from '../utils/platform';
import { Capacitor } from '@capacitor/core';
import AppBadge, { VersionPill } from './AppBadge';
import { AUTHOR_NAME, CONTACT_EMAIL } from '../utils/contact';
import { AndroidIcon, AppDownloadSheet } from './AppDownloadBanner';
import { isIosDevice } from '../utils/appDownload';

// Icon-only buttons: sun, moon, and a half-sun-half-moon for "follow the phone".
const THEME_MODES = [
  { id: 'light', key: 'themeLight', Icon: Sun },
  { id: 'dark', key: 'themeDark', Icon: Moon },
  { id: 'system', key: 'themeAuto', Icon: SunMoon },
];

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
  onOpenDashboard,
  onOpenAppDownload,
  fontSize = 'default',
  onSelectFontSize,
  themeMode = 'system',
  onSelectTheme,
}) => {
  const isMobile = useIsMobile();
  const [internalDownloadOpen, setInternalDownloadOpen] = useState(false);
  const offerable = typeof navigator !== 'undefined' && !Capacitor.isNativePlatform() && !isAndroid();
  const ios = typeof navigator !== 'undefined' && isIosDevice(navigator.userAgent, navigator.maxTouchPoints);

  const handleOpenDownload = () => {
    if (onOpenAppDownload) {
      onOpenAppDownload();
    } else {
      setInternalDownloadOpen(true);
    }
  };
  // On Android the sidebar is a modal navigation drawer; say so to TalkBack.
  const drawerAria = isAndroid()
    ? { role: 'dialog', 'aria-modal': isOpen ? 'true' : undefined, 'aria-label': 'Xarxa', 'aria-hidden': isOpen ? undefined : 'true' }
    : {};
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
        {...drawerAria}
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
            <AppBadge size={40} />
            <div>
              <h1 style={{ fontSize: '1.1rem', fontWeight: 700, letterSpacing: '-0.3px' }}>Xarxa</h1>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{t('sidebar.subtitle')}</div>
            </div>
          </div>

          <button 
            onClick={onToggleSidebar}
            onPointerDown={(e) => e.stopPropagation()}
            className="sidebar-close-btn"
            aria-label={isOpen ? t('sidebar.collapseSidebar') : t('sidebar.expandSidebar')}
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
          {/* Settings row: Text size, Appearance, and Language as three compact toggles */}
          <div className="sidebar-compact-row sidebar-settings-row">
            {/* Text size: a stepper showing S / M / L / XL */}
            <div className="sidebar-font-size-section">
              {(() => {
                const current = FONT_SIZE_CONFIG[fontSize] ? fontSize : 'default';
                const index = FONT_SIZES.indexOf(current);
                const step = (delta) => onSelectFontSize && onSelectFontSize(FONT_SIZES[index + delta]);
                return (
                  <div className="size-stepper segmented-control" role="group" aria-label={t('sidebar.textSizeSelectionAria')}>
                    <button
                      type="button"
                      className="size-stepper-btn"
                      onClick={() => step(-1)}
                      disabled={index <= 0}
                      aria-label={t('sidebar.textSmaller')}
                      title={t('sidebar.textSmaller')}
                    >
                      <Minus size={15} aria-hidden="true" />
                    </button>
                    <span
                      className="size-stepper-value"
                      aria-live="polite"
                      title={t(`sidebar.fontSize.${current}`)}
                      aria-label={t(`sidebar.fontSize.${current}`)}
                    >
                      {FONT_SIZE_CONFIG[current].shortLabel}
                    </span>
                    <button
                      type="button"
                      className="size-stepper-btn"
                      onClick={() => step(1)}
                      disabled={index >= FONT_SIZES.length - 1}
                      aria-label={t('sidebar.textLarger')}
                      title={t('sidebar.textLarger')}
                    >
                      <Plus size={15} aria-hidden="true" />
                    </button>
                  </div>
                );
              })()}
            </div>

            {/* Appearance: sun, moon, or follow the phone, as icons */}
            <div className="sidebar-appearance-section">
              <div className="theme-icon-group segmented-control" role="group" aria-label={t('sidebar.appearanceAria')}>
                {THEME_MODES.map(({ id, key, Icon }) => {
                  const isSelected = themeMode === id;
                  const label = t(`sidebar.${key}`);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => onSelectTheme && onSelectTheme(id)}
                      className={`theme-icon-btn ${isSelected ? 'active' : ''}`}
                      aria-pressed={isSelected}
                      aria-label={label}
                      title={label}
                    >
                      <Icon size={16} aria-hidden="true" />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Language: EN, ES, VAL as compact toggles */}
            <div className="sidebar-language-section">
              <div className="lang-icon-group segmented-control" role="group" aria-label={t('sidebar.language')}>
                {SUPPORTED_LANGUAGES.map((lang) => {
                  const isSelected = language === lang;
                  const name = t(`sidebar.languageNames.${lang}`);
                  return (
                    <button
                      key={lang}
                      type="button"
                      onClick={() => setLanguage(lang)}
                      className={`lang-icon-btn ${isSelected ? 'active' : ''}`}
                      aria-pressed={isSelected}
                      aria-label={t('sidebar.languageOptionAria', { language: name })}
                      title={name}
                    >
                      <span className="lang-code-text">{languageCode(lang)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {onOpenDashboard && (
            <button
              type="button"
              onClick={onOpenDashboard}
              title={t('app.dashboardModeTitle')}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px', width: '100%', minHeight: '44px',
                padding: '8px 12px', borderRadius: '10px', border: '1px solid var(--border-color)',
                background: 'var(--bg-hover)', color: 'var(--text-primary)', fontSize: '0.85rem', fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <LayoutDashboard size={16} aria-hidden="true" />
              {t('sidebar.dashboard')}
            </button>
          )}

          {offerable && (
            <button
              type="button"
              onClick={handleOpenDownload}
              className="sidebar-android-btn"
              aria-label={t('sidebar.androidAppAria')}
              title={t('sidebar.androidApp')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                width: '100%',
                padding: '10px 12px',
                borderRadius: '10px',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-hover)',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: 'rgba(61, 220, 132, 0.12)',
                  flexShrink: 0,
                }}
              >
                <AndroidIcon size={20} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, lineHeight: 1.3 }}>
                  {t('sidebar.androidApp')}
                </div>
                <div style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', lineHeight: 1.3, marginTop: '2px' }}>
                  {t('sidebar.androidAppDesc')}
                </div>
              </div>
              <ChevronRight size={16} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} aria-hidden="true" />
            </button>
          )}

          {internalDownloadOpen && createPortal(
            <AppDownloadSheet ios={ios} onClose={() => setInternalDownloadOpen(false)} />,
            document.body
          )}

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
              <VersionPill />
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
              className="about-legal-btn sidebar-about-btn"
            >
              <Info size={14} />
              <span>{t('sidebar.aboutLegalButton')}</span>
            </button>

            {/* The author's signature and where to write */}
            <div className="sidebar-signature">
              <span className="sidebar-signature-by">{t('sidebar.madeBy')}</span>
              <span className="sidebar-signature-name">{AUTHOR_NAME}</span>
              <a
                className="sidebar-signature-mail"
                href={`mailto:${CONTACT_EMAIL}`}
                aria-label={t('sidebar.contactAria', { email: CONTACT_EMAIL })}
              >
                <Mail size={13} aria-hidden="true" />
                {CONTACT_EMAIL}
              </a>
            </div>
          </div>

        </div>
      </div>
    </>
  );
};

export default Sidebar;

