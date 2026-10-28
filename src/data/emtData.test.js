import { describe, it, expect } from 'vitest';
import * as emtData from './emtData';
import {
  getStationBusFeeders,
  feederFromStop,
  getAllBusStops,
  getRealBusLines,
} from './emtData';
import { WALK_RADIUS_BUS_METRES } from '../utils/walkRadius';
import { getDistance } from '../utils/geoUtils';
import { walkingMinutes } from '../utils/walking';
import REAL_EMT_STOPS from './emt_stops.json';

describe('EMT data (real stops only, #122)', () => {
  it('no longer exports prototype dummy tables', () => {
    expect(emtData.STATION_BUS_TRANSFERS).toBeUndefined();
    expect(emtData.LIVE_BUS_TELEMETRY).toBeUndefined();
  });

  it('returns zero feeders for a click 20 km from any stop (sea / countryside)', () => {
    expect(getStationBusFeeders('Map Ping', [0.2, 39.47])).toEqual([]);
    expect(getStationBusFeeders('Bétera', [-0.457, 39.590])).toEqual([]);
  });

  it('returns no feeders without coordinates or a name, and no invented default centre', () => {
    expect(getStationBusFeeders('Xàtiva')).toEqual([]);
    expect(getStationBusFeeders(null, [-0.3774, 39.4699])).toEqual([]);
  });

  it('only offers real EMT stops within the walk radius, with no invented times or vehicles', () => {
    const feeders = getStationBusFeeders('Sin transbordo', [-0.3774, 39.4699]);
    expect(feeders.length).toBeGreaterThan(0);
    const realCodes = new Set(REAL_EMT_STOPS.map((s) => String(s.stopCode)));
    feeders.forEach((f) => {
      expect(realCodes.has(f.stopCode)).toBe(true);
      expect(f.stopCode).not.toMatch(/^P-/);
      expect(f.walkMetres).toBeLessThanOrEqual(WALK_RADIUS_BUS_METRES);
      expect(f.walkMin).toBeLessThanOrEqual(walkingMinutes(WALK_RADIUS_BUS_METRES));
      f.lines.forEach((l) => {
        expect(typeof l).toBe('string');
      });
    });
  });

  it('uses the bus radius: a stop 270 m away is offered, one 290 m away is not', () => {
    const stop = REAL_EMT_STOPS[0];
    const [lng, lat] = stop.coordinates;
    // A point due west of the stop, `metres` away by the repo's own distance function.
    const westOf = (metres) => {
      let x = lng - metres / 86000;
      for (let i = 0; i < 20; i += 1) x -= (metres - getDistance([lng, lat], [x, lat])) / 86000;
      return [x, lat];
    };
    const codes = (m) => getStationBusFeeders('Pin', westOf(m)).map((f) => f.stopCode);
    expect(codes(270)).toContain(String(stop.stopCode));
    expect(codes(290)).not.toContain(String(stop.stopCode));
  });

  it('a stop with no line data yields no chips (no default 19 / C1)', () => {
    const f = feederFromStop({ stopCode: 9999, stopName: 'Sin datos', coordinates: [-0.37, 39.47] }, 50);
    expect(f.lines).toEqual([]);
    const g = feederFromStop({ stopCode: 9999, stopName: 'Sin datos', lines: [], coordinates: [-0.37, 39.47] }, 50);
    expect(g.lines).toEqual([]);
    expect(JSON.stringify(f)).not.toMatch(/dueSeconds|vehicleId|isLive/);
  });

  it('keeps real line numbers as plain strings', () => {
    const f = feederFromStop({ stopCode: 1, stopName: 'X', lines: ['70', 92], coordinates: [-0.37, 39.47] }, 10);
    expect(f.lines).toEqual(['70', '92']);
    expect(f.walkMetres).toBe(10);
  });

  it('builds searchable bus lines only from lines that exist in the EMT stop data', () => {
    const real = new Set(REAL_EMT_STOPS.flatMap((s) => (s.lines || []).map(String)));
    const lines = getRealBusLines();
    expect(lines.length).toBeGreaterThan(10);
    lines.forEach((l) => expect(real.has(l.id)).toBe(true));
    expect(lines.find((l) => l.id === 'ZZ-FAKE')).toBeUndefined();
    expect(new Set(lines.map((l) => l.id)).size).toBe(lines.length);
  });

  it('loads real EMT bus stops from official Valencia Open Data', () => {
    const stops = getAllBusStops();
    expect(stops.length).toBeGreaterThan(1000);
    const stop = stops[0];
    expect(stop.stopCode).toBeTruthy();
    expect(stop.stopName).toBeTruthy();
    expect(stop.coordinates).toHaveLength(2);
    expect(stop.coordinates[0]).toBeLessThan(0);
    expect(stop.coordinates[1]).toBeGreaterThan(39.0);
  });
});

describe('bus stop search (#138)', () => {
  it('finds a real stop by its code and by its name, as the same object a marker tap passes', async () => {
    const { getAllBusStops } = await import('./emtData');
    const { searchFuzzy } = await import('../utils/fuzzySearch');
    const stops = getAllBusStops();
    const target = stops.find((s) => s.stopCode === '1044');
    const key = (s) => `${s.stopCode} ${s.stopName}`;
    expect(searchFuzzy(stops, '1044', key)).toContain(target);
    expect(searchFuzzy(stops, 'Poliesportiu de Burjassot', key)).toContain(target);
  });
});
