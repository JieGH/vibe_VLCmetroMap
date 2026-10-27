import { describe, it, expect, beforeEach, vi } from 'vitest';
import { clearEmtCache } from './emtArrivalService';
import { FEEDER_FETCH_BATCH, visibleFeederCodes, fetchFeederArrivals } from './feederArrivalFetch';

const xml = `<?xml version='1.0' encoding='UTF-8'?>
<estimacion><solo_parada>
<bus><linea>6</linea><destino><![CDATA[Torrefiel]]></destino><minutos>5 min.</minutos><horaLlegada/><error/><adaptado>0</adaptado></bus><info/>
</solo_parada></estimacion>`;

const dense = Array.from({ length: 34 }, (_, i) => String(1000 + i));
const makeFetch = () => vi.fn(async () => ({ ok: true, text: async () => xml }));

describe('#109 feeder arrival fetching is limited to visible stops', () => {
  beforeEach(() => clearEmtCache());

  it('opening the hub in a dense area fetches only the nearest batch', async () => {
    const fetchFn = makeFetch();
    await fetchFeederArrivals(visibleFeederCodes(dense), { fetchFn });
    expect(fetchFn).toHaveBeenCalledTimes(FEEDER_FETCH_BATCH);
    expect(FEEDER_FETCH_BATCH).toBeLessThanOrEqual(8);
  });

  it('an anchor refresh with an overlapping set refetches only the new stops', async () => {
    const fetchFn = makeFetch();
    await fetchFeederArrivals(visibleFeederCodes(dense), { fetchFn });
    fetchFn.mockClear();
    // walked 45 m: two nearest dropped off, two new ones came into the batch
    const moved = [...dense.slice(2, 8), '2000', '2001', ...dense.slice(8)];
    await fetchFeederArrivals(visibleFeederCodes(moved), { fetchFn });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('scrolling or expanding fetches the rest lazily, skipping fresh stops', async () => {
    const fetchFn = makeFetch();
    await fetchFeederArrivals(visibleFeederCodes(dense), { fetchFn });
    fetchFn.mockClear();
    await fetchFeederArrivals(visibleFeederCodes(dense, { limit: FEEDER_FETCH_BATCH * 2 }), { fetchFn });
    expect(fetchFn).toHaveBeenCalledTimes(FEEDER_FETCH_BATCH);
  });

  it('fires nothing while collapsed out of view or with the page hidden', () => {
    expect(visibleFeederCodes(dense, { active: false })).toEqual([]);
    expect(visibleFeederCodes(dense, { pageHidden: true })).toEqual([]);
    expect(visibleFeederCodes(null)).toEqual([]);
  });

  it('a failed stop is left out of the result without failing the others', async () => {
    const fetchFn = vi.fn(async (url) => {
      if (String(url).includes('=1001')) throw new Error('boom');
      return { ok: true, text: async () => xml };
    });
    const map = await fetchFeederArrivals(['1000', '1001'], { fetchFn });
    expect(Object.keys(map)).toContain('1000');
  });
});

describe('#109 lazy-load sentinel', () => {
  it('renders only when stops remain beyond the fetch batch', async () => {
    const React = (await import('react')).default;
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { default: Section } = await import('../components/ConnectingBusSection');
    const mk = (n) => Array.from({ length: n }, (_, i) => ({ stopCode: String(3000 + i), stopName: 'S', walkMin: 1, lines: ['6'] }));
    expect(renderToStaticMarkup(<Section feeders={mk(FEEDER_FETCH_BATCH + 1)} />)).toContain('feeder-more-sentinel');
    expect(renderToStaticMarkup(<Section feeders={mk(FEEDER_FETCH_BATCH)} />)).not.toContain('feeder-more-sentinel');
  });
});
