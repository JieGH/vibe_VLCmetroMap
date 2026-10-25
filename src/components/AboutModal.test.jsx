import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import AboutModal from './AboutModal';
import { containsRepoUrls } from '../utils/legalInfo';

describe('AboutModal component', () => {
  it('renders nothing when isOpen is false', () => {
    const html = renderToStaticMarkup(<AboutModal isOpen={false} onClose={() => {}} />);
    expect(html).toBe('');
  });

  it('renders legal, copyright, and attributions when isOpen is true', () => {
    const html = renderToStaticMarkup(<AboutModal isOpen={true} onClose={() => {}} />);
    expect(html).toBeTruthy();

    // App identity and branding
    expect(html).toContain('Xarxa');
    expect(html).toContain('Real-Time Transit Tracker');

    // Copyright and all-rights-reserved license terms
    expect(html).toContain('© 2026 Jie Lei');
    expect(html).toContain('All rights reserved');

    // Third-party legal attributions
    expect(html).toContain('Ferrocarrils de la Generalitat Valenciana (FGV)');
    expect(html).toContain('OpenStreetMap contributors');
    expect(html).toContain('ODbL');
    expect(html).toContain('Protomaps');
    expect(html).toContain('MapLibre GL');

    // Privacy disclosures
    expect(html).toContain('Privacy &amp; Device Data');
    expect(html).toContain('on-device');
    expect(html).toContain('Zero telemetry');
  });

  it('strictly excludes raw developer repository links from client markup', () => {
    const html = renderToStaticMarkup(<AboutModal isOpen={true} onClose={() => {}} />);
    expect(containsRepoUrls(html)).toBe(false);
  });

  it('states plainly that the app is unofficial', () => {
    const html = renderToStaticMarkup(<AboutModal isOpen={true} onClose={() => {}} />);
    expect(html).toContain('not affiliated with or endorsed by FGV/Metrovalencia');
  });
});
