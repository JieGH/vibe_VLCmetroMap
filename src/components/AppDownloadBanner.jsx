import React, { useState, useEffect } from 'react';
import { Smartphone, X } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { useTranslation } from '../i18n';
import {
  APK_URL, RELEASE_URL, isIosDevice, wasBannerDismissed, rememberBannerDismissed,
} from '../utils/appDownload';

/** Why the app is better than this website, and where to get it. */
export const AppDownloadSheet = ({ onClose }) => {
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
          <p>{t('appBanner.why')}</p>
          <p>{t('appBanner.websiteLimit')}</p>
          <a className="app-banner-download" href={APK_URL}>{t('appBanner.download')}</a>
          <p className="app-banner-note">{t('appBanner.installNote')}</p>
          <p className="app-banner-note">{t('appBanner.iphoneNote')}</p>
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
 * A small banner at the bottom of the map inviting visitors to the app.
 * Pressing it opens the explanation; its own close button hides it for good.
 * Never shown on iPhone (no download exists) or inside the native app.
 */
const AppDownloadBanner = ({ hidden = false }) => {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(wasBannerDismissed);
  const [open, setOpen] = useState(false);

  const offerable =
    typeof navigator !== 'undefined' &&
    !isIosDevice(navigator.userAgent, navigator.maxTouchPoints) &&
    !Capacitor.isNativePlatform();

  const dismiss = (e) => {
    e.stopPropagation();
    rememberBannerDismissed();
    setDismissed(true);
  };

  return (
    <>
      {offerable && !dismissed && !hidden && !open && (
        <div className="app-banner glass-panel">
          <button type="button" className="app-banner-open" onClick={() => setOpen(true)}>
            <Smartphone size={14} color="#FFD100" />
            <span>{t('appBanner.banner')}</span>
          </button>
          <button type="button" className="app-banner-x" onClick={dismiss} aria-label={t('appBanner.dismissAria')}>
            <X size={13} />
          </button>
        </div>
      )}
      {open && <AppDownloadSheet onClose={() => setOpen(false)} />}
    </>
  );
};

export default AppDownloadBanner;
