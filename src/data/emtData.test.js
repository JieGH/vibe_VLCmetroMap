import { describe, it, expect } from 'vitest';
import { EMT_LINES, STATION_BUS_TRANSFERS, getStationBusFeeders, getBusLine, LIVE_BUS_TELEMETRY } from './emtData';

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

  it('contains live simulated telemetry for real-time fleet', () => {
    expect(LIVE_BUS_TELEMETRY.length).toBeGreaterThan(0);
    const bus = LIVE_BUS_TELEMETRY[0];
    expect(bus.vehicleId).toMatch(/^EMT-\d+$/);
    expect(bus.coordinates).toHaveLength(2);
    expect(bus.speedKmh).toBeGreaterThan(0);
  });
});
