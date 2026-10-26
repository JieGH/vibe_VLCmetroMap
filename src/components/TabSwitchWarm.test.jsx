import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import ConnectingBusSection from './ConnectingBusSection';
import StationPanel from './StationPanel';
import { clearEmtCache, fetchStopArrivals } from '../services/emtArrivalService';

const xml = `<?xml version='1.0' encoding='UTF-8'?>
<estimacion parada="2261"><solo_parada>
<bus><linea>6</linea><destino><![CDATA[Torrefiel]]></destino><minutos>5 min.</minutos><horaLlegada/><error/><adaptado>0</adaptado></bus><info/>
</solo_parada></estimacion>`;

const feeders = [
  { stopCode: '2261', stopName: 'Xàtiva', walkMin: 2, lines: ['6', '8'] },
];

describe('#107 tab switching stays warm', () => {
  beforeEach(() => clearEmtCache());

  it('a remount with a warm cache renders live rows on the first render, no placeholder', async () => {
    const fetchFn = vi.fn(async () => ({ ok: true, text: async () => xml }));
    await fetchStopArrivals('2261', { fetchFn });
    const html = renderToStaticMarkup(<ConnectingBusSection feeders={feeders} compact />);
    expect(html).toContain('Torrefiel');
    expect(html).not.toContain('···');
    expect(html).not.toContain('>...<');
    // remounting must not need another request (cache + dedupe)
    await fetchStopArrivals('2261', { fetchFn });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('an unknown stop still shows a placeholder', () => {
    const html = renderToStaticMarkup(<ConnectingBusSection feeders={feeders} />);
    expect(html).toContain('···');
  });

  it('StationPanel keeps exactly one instance of each section whatever the tab (no remount on switch)', () => {
    const station = {
      properties: { name: 'Xàtiva', lines: ['3'], apiId: 10 },
      geometry: { coordinates: [-0.3774, 39.4585] },
    };
    const html = renderToStaticMarkup(
      <StationPanel station={station} theme="dark" variant="A" onClose={() => {}} />
    );
    const count = (re) => (html.match(re) || []).length;
    expect(count(/independent-bus-scroll/g)).toBeLessThanOrEqual(1);
    expect(count(/independent-metro-scroll/g)).toBeLessThanOrEqual(1);
  });
});
