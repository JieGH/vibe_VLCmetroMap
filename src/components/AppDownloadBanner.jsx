import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Check, X } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { useTranslation } from '../i18n';
import { isAndroid } from '../utils/platform';
import { APK_URL, RELEASE_URL, isIosDevice } from '../utils/appDownload';

/** The Android robot's head, in Android green: the icon the top-bar button wears. */
export const AndroidIcon = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <g fill="#3DDC84">
      <path d="M6 9.5h12v8.2a1.3 1.3 0 0 1-1.3 1.3h-1v2.2a1.1 1.1 0 0 1-2.2 0V19h-3V21.2a1.1 1.1 0 0 1-2.2 0V19h-1A1.3 1.3 0 0 1 6 17.7z" />
      <path d="M3.6 9.8a1.1 1.1 0 0 1 2.2 0v5.2a1.1 1.1 0 0 1-2.2 0zM18.2 9.8a1.1 1.1 0 0 1 2.2 0v5.2a1.1 1.1 0 0 1-2.2 0z" />
      <path d="M6.2 8.6a5.8 5.8 0 0 1 11.6 0zM8.2 3.2l-1.3-1.9a.45.45 0 0 1 .75-.5l1.35 2a6.6 6.6 0 0 1 5.9 0l1.35-2a.45.45 0 1 1 .75.5l-1.3 1.9" />
    </g>
    <circle cx="9.6" cy="6.2" r=".8" fill="#fff" />
    <circle cx="14.4" cy="6.2" r=".8" fill="#fff" />
  </svg>
);

/** What the app gives you, how to get it, in plain words. */
export const AppDownloadSheet = ({ onClose, ios = false }) => {
  const { t } = useTranslation();

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const benefits = ['benefit1', 'benefit2', 'benefit3'];
  const steps = ['step1', 'step2', 'step3'];

  return (
    <div className="app-banner-backdrop" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-banner-title"
        className="glass-panel app-banner-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="app-banner-header">
          <h2 id="app-banner-title">{t('appBanner.sheetTitle')}</h2>
          <button type="button" className="app-banner-close" onClick={onClose} aria-label={t('appBanner.dismissAria')}>
            <X size={18} />
          </button>
        </div>
        <div className="app-banner-body">
          <p className="app-banner-intro">{t('appBanner.intro')}</p>
          <ul className="app-banner-benefits">
            {benefits.map((key) => (
              <li key={key}>
                <Check size={16} aria-hidden="true" />
                <span>{t(`appBanner.${key}`)}</span>
              </li>
            ))}
          </ul>
          {ios ? (
            <p className="app-banner-note">{t('appBanner.iphoneNote')}</p>
          ) : (
            <>
              <h3 className="app-banner-steps-title">{t('appBanner.stepsTitle')}</h3>
              <ol className="app-banner-steps">
                {steps.map((key) => <li key={key}>{t(`appBanner.${key}`)}</li>)}
              </ol>
              <a className="app-banner-download" href={APK_URL}>{t('appBanner.download')}</a>
              <p className="app-banner-note">{t('appBanner.installNote')}</p>
              <p className="app-banner-note">{t('appBanner.iphoneNote')}</p>
            </>
          )}
          <a className="app-banner-link" href={RELEASE_URL} target="_blank" rel="noopener noreferrer">
            {t('appBanner.releaseNotes')}
          </a>
        </div>
        <button type="button" className="app-banner-done" onClick={onClose}>{t('appBanner.done')}</button>
      </div>
    </div>
  );
};

/**
 * The Android icon in the top bar. Pressing it opens the explanation and the
 * download. Shown everywhere except inside the native app, which is already the
 * app. On iPhone the sheet has no download button, because no iOS download exists.
 */
const AppDownloadButton = ({ className = '', style }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const offerable = typeof navigator !== 'undefined' && !Capacitor.isNativePlatform() && !isAndroid();
  const ios = typeof navigator !== 'undefined' && isIosDevice(navigator.userAgent, navigator.maxTouchPoints);
  if (!offerable) return null;

  return (
    <>
      <button
        type="button"
        className={className}
        style={style}
        onClick={() => setOpen(true)}
        title={t('appBanner.buttonLabel')}
        aria-label={t('appBanner.buttonLabel')}
        aria-haspopup="dialog"
      >
        <AndroidIcon size={18} />
      </button>
      {/* In a portal: the top bar's glass panel has a backdrop-filter, which would make this fixed overlay
          position itself against the bar instead of the screen. */}
      {open && createPortal(<AppDownloadSheet ios={ios} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
};

export default AppDownloadButton;
