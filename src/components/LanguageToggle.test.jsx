import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import LanguageToggle from './LanguageToggle';
import { I18nProvider } from '../i18n';

describe('LanguageToggle', () => {
  it('shows the current language code and names the language a press switches to', () => {
    const html = renderToStaticMarkup(<I18nProvider><LanguageToggle className="topbar-icon-btn" /></I18nProvider>);
    expect(html).toContain('topbar-icon-btn');
    expect(html).toContain('>ES<');
    expect(html).toContain('Valencià');
  });
});
