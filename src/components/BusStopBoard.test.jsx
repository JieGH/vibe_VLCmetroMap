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

  it('first render shows a loading state and no hard-coded arrivals (#122)', () => {
    const html = renderToStaticMarkup(
      <BusStopBoard stop={{ stopCode: '55555', stopName: 'Parada sin datos', lines: [], coordinates: [-0.37, 39.47] }} theme="dark" onClose={() => {}} />
    );
    expect(html).toContain('data-testid="arrivals-loading"');
    expect(html).not.toContain('station-arrivals-table');
    expect(html).not.toContain('La Malva-rosa');
    expect(html).not.toContain('Centre Històric');
    expect(html).not.toContain('La Fontsanta');
    expect(html).not.toContain('Campanar');
  });

  it('feeder stops with plain line numbers also start in the loading state', () => {
    const html = renderToStaticMarkup(
      <BusStopBoard stop={{ stopCode: '1002', stopName: 'Colón', lines: ['19', 'C1'], coordinates: [-0.375, 39.469] }} theme="dark" onClose={() => {}} />
    );
    expect(html).toContain('data-testid="arrivals-loading"');
    expect(html).not.toContain('station-arrivals-table');
  });

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
    expect(html).toContain('class="bus-stop-header-emblem"');
    expect(html).not.toContain('class="station-header-icon"');
    expect(html).toContain('EMT');
    expect(html).toContain('P-1002');
    expect(html).toContain('Colón - Pascual i Genís');
    expect(html).toContain('station-header-line-badge');
    expect(html).toContain('>19<');
    expect(html).toContain('>C1<');
    expect(html).toContain('>92<');
    expect(html).toContain('data-testid="arrivals-loading"');
    expect(html).not.toContain('station-arrivals-table');
    expect(html).toContain('data-testid="station-drag-handle"');
  });

  it('renders the header line badges squarer (#121): min-width equals height, tight padding', () => {
    const html = renderToStaticMarkup(
      <BusStopBoard stop={sampleStop} theme="dark" onClose={() => {}} />
    );
    const badge = html.match(/class="station-header-line-badge"[^>]*>/)?.[0] || '';
    expect(badge).toContain('min-width:20px');
    expect(badge).toContain('height:20px');
    expect(badge).toContain('padding:0 2px');
  });

  it('renders expand and close buttons matching StationPanel design', () => {
    const html = renderToStaticMarkup(
      <BusStopBoard stop={sampleStop} theme="dark" onClose={() => {}} />
    );

    expect(html).toContain('station-panel-expand');
    expect(html).toContain('station-panel-close');
    expect(html).toContain('aria-label="Expand station panel"');
  });

  it('renders EMT emblem with logo-proportioned (about 2:1, tight to the letters) rounded rectangle instead of a square or circle', () => {
    const html = renderToStaticMarkup(
      <BusStopBoard stop={sampleStop} theme="dark" onClose={() => {}} />
    );

    expect(html).toContain('data-testid="station-header-icon"');
    expect(html).toMatch(/data-testid="station-header-icon"[^>]*width:40px;height:20px/);
    expect(html).toMatch(/data-testid="station-header-icon"[^>]*border-radius:4px/);
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
    // Verify 5 min renders with min unit
    expect(html).toContain('>5<');
    expect(html).toContain('>min<');
  });

  it('renders 1 min countdown with min unit suffix instead of blank', () => {
    const oneMinStop = {
      stopCode: '2261',
      stopName: 'Xàtiva',
      lines: ['6'],
      arrivals: [
        {
          line: '6',
          destination: 'Torrefiel',
          dueSeconds: 60,
          minutes: 1,
          isDue: true,
          isLive: true,
          wheelchair: false,
        },
      ],
    };

    const html = renderToStaticMarkup(
      <BusStopBoard stop={oneMinStop} theme="dark" onClose={() => {}} />
    );

    expect(html).toContain('>1<');
    expect(html).toContain('>min<');
    expect(html).not.toContain('station-arriving-dot');
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

describe('BusStopBoard countdown formatting and states (#90)', () => {
  const board = (arrivals) =>
    renderToStaticMarkup(
      <BusStopBoard
        stop={{ stopCode: '2261', stopName: 'Xàtiva', lines: ['6'], arrivals }}
        theme="dark"
        onClose={() => {}}
      />
    );
  const row = (over) => ({ line: '6', destination: 'Torrefiel', dueSeconds: 300, isLive: true, wheelchair: false, ...over });

  it('shows whole minutes for 2 and 15 minute arrivals', () => {
    const html = board([row({ dueSeconds: 120 }), row({ dueSeconds: 900, destination: 'Far' })]);
    expect(html).toContain('>2<');
    expect(html).toContain('>15<');
    expect(html).toContain('>min<');
  });

  it('shows seconds between the due threshold and one minute', () => {
    const html = board([row({ dueSeconds: 45 })]);
    expect(html).toContain('>45<');
    expect(html).toContain('>s<');
  });

  it('shows the due dot (no unit) for Pròxim-style 30 s arrivals and pulses only when live', () => {
    const live = board([row({ dueSeconds: 30, isDue: true })]);
    expect(live).toContain('station-arriving-dot pulse');
    expect(live).not.toContain('>min<');
    const sched = board([row({ dueSeconds: 30, isLive: false })]);
    expect(sched).toContain('station-arriving-dot ');
    expect(sched).not.toContain('station-arriving-dot pulse');
  });

  it('omits the accessible icon for non-wheelchair buses', () => {
    expect(board([row({})])).not.toContain('aria-label="Accessible"');
  });

  it('renders the empty state, not a table, when arrivals are missing from the stop', () => {
    const html = renderToStaticMarkup(
      <BusStopBoard stop={{ stopCode: '1', stopName: 'S', lines: [], arrivals: [] }} theme="dark" onClose={() => {}} />
    );
    expect(html).toContain('data-testid="no-live-arrivals"');
  });

  it('#96: the detail view lists every arrival (no 3-row split-view cap) with the full min/Arriving wording', () => {
    const stop = {
      stopCode: 'P-2206',
      stopName: 'Plaça d\'Amèrica',
      lines: ['1'],
      arrivals: Array.from({ length: 6 }, (_, i) => ({
        line: '1',
        destination: `Dest${i}`,
        dueSeconds: 120 + i * 60,
        minutes: 2 + i,
        isLive: true,
      })),
      coordinates: [-0.3772, 39.4672],
    };
    const html = renderToStaticMarkup(<BusStopBoard stop={stop} theme="dark" onClose={() => {}} />);
    for (let i = 0; i < 6; i++) expect(html).toContain(`Dest${i}`);
    expect(html).not.toContain('′');
  });

});
