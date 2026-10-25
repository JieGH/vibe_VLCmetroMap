import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Capacitor } from '@capacitor/core';
import { useTranslation } from '../i18n';
import { newAddressFor, MOVED_REMIND_MS } from '../utils/movedNotice';

/**
 * On a retired address: say the site has moved and link to the same page on the new one. It opens on every
 * visit, and after "Not now" it comes back an hour later if the page is still open.
 */
const MovedNotice = () => {
  const { t } = useTranslation();
  const target = typeof window !== 'undefined' && !Capacitor.isNativePlatform() ? newAddressFor(window.location) : null;
  const [open, setOpen] = useState(Boolean(target));

  const later = () => setOpen(false);

  // Hidden for now: ask again in an hour.
  useEffect(() => {
    if (open || !target) return undefined;
    const timer = setTimeout(() => setOpen(true), MOVED_REMIND_MS);
    return () => clearTimeout(timer);
  }, [open, target]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); later(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  if (!open || !target) return null;

  return createPortal(
    <div className="app-banner-backdrop" onClick={later}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="moved-notice-title"
        className="glass-panel app-banner-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="app-banner-header">
          <h2 id="moved-notice-title">{t('movedNotice.title')}</h2>
        </div>
        <div className="app-banner-body">
          <p className="app-banner-intro">{t('movedNotice.body')}</p>
          <p className="app-banner-note">{t('movedNotice.bookmark')}</p>
          <a className="app-banner-download" href={target}>{t('movedNotice.go')}</a>
        </div>
        <button type="button" className="app-banner-done" onClick={later}>{t('movedNotice.later')}</button>
      </div>
    </div>,
    document.body,
  );
};

export default MovedNotice;
