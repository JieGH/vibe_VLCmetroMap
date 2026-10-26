import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import BusStopBoard from './BusStopBoard';

describe('BusStopBoard component', () => {
  const sampleStop = {
    stopCode: '1002',
    stopName: 'Colón - Pascual i Genís',
    lines: ['19', 'C1', '92'],
    coordinates: [-0.375, 39.469],
  };

  it('renders nothing when stop is null', () => {
    const html = renderToStaticMarkup(
      <BusStopBoard stop={null} onClose={() => {}} />
    );
    expect(html).toBe('');
  });

  it('renders dedicated EMT stop departure board matching StationPanel layout with stop code, LIVE status, and lines', () => {
    const html = renderToStaticMarkup(
      <BusStopBoard stop={sampleStop} theme="dark" onClose={() => {}} />
    );

    expect(html).toContain('station-panel');
    expect(html).toContain('bus-stop-board');
    expect(html).toContain('glass-panel');
    expect(html).toContain('data-testid="station-header-icon"');
    expect(html).toContain('EMT');
    expect(html).toContain('P-1002');
    expect(html).toContain('Colón - Pascual i Genís');
    expect(html).toContain('station-header-line-badge');
    expect(html).toContain('>19<');
    expect(html).toContain('>C1<');
    expect(html).toContain('>92<');
    expect(html).toContain('station-arrivals-table');
    expect(html).toContain('data-testid="station-drag-handle"');
  });

  it('renders expand and close buttons matching StationPanel design', () => {
    const html = renderToStaticMarkup(
      <BusStopBoard stop={sampleStop} theme="dark" onClose={() => {}} />
    );

    expect(html).toContain('station-panel-expand');
    expect(html).toContain('station-panel-close');
    expect(html).toContain('aria-label="Expand station panel"');
  });
});
