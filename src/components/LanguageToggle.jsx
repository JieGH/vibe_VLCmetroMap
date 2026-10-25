import React from 'react';
import { useTranslation, SUPPORTED_LANGUAGES, languageCode } from '../i18n';

/** One button that shows the current language and moves to the next on each press. */
const LanguageToggle = ({ className = '', style }) => {
  const { t, language, setLanguage } = useTranslation();
  const index = Math.max(0, SUPPORTED_LANGUAGES.indexOf(language));
  const next = SUPPORTED_LANGUAGES[(index + 1) % SUPPORTED_LANGUAGES.length];
  const nextName = t(`sidebar.languageNames.${next}`);

  return (
    <button
      type="button"
      className={className}
      style={style}
      onClick={() => setLanguage(next)}
      title={t('sidebar.languageOptionAria', { language: nextName })}
      aria-label={t('sidebar.languageOptionAria', { language: nextName })}
    >
      <span style={{ fontSize: '0.74rem', fontWeight: 800, letterSpacing: '0.3px', lineHeight: 1 }}>
        {languageCode(language)}
      </span>
    </button>
  );
};

export default LanguageToggle;
