import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import ConnectingBusSection from './ConnectingBusSection';

describe('ConnectingBusSection component', () => {
  const sampleFeeders = [
    {
      stopCode: 'P-2261',
      stopName: 'Xàtiva - Estació del Nord',
      walkMin: 2,
      lines: ['6', '8', '19'],
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
    },
    {
      stopCode: '2277',
      stopName: 'Xàtiva - Institut Lluís Vives',
      walkMin: 3,
      lines: ['72'],
      arrivals: [],
    },
  ];

  it('renders graceful empty state when feeders is empty or null', () => {
    const htmlEmpty = renderToStaticMarkup(
      <ConnectingBusSection feeders={[]} />
    );
    expect(htmlEmpty).toContain('No EMT bus stops found within walking distance.');

    const htmlNull = renderToStaticMarkup(
      <ConnectingBusSection feeders={null} />
    );
    expect(htmlNull).toContain('No EMT bus stops found within walking distance.');
  });

  it('renders feeder section header with stop count, stop code badges, and walking minutes', () => {
    const html = renderToStaticMarkup(
      <ConnectingBusSection feeders={sampleFeeders} showDistance={true} theme="dark" />
    );

    expect(html).toContain('connecting-bus-feeder-section');
    expect(html).toContain('EMT');
    expect(html).toContain('Autobús');
    expect(html).toContain('2 stops');

    expect(html).toContain('P-2261');
    expect(html).toContain('Xàtiva - Estació del Nord');
    expect(html).toContain('2 min');

    expect(html).toContain('P-2277');
    expect(html).toContain('Xàtiva - Institut Lluís Vives');
    expect(html).toContain('3 min');
  });

  it('renders live bus arrivals with BusBadge, real destination, and countdown minutes', () => {
    const html = renderToStaticMarkup(
      <ConnectingBusSection feeders={sampleFeeders} theme="dark" />
    );

    // Badges and destinations
    expect(html).toContain('bus-badge');
    expect(html).toContain('Torrefiel');
    expect(html).toContain('Pta.de la Mar');

    // Live telemetry indicator
    expect(html).toContain('title="Live GPS AVL Telemetry"');

    // Countdown minutes
    expect(html).toContain('>5<');
    expect(html).toContain('>min<');
  });

  it('renders graceful empty state when a feeder stop has no live departures', () => {
    const html = renderToStaticMarkup(
      <ConnectingBusSection feeders={sampleFeeders} theme="dark" />
    );

    // Stop 2277 has arrivals: []
    expect(html).toContain('data-testid="feeder-no-arrivals"');
  });

  it('renders safely when stop has unhydrated plain line strings', () => {
    const plainFeeders = [
      {
        stopCode: '1002',
        stopName: 'Colón',
        walkMin: 1,
        lines: ['19', 'C1'],
      },
    ];

    const html = renderToStaticMarkup(
      <ConnectingBusSection feeders={plainFeeders} theme="dark" />
    );

    expect(html).toContain('P-1002');
    expect(html).toContain('Colón');
    expect(html).toContain('19');
    expect(html).toContain('C1');
    expect(html).toContain('···');
  });

  it('shows a short single-line label for an empty stop in compact mode only', () => {
    const compactHtml = renderToStaticMarkup(
      <ConnectingBusSection feeders={[sampleFeeders[1]]} compact={true} theme="dark" />
    );
    expect(compactHtml).toContain('No info');
    expect(compactHtml).toContain('white-space:nowrap');
    expect(compactHtml).not.toContain('Nothing further due yet.');

    const fullHtml = renderToStaticMarkup(
      <ConnectingBusSection feeders={[sampleFeeders[1]]} theme="dark" />
    );
    expect(fullHtml).toContain('Nothing further due yet.');
  });
});
