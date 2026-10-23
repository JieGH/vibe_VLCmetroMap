import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import WhatsNew, { WhatsNewSheet } from './WhatsNew';
import { CHANGELOG } from '../data/changelog';

describe('WhatsNew banner', () => {
  it('shows a small What\'s new button on a first visit', () => {
    const html = renderToStaticMarkup(<WhatsNew />);
    expect(html).toContain('whats-new-banner');
    expect(html).toContain('What&#x27;s new');
    // The changelog itself stays closed until the banner is pressed.
    expect(html).not.toContain('whats-new-sheet');
  });

  it('shows nothing while something else owns the bottom of the screen', () => {
    expect(renderToStaticMarkup(<WhatsNew hidden />)).toBe('');
  });
});

describe('WhatsNewSheet', () => {
  it('lists the latest release with its title and every item', () => {
    const html = renderToStaticMarkup(<WhatsNewSheet onClose={() => {}} />);
    const latest = CHANGELOG[0].en;
    expect(html).toContain('role="dialog"');
    expect(html).toContain(latest.title);
    for (const item of latest.items) {
      expect(html).toContain(item.replace(/'/g, '&#x27;'));
    }
  });
});
