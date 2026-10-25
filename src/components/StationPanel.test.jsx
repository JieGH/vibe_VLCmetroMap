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
      <StationPanel station={null} theme="dark" onClose={() => {}} />
    );
    expect(html).toBe('');
  });

  it('renders as a floating card with margins and uniform rounded corners in portrait', () => {
    const html = renderToStaticMarkup(
      <StationPanel station={sampleStation} theme="dark" onClose={() => {}} />
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

    // Station header icon rendered on the left as a red dot emblem with custom 'm'
    expect(html).toContain('data-testid="station-header-icon"');
    expect(html).toContain('>m<');
    expect(html).toContain('#E2001A');

    // Station line badges rendered underneath station name
    expect(html).toContain('station-header-line-badge');
    expect(html).toContain('>3<');
    expect(html).toContain('>5<');
    expect(html).toContain('>9<');
  });

  // A full-screen backdrop used to sit above the map canvas to catch an
  // outside tap and dismiss the panel — but being on top of the map, it also
  // swallowed drag and scroll-zoom gestures meant for the map itself.
  // MapView's own click handler already deselects the Station on a
  // background tap without that side effect, so the backdrop is gone.
  it('does not render a backdrop over the map that would block drag or zoom', () => {
    const html = renderToStaticMarkup(
      <StationPanel station={sampleStation} theme="dark" onClose={() => {}} />
    );

    expect(html).not.toContain('station-backdrop');
  });

  it('renders all arrival trains in a single unified list ranked by closest arrival time', () => {
    const now = Date.now();
    arrivalStore.memory.set('10', {
      stationId: 10,
      stationName: 'Xàtiva',
      fetchedAt: now,
      arrivals: [
        {
          line: '9',
          destination: 'Riba-roja de Túria',
          vehicleId: '903',
          lineColor: '#996633',
          lineName: 'Line 9',
          targetTimestamp: now + 600 * 1000,
          isLive: true,
        },
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
          line: '3',
          destination: 'Rafelbunyol',
          vehicleId: '302',
          lineColor: '#E2001A',
          lineName: 'Line 3',
          targetTimestamp: now + 240 * 1000,
          isLive: true,
        },
      ],
    });

    const html = renderToStaticMarkup(
      <StationPanel station={sampleStation} theme="dark" onClose={() => {}} />
    );

    // No split into primary big rows vs compact rest rows
    expect(html).not.toContain('station-primary-arrivals');
    expect(html).not.toContain('station-arrival-badge--hero');
    expect(html).not.toContain('station-arrival-badge--compact');

    // Unified table contains all arrivals with uniform badge and row styling
    expect(html).toContain('station-arrivals-table');
    expect(html).toContain('station-line-badge');
    expect(html).toContain('station-arrival-due');

    // Ranked strictly by closest arrival time: 2 min -> 4 min -> 10 min
    const idx2min = html.indexOf('>2<');
    const idx4min = html.indexOf('>4<');
    const idx10min = html.indexOf('>10<');
    expect(idx2min).toBeGreaterThan(-1);
    expect(idx4min).toBeGreaterThan(idx2min);
    expect(idx10min).toBeGreaterThan(idx4min);
    expect(html).not.toContain('station-arrival-vehicle');
  });

  it('renders a pulsing visual dot when a train is arriving (<= 30s)', () => {
    const now = Date.now();
    arrivalStore.memory.set('10', {
      stationId: 10,
      timestamp: now,
      isFresh: true,
      arrivals: [
        {
          line: '3',
          destination: 'Aeroport',
          targetTimestamp: now + 20 * 1000, // 20s = arriving
          isLive: true,
        },
      ],
    });

    const html = renderToStaticMarkup(
      <StationPanel station={sampleStation} theme="dark" onClose={() => {}} />
    );

    expect(html).toContain('data-testid="station-arriving-dot"');
    expect(html).toContain('Arriving');
  });

  it('renders drag handle in portrait mode and hides it in landscape mode', () => {
    // In default Node test environment, window is undefined, which defaults to portrait
    const portraitHtml = renderToStaticMarkup(
      <StationPanel station={sampleStation} theme="dark" onClose={() => {}} />
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
        <StationPanel station={sampleStation} theme="dark" onClose={() => {}} />
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

  it('renders live/memory and confirmed status as symbols instead of text in header', () => {
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
      ],
    });

    const liveHtml = renderToStaticMarkup(
      <StationPanel station={sampleStation} theme="dark" onClose={() => {}} />
    );
    expect(liveHtml).toContain('station-status-badge');
    expect(liveHtml).toContain('station-confirmed-badge');
    expect(liveHtml).not.toContain('>LIVE<');
    expect(liveHtml).not.toContain('>confirmed just now<');

    // Stale memory state
    arrivalStore.memory.set('10', {
      stationId: 10,
      stationName: 'Xàtiva',
      fetchedAt: now - 120 * 1000,
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
      ],
    });

    const memoryHtml = renderToStaticMarkup(
      <StationPanel station={sampleStation} theme="dark" onClose={() => {}} />
    );
    expect(memoryHtml).toContain('station-status-badge');
    expect(memoryHtml).toContain('station-confirmed-badge');
    expect(memoryHtml).not.toContain('>MEMORY<');
    expect(memoryHtml).not.toContain('>confirmed 2 min ago<');
  });

  it('has no footer or recentre button', () => {
    const html = renderToStaticMarkup(
      <StationPanel station={sampleStation} theme="dark" onClose={() => {}} />
    );
    expect(html).not.toContain('station-panel-recentre');
    expect(html).not.toContain('<footer');
  });
});
