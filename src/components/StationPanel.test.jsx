import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import StationPanel from './StationPanel';
import arrivalStore from '../services/arrivalStore';

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

  // A full-screen backdrop used to sit above the map canvas to catch an
  // outside tap and dismiss the panel — but being on top of the map, it also
  // swallowed drag and scroll-zoom gestures meant for the map itself.
  // MapView's own click handler already deselects the Station on a
  // background tap without that side effect, so the backdrop is gone.
  it('does not render a backdrop over the map that would block drag or zoom', () => {
    const html = renderToStaticMarkup(
      <StationPanel station={sampleStation} theme="dark" onClose={() => {}} onCenter={() => {}} />
    );

    expect(html).not.toContain('station-backdrop');
  });

  it('renders prominent hero badges for primary arrivals and compact badges for later arrivals', () => {
    const now = Date.now();
    arrivalStore.memory.set('10', {
      stationId: 10,
      stationName: 'Xàtiva',
      fetchedAt: now,
      arrivals: [
        {
          line: '3',
          destination: 'Rafelbunyol',
          vehicleId: '301',
          lineColor: '#E2001A',
          lineName: 'Line 3',
          targetTimestamp: now + 120 * 1000,
          isLive: true,
        },
        {
          line: '5',
          destination: 'Aeroport',
          vehicleId: '502',
          lineColor: '#00994D',
          lineName: 'Line 5',
          targetTimestamp: now + 300 * 1000,
          isLive: true,
        },
        {
          line: '9',
          destination: 'Riba-roja de Túria',
          vehicleId: '903',
          lineColor: '#996633',
          lineName: 'Line 9',
          targetTimestamp: now + 600 * 1000,
          isLive: true,
        },
      ],
    });

    const html = renderToStaticMarkup(
      <StationPanel station={sampleStation} theme="dark" onClose={() => {}} onCenter={() => {}} />
    );

    // Primary arrivals have hero badges (28x26px) and prominent typography (1.35rem)
    expect(html).toContain('station-arrival-badge--hero');
    expect(html).toContain('min-width:28px');
    expect(html).toContain('height:26px');
    expect(html).toContain('station-arrival-due');
    expect(html).toContain('font-size:1.35rem');

    // Later arrivals have compact badges (19x19px)
    expect(html).toContain('station-arrival-badge--compact');
    expect(html).toContain('min-width:19px');
    expect(html).toContain('height:19px');
  });

  it('renders drag handle in portrait mode and hides it in landscape mode', () => {
    // In default Node test environment, window is undefined, which defaults to portrait
    const portraitHtml = renderToStaticMarkup(
      <StationPanel station={sampleStation} theme="dark" onClose={() => {}} onCenter={() => {}} />
    );
    expect(portraitHtml).toContain('data-testid="station-drag-handle"');
    expect(portraitHtml).toContain('sheet-drag-handle-wrap');
    expect(portraitHtml).toContain('sheet-drag-handle');

    // In landscape mode (window.innerWidth >= 820)
    const origWindow = globalThis.window;
    try {
      globalThis.window = {
        innerWidth: 1024,
        addEventListener: () => {},
        removeEventListener: () => {},
      };
      const landscapeHtml = renderToStaticMarkup(
        <StationPanel station={sampleStation} theme="dark" onClose={() => {}} onCenter={() => {}} />
      );
      expect(landscapeHtml).not.toContain('data-testid="station-drag-handle"');
    } finally {
      if (origWindow === undefined) {
        delete globalThis.window;
      } else {
        globalThis.window = origWindow;
      }
    }
  });
});
