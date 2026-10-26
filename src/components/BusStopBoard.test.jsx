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

  it('renders dedicated EMT stop departure board with stop code, LIVE status, and lines', () => {
    const html = renderToStaticMarkup(
      <BusStopBoard stop={sampleStop} theme="dark" onClose={() => {}} />
    );

    expect(html).toContain('bus-stop-board');
    expect(html).toContain('glass-panel');
    expect(html).toContain('EMT');
    expect(html).toContain('P-1002');
    expect(html).toContain('LIVE');
    expect(html).toContain('Colón - Pascual i Genís');
    expect(html).toContain('19');
    expect(html).toContain('C1');
    expect(html).toContain('92');
    expect(html).toContain('Línia');
    expect(html).toContain('Destinació');
    expect(html).toContain('Temps');
    expect(html).toContain('data-testid="bus-drag-handle"');
  });

  it('renders expand and close buttons', () => {
    const html = renderToStaticMarkup(
      <BusStopBoard stop={sampleStop} theme="dark" onClose={() => {}} />
    );

    expect(html).toContain('aria-label="Expand bus stop panel"');
    expect(html).toContain('aria-label="Close bus stop board"');
  });
});
