import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import BusBadge from './BusBadge';

describe('BusBadge component', () => {
  it('renders line number without EMT prefix badge by default', () => {
    const html = renderToStaticMarkup(<BusBadge line="19" />);
    expect(html).toContain('19');
    expect(html).not.toContain('EMT');
    expect(html).toContain('bus-badge-radial');
  });

  it('renders circular line as circular badge without EMT prefix', () => {
    const html = renderToStaticMarkup(<BusBadge line="C1" type="circular" />);
    expect(html).toContain('C1');
    expect(html).not.toContain('EMT');
    expect(html).toContain('bus-badge-circular');
  });

  it('renders clean numeric badge for night bus', () => {
    const html = renderToStaticMarkup(<BusBadge line="N1" type="night" />);
    expect(html).toContain('N1');
    expect(html).not.toContain('EMT');
  });
});
