import { describe, it, expect } from 'vitest';
import {
  lineServesStation,
  lineOpacityExpression,
  dimmedVehicleOpacity,
  vehicleShouldPulse,
  DIM_FACTOR,
} from './lineDim';

const station = { properties: { name: 'Àngel Guimerà', lines: ['3', '5'] } };

describe('lineServesStation', () => {
  it('is true for a Line in the Station Chain', () => {
    expect(lineServesStation('3', station)).toBe(true);
  });

  it('is false for a Line not in the Station Chain', () => {
    expect(lineServesStation('1', station)).toBe(false);
  });

  it('compares Line ids as strings, tolerating numeric ids', () => {
    expect(lineServesStation(3, station)).toBe(true);
  });

  it('treats every Line as serving the Station when none is selected', () => {
    expect(lineServesStation('1', null)).toBe(true);
  });

  it('treats a Station with no lines as served by nothing', () => {
    expect(lineServesStation('1', { properties: { name: 'Isolated', lines: [] } })).toBe(false);
  });
});

describe('lineOpacityExpression', () => {
  it('returns the plain full opacity when no Station is selected', () => {
    expect(lineOpacityExpression(null, 1)).toBe(1);
  });

  it('builds a case expression matching the Station Chain when a Station is selected', () => {
    const expr = lineOpacityExpression(station, 1);
    expect(expr).toEqual(['case', ['in', ['get', 'line'], ['literal', ['3', '5']]], 1, DIM_FACTOR]);
  });

  it('scales the dim branch relative to the given full opacity', () => {
    const expr = lineOpacityExpression(station, 0.35);
    expect(expr[3]).toBeCloseTo(0.35 * DIM_FACTOR);
  });
});

describe('dimmedVehicleOpacity', () => {
  it('leaves the base opacity untouched for a served Line', () => {
    expect(dimmedVehicleOpacity(0.8, '3', station)).toBe(0.8);
  });

  it('scales the base opacity down for an unserved Line', () => {
    expect(dimmedVehicleOpacity(0.8, '1', station)).toBeCloseTo(0.8 * DIM_FACTOR);
  });

  it('leaves the base opacity untouched when no Station is selected', () => {
    expect(dimmedVehicleOpacity(0.8, '1', null)).toBe(0.8);
  });
});

describe('vehicleShouldPulse', () => {
  it('never pulses with no Station selected, even when live', () => {
    expect(vehicleShouldPulse({ isLive: true, line: '3' }, null)).toBe(false);
  });

  it('pulses a live Vehicle on a Line serving the selected Station', () => {
    expect(vehicleShouldPulse({ isLive: true, line: '3' }, station)).toBe(true);
  });

  it('stays static for a live Vehicle on a Line not serving the selected Station', () => {
    expect(vehicleShouldPulse({ isLive: true, line: '1' }, station)).toBe(false);
  });

  it('never pulses a Simulated Train, selected Station or not', () => {
    expect(vehicleShouldPulse({ isLive: false, line: '3' }, station)).toBe(false);
    expect(vehicleShouldPulse({ isLive: false, line: '3' }, null)).toBe(false);
  });
});
