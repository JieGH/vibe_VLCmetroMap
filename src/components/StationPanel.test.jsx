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

  it('renders station-backdrop behind the floating card for dismiss on outside tap', () => {
    const html = renderToStaticMarkup(
      <StationPanel station={sampleStation} theme="dark" onClose={() => {}} onCenter={() => {}} />
    );

    expect(html).toContain('station-backdrop');
    expect(html).toContain('data-testid="station-backdrop"');
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
});
