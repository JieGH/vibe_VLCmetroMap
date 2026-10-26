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

  it('renders EMT emblem with rounded rectangular border radius instead of circle', () => {
    const html = renderToStaticMarkup(
      <BusStopBoard stop={sampleStop} theme="dark" onClose={() => {}} />
    );

    expect(html).toContain('data-testid="station-header-icon"');
    expect(html).toMatch(/data-testid="station-header-icon"[^>]*border-radius:8px/);
    expect(html).not.toMatch(/data-testid="station-header-icon"[^>]*border-radius:50%/);
  });

  it('renders safely when stop.lines contains arrival objects from feeder transfers', () => {
    const feederStop = {
      stopCode: '1002',
      stopName: 'Carrer de Xàtiva - Estació del Nord',
      lines: [
        { line: '19', destination: 'La Malva-rosa', dueSeconds: 110 },
        { line: 'C1', destination: 'Centre Històric (Loop)', dueSeconds: 240 },
      ],
      coordinates: [-0.3772, 39.4672],
    };
    const html = renderToStaticMarkup(
      <BusStopBoard stop={feederStop} theme="dark" onClose={() => {}} />
    );
    expect(html).toContain('>19<');
    expect(html).toContain('>C1<');
  });

  it('renders live arrival predictions with BusBadge, destination, countdown, and wheelchair icon', () => {
    const liveStop = {
      stopCode: 'P-2261',
      stopName: 'Xàtiva - Estació del Nord',
      lines: ['6', '8'],
      arrivals: [
        {
          line: '6',
          destination: 'Torrefiel',
          dueSeconds: 30,
          minutes: 0,
          isDue: true,
          isLive: true,
          wheelchair: true,
        },
        {
          line: '8',
          destination: 'Pta.de la Mar',
          dueSeconds: 300,
          minutes: 5,
          isDue: false,
          isLive: true,
          wheelchair: false,
        },
      ],
      coordinates: [-0.3772, 39.4672],
    };

    const html = renderToStaticMarkup(
      <BusStopBoard stop={liveStop} theme="dark" onClose={() => {}} />
    );

    // Verify stop header
    expect(html).toContain('P-2261');
    expect(html).toContain('Xàtiva - Estació del Nord');

    // Verify BusBadge rendered
    expect(html).toContain('bus-badge');
    expect(html).toContain('Torrefiel');
    expect(html).toContain('Pta.de la Mar');

    // Verify wheelchair accessibility icon
    expect(html).toContain('aria-label="Accessible"');

    // Verify countdown and due pulse
    expect(html).toContain('station-arriving-dot');
  });

  it('renders graceful empty state when no bus arrivals are predicted', () => {
    const emptyStop = {
      id: 'P-9999',
      stopName: 'Empty Terminal',
      lines: [],
      arrivals: [],
    };

    const html = renderToStaticMarkup(
      <BusStopBoard stop={emptyStop} theme="dark" onClose={() => {}} />
    );

    expect(html).toContain('data-testid="no-live-arrivals"');
    expect(html).not.toContain('station-arrivals-table');
  });
});
