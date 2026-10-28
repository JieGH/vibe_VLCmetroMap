import { describe, it, expect } from 'vitest';
import { POPULAR_BUS_LINE_IDS } from './popularBus';
import { getRealBusLines, getAllBusStops } from '../data/emtData';
import { getDistance } from './geoUtils';

const HUBS = {
  ajuntament: [-0.3763, 39.4699],
  nord: [-0.3774, 39.4666],
};
const serves = (lineId, hub, radius = 300) =>
  getAllBusStops().some((s) => s.lines.map(String).includes(lineId) && getDistance(HUBS[hub], s.coordinates) <= radius);

describe('popular bus lines (#142)', () => {
  it('are all real EMT lines, without duplicates', () => {
    const real = new Set(getRealBusLines().map((l) => l.id));
    expect(POPULAR_BUS_LINE_IDS.every((id) => real.has(id))).toBe(true);
    expect(new Set(POPULAR_BUS_LINE_IDS).size).toBe(POPULAR_BUS_LINE_IDS.length);
  });

  it('each serve both the city square and the Nord station area', () => {
    for (const id of POPULAR_BUS_LINE_IDS) {
      expect(serves(id, 'ajuntament'), `line ${id} near Pl. Ajuntament`).toBe(true);
      expect(serves(id, 'nord'), `line ${id} near Estació del Nord`).toBe(true);
    }
  });
});
