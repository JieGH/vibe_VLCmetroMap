import { describe, it, expect } from 'vitest';
import {
  EMT_LINES,
  STATION_BUS_TRANSFERS,
  getStationBusFeeders,
  getAllBusStops,
  LIVE_BUS_TELEMETRY,
} from './emtData';
import { WALK_RADIUS_METRES, WALK_RADIUS_MIN } from '../utils/walkRadius';

describe('EMT Prototype Data', () => {
  it('defines primary EMT lines including C1, C2, C3, 19, 95', () => {
    const ids = EMT_LINES.map(l => l.id);
    expect(ids).toContain('C1');
    expect(ids).toContain('C2');
    expect(ids).toContain('C3');
    expect(ids).toContain('19');
    expect(ids).toContain('95');
  });

  it('provides route polylines and stop coordinates for each line', () => {
    EMT_LINES.forEach(line => {
      expect(line.coordinates.length).toBeGreaterThan(1);
      expect(line.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(line.name).toBeTruthy();
    });
  });

  it('provides feeder bus transfers for major metro interchange stations', () => {
    const xativa = getStationBusFeeders('Xàtiva');
    expect(xativa.length).toBeGreaterThanOrEqual(2);
    expect(xativa[0].stopCode).toBe('1002');
    expect(xativa[0].walkMetres).toBeLessThanOrEqual(200);

    const angelGuimera = getStationBusFeeders('Àngel Guimerà');
    expect(angelGuimera.length).toBeGreaterThanOrEqual(2);

    const colon = getStationBusFeeders('Colón');
    expect(colon.length).toBeGreaterThanOrEqual(2);
  });

  it('falls back gracefully to synthetic feeder stops for arbitrary station names', () => {
    const generic = getStationBusFeeders('Bétera', [-0.457, 39.590]);
    expect(generic.length).toBeGreaterThanOrEqual(1);
    expect(generic[0].walkMetres).toBeLessThanOrEqual(200);
  });

  it('only offers real EMT stops within the 3-minute walk radius of a station', () => {
    const feeders = getStationBusFeeders('Sin transbordo', [-0.3774, 39.4699]);
    expect(feeders.length).toBeGreaterThan(0);
    feeders.forEach((f) => {
      expect(f.walkMetres).toBeLessThanOrEqual(WALK_RADIUS_METRES);
      expect(f.walkMin).toBeLessThanOrEqual(WALK_RADIUS_MIN);
    });
  });

  it('contains live simulated telemetry for real-time fleet', () => {
    expect(LIVE_BUS_TELEMETRY.length).toBeGreaterThan(0);
    const bus = LIVE_BUS_TELEMETRY[0];
    expect(bus.vehicleId).toMatch(/^EMT-\d+$/);
    expect(bus.coordinates).toHaveLength(2);
    expect(bus.speedKmh).toBeGreaterThan(0);
  });

  it('loads real EMT bus stops from official Valencia Open Data', () => {
    const stops = getAllBusStops();
    expect(stops.length).toBeGreaterThan(1000);
    const stop = stops[0];
    expect(stop.stopCode).toBeTruthy();
    expect(stop.stopName).toBeTruthy();
    expect(stop.coordinates).toHaveLength(2);
    expect(stop.coordinates[0]).toBeLessThan(0); // Valencia is west of prime meridian
    expect(stop.coordinates[1]).toBeGreaterThan(39.0);
  });
});
