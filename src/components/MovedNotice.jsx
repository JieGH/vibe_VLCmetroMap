import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Capacitor } from '@capacitor/core';
import { useTranslation } from '../i18n';
import { newAddressFor, isPostponed, postpone } from '../utils/movedNotice';

/** On a retired address: say the site has moved and link to the same page on the new one. */
const MovedNotice = () => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(() => (
    typeof window !== 'undefined' && !Capacitor.isNativePlatform()
    && Boolean(newAddressFor(window.location)) && !isPostponed()
  ));
  const target = typeof window !== 'undefined' ? newAddressFor(window.location) : null;

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); postpone(); setOpen(false); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  if (!open || !target) return null;
  const later = () => { postpone(); setOpen(false); };

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
