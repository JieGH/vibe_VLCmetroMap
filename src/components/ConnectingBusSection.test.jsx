import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { clearEmtCache, fetchStopArrivals } from '../services/emtArrivalService';
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
    expect(html).toContain('>Bus<');
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
    // Waiting for its first answer: the wave-dots loading mark, not the bare placeholder.
    expect(html).toContain('wave-dots');
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

describe('ConnectingBusSection countdown formatting and states (#90)', () => {
  const feeder = (arrivals) => [{ stopCode: '2261', stopName: 'Xàtiva', walkMin: 2, lines: ['6'], arrivals }];
  const arr = (over) => ({ line: '6', destination: 'Torrefiel', dueSeconds: 300, isLive: true, ...over });

  it('formats 2 and 15 minute departures as whole minutes with a unit', () => {
    const html = renderToStaticMarkup(
      <ConnectingBusSection feeders={feeder([arr({ dueSeconds: 120 }), arr({ dueSeconds: 900 })])} theme="dark" />
    );
    expect(html).toContain('>2<');
    expect(html).toContain('>15<');
    expect(html).toContain('>min<');
  });

  it('formats sub-minute departures in seconds', () => {
    const html = renderToStaticMarkup(<ConnectingBusSection feeders={feeder([arr({ dueSeconds: 50 })])} theme="dark" />);
    expect(html).toContain('>50<');
    expect(html).toContain('>s<');
  });

  it('shows no unit for a due (20 s) departure', () => {
    const html = renderToStaticMarkup(<ConnectingBusSection feeders={feeder([arr({ dueSeconds: 20 })])} theme="dark" />);
    expect(html).not.toContain('>min<');
    expect(html).not.toContain('>s<');
  });

  it('reads 30 s as seconds, not Arriving (Arriving is 20 s or less)', () => {
    const html = renderToStaticMarkup(<ConnectingBusSection feeders={feeder([arr({ dueSeconds: 30 })])} theme="dark" />);
    expect(html).toContain('30');
  });

  it('shows the live indicator only for live rows and hides it in compact mode', () => {
    const live = renderToStaticMarkup(<ConnectingBusSection feeders={feeder([arr({})])} theme="dark" />);
    expect(live).toContain('Live GPS AVL Telemetry');
    const sched = renderToStaticMarkup(<ConnectingBusSection feeders={feeder([arr({ isLive: false })])} theme="dark" />);
    expect(sched).not.toContain('Live GPS AVL Telemetry');
    const compact = renderToStaticMarkup(<ConnectingBusSection feeders={feeder([arr({})])} compact theme="dark" />);
    expect(compact).not.toContain('Live GPS AVL Telemetry');
  });

  it('shows the no-arrivals state for an empty arrival list', () => {
    const html = renderToStaticMarkup(<ConnectingBusSection feeders={feeder([])} theme="dark" />);
    expect(html).toContain('data-testid="feeder-no-arrivals"');
  });

  describe('#144 waiting rows differ from no-data rows', () => {
    beforeEach(() => clearEmtCache());
    const lineOnly = [{ stopCode: '2261', stopName: 'Xàtiva', walkMin: 2, lines: ['6', '8'] }];

    it('a stop still being fetched shimmers its placeholder rows', () => {
      const html = renderToStaticMarkup(<ConnectingBusSection feeders={lineOnly} compact />);
      expect(html).toContain('wave-dots');
    });

    it('a stop that answered with nothing shows no-data, not loading', async () => {
      const empty = "<?xml version='1.0'?><estimacion><solo_parada></solo_parada></estimacion>";
      await fetchStopArrivals('2261', { fetchFn: vi.fn(async () => ({ ok: true, text: async () => empty })) });
      const html = renderToStaticMarkup(<ConnectingBusSection feeders={lineOnly} compact />);
      expect(html).not.toContain('wave-dots');
      expect(html).toContain('feeder-no-arrivals');
    });

    it('a stop outside the fetch batch is not shown as loading', () => {
      const html = renderToStaticMarkup(<ConnectingBusSection feeders={lineOnly} compact active={false} />);
      expect(html).not.toContain('wave-dots');
    });
  });
});
