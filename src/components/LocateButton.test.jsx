import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import LocateButton from './LocateButton';

describe('LocateButton component', () => {
  it('renders idle locate button with accessible labels and fixed mid-right class', () => {
    const html = renderToStaticMarkup(
      <LocateButton state="idle" showingLocation={false} onLocate={() => {}} onHide={() => {}} />
    );

    expect(html).toContain('locate-button');
    expect(html).toContain('glass-panel');
    expect(html).toContain('data-state="idle"');
    expect(html).toContain('Centre on me and show my nearest station');
    expect(html).not.toContain('disabled');
  });

  it('renders disabled button with spinner when locating', () => {
    const html = renderToStaticMarkup(
      <LocateButton state="locating" showingLocation={false} onLocate={() => {}} onHide={() => {}} />
    );

    expect(html).toContain('data-state="locating"');
    expect(html).toContain('disabled=""');
    expect(html).toContain('Finding your location…');
    expect(html).toContain('spin');
  });

  it('renders unavailable state label when location unavailable', () => {
    const html = renderToStaticMarkup(
      <LocateButton state="unavailable" showingLocation={false} onLocate={() => {}} onHide={() => {}} />
    );

    expect(html).toContain('data-state="unavailable"');
    expect(html).toContain('Location is unavailable — tap for details');
  });

  it('advertises hold-to-hide hint when showing location', () => {
    const html = renderToStaticMarkup(
      <LocateButton state="idle" showingLocation={true} onLocate={() => {}} onHide={() => {}} />
    );

    expect(html).toContain('hold to hide your location');
  });

  it('does not apply dynamic inline style overrides', () => {
    const html = renderToStaticMarkup(
      <LocateButton state="idle" showingLocation={false} onLocate={() => {}} onHide={() => {}} />
    );

    // Dynamic style computation should be removed in favor of fixed CSS mid-right positioning
    expect(html).not.toContain('style=');
  });
});
