import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import StationPanel from './StationPanel';

describe('StationPanel component', () => {
  const sampleStation = {
    properties: {
      name: 'Xàtiva',
      lines: ['3', '5', '9'],
      apiId: 10,
    },
  };

  it('renders nothing when station is null', () => {
    const html = renderToStaticMarkup(
      <StationPanel station={null} theme="dark" onClose={() => {}} onCenter={() => {}} />
    );
    expect(html).toBe('');
  });

  it('renders as a floating card with margins and uniform rounded corners in portrait', () => {
    const html = renderToStaticMarkup(
      <StationPanel station={sampleStation} theme="dark" onClose={() => {}} onCenter={() => {}} />
    );
    expect(html).toBeTruthy();

    // Renders the station panel container with glass-panel utility
    expect(html).toContain('glass-panel');
    expect(html).toContain('station-panel');
    expect(html).toContain('data-landscape="false"');

    // Floating card positioning matching the menu card: 12px gap from left/right/bottom
    expect(html).toContain('left:12px');
    expect(html).toContain('right:12px');
    expect(html).toContain('bottom:calc(12px + env(safe-area-inset-bottom, 0px))');
    expect(html).toContain('border-radius:16px');

    // Station name rendered
    expect(html).toContain('Xàtiva');
  });

  it('renders station-backdrop behind the floating card for dismiss on outside tap', () => {
    const html = renderToStaticMarkup(
      <StationPanel station={sampleStation} theme="dark" onClose={() => {}} onCenter={() => {}} />
    );

    expect(html).toContain('station-backdrop');
    expect(html).toContain('data-testid="station-backdrop"');
  });
});
