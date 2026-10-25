import React, { useEffect } from 'react';
import { useTranslation } from '../i18n';

/**
 * Material-style dialog shown on Android before the first system location
 * prompt. Class names carry the `md-` prefix so android.css can style them; the
 * inline styles are only the minimum to be usable unstyled.
 */
const LocationRationale = ({ onAllow, onDecline }) => {
  const { t } = useTranslation();

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onDecline();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onDecline]);

  return (
    <div
      className="md-dialog-scrim"
      onClick={onDecline}
      style={{ position: 'fixed', inset: 0, zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}
    >
      <div
        className="md-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="md-location-rationale-title"
        aria-describedby="md-location-rationale-body"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 'min(90vw, 360px)', padding: 24, borderRadius: 28, background: 'var(--bg-panel, #1D1D29)', color: 'var(--text-main, #fff)' }}
      >
        <h2 id="md-location-rationale-title" className="md-dialog-title">{t('locate.rationaleTitle')}</h2>
        <p id="md-location-rationale-body" className="md-dialog-body">{t('locate.rationaleBody')}</p>
        <div className="md-dialog-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="md-button md-button-text" onClick={onDecline}>
            {t('locate.rationaleDecline')}
          </button>
          <button type="button" className="md-button md-button-filled" onClick={onAllow} autoFocus>
            {t('locate.rationaleAllow')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LocationRationale;
