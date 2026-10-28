import { describe, it, expect } from 'vitest';
import { POPULAR_BUS_LINE_IDS } from './popularBus';
import { getRealBusLines, getAllBusStops } from '../data/emtData';
import { getDistance } from './geoUtils';

// Hub coordinates [lng, lat], read off the map: Plaça de l'Ajuntament, Estació del Nord, Joaquín Sorolla.
const HUBS = {
  ajuntament: [-0.3763, 39.4699],
  nord: [-0.3774, 39.4666],
  sorolla: [-0.3813, 39.458],
};
const HUB_RADIUS_M = { ajuntament: 300, nord: 300, sorolla: 450 }; // Sorolla sits on a wide ring road, stops are further out
const ALL_THREE = POPULAR_BUS_LINE_IDS.slice(0, 5);
// emt_stops.json carries line ids as strings, but feeder data can carry numbers; compare as strings.
const serves = (lineId, hub) =>
  getAllBusStops().some(
    (s) => s.lines.map(String).includes(lineId) && getDistance(HUBS[hub], s.coordinates) <= HUB_RADIUS_M[hub]
  );

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

  it('the first five also serve Joaquín Sorolla, as the list claims', () => {
    for (const id of ALL_THREE) expect(serves(id, 'sorolla'), `line ${id} near Joaquín Sorolla`).toBe(true);
  });
});
