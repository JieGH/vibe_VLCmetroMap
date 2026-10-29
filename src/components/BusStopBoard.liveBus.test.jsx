import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';

const found = { current: null };
vi.mock('../services/useBusFleet', () => ({ useNearestApproachingBus: () => found.current }));
vi.mock('../services/emtArrivalService', async (orig) => ({
  ...(await orig()),
  getEmtCachedArrivals: () => [
    { line: '92', destination: 'Nazaret', dueSeconds: 60 },
    { line: '19', destination: 'La Malva-rosa', dueSeconds: 240 },
    { line: '19', destination: 'La Malva-rosa', dueSeconds: 900 },
  ],
}));
import BusStopBoard from './BusStopBoard';

const stop = { stopCode: '1858', stopName: 'Estació del Nord - Castelló', lines: ['19', '92'] };
const render = () => renderToStaticMarkup(<BusStopBoard stop={stop} onClose={() => {}} />);

describe('BusStopBoard live bus beside the line 19 countdown (#152)', () => {
  it('adds no live-bus markup when nothing is tracked (row looks as today)', () => {
    found.current = null;
    const html = render();
    expect(html).toContain('station-arrivals-table');
    expect(html).not.toContain('live-bus-away');
  });
  it('shows the nearest bus once, under the soonest line 19 row only', () => {
    found.current = { bus: { id: 'bus-1' }, stopsAway: 3, distanceM: 900 };
    const html = render();
    expect(html.match(/data-testid="live-bus-away"/g)).toHaveLength(1);
    expect(html).toContain('3 stops away');
    expect(html.indexOf('Nazaret')).toBeLessThan(html.indexOf('live-bus-away'));
  });
});
