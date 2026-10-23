import React, { useState, useEffect } from 'react';
import { Sparkles, X } from 'lucide-react';
import { CHANGELOG } from '../data/changelog';
import { hasSeenLatestRelease, markLatestReleaseSeen } from '../utils/whatsNew';
import { useTranslation } from '../i18n';

/** The changelog itself: every release, newest first, in the viewer's language. */
export const WhatsNewSheet = ({ onClose }) => {
  const { t, language } = useTranslation();
  const lang = language === 'es' ? 'es' : 'en';

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
    <div className="whats-new-backdrop" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="whats-new-title"
        className="glass-panel whats-new-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="whats-new-header">
          <h2 id="whats-new-title">{t('whatsNew.sheetTitle')}</h2>
          <button type="button" className="whats-new-close" onClick={onClose} aria-label={t('whatsNew.closeAria')}>
            <X size={18} />
          </button>
        </div>
        <div className="whats-new-body">
          {CHANGELOG.map((entry) => (
            <section key={entry.id}>
              <div className="whats-new-date">{entry.date}</div>
              <h3>{entry[lang].title}</h3>
              <ul>
                {entry[lang].items.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </section>
          ))}
        </div>
        <button type="button" className="whats-new-done" onClick={onClose}>{t('whatsNew.done')}</button>
      </div>
    </div>
  );
};

/**
 * A small banner at the bottom of the map. Pressing it opens the changelog;
 * closing the changelog marks this release as seen and the banner goes away
 * until a newer release is announced.
 */
const WhatsNew = ({ hidden = false }) => {
  const { t } = useTranslation();
  const [seen, setSeen] = useState(hasSeenLatestRelease);
  const [open, setOpen] = useState(false);

  const close = () => {
    markLatestReleaseSeen();
    setSeen(true);
    setOpen(false);
  };

  return (
    <>
      {!seen && !hidden && !open && (
        <button type="button" className="whats-new-banner glass-panel" onClick={() => setOpen(true)}>
          <Sparkles size={14} color="#FFD100" />
          <span>{t('whatsNew.banner')}</span>
        </button>
      )}
      {open && <WhatsNewSheet onClose={close} />}
    </>
  );
};

export default WhatsNew;
