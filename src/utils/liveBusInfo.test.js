import { describe, it, expect } from 'vitest';
import { getLine19Route, pointAtAlongM } from './busRoute';
import { describeLiveBus, headsignDestination, liveBusSheetBox, liveFixAgeSeconds, fixAgeLabel, isFixDimmed, STALE_DIM_AFTER_S } from './liveBusInfo';

const dir = getLine19Route().directions[0]; // to-malvarosa
const busAt = (alongM, extra = {}) => ({
  id: 'bus-1', linea: '19', trayecto: dir.trayecto, directionKey: dir.id,
  alongM, snappedLonLat: pointAtAlongM(dir, alongM).lonLat, ...extra,
});

describe('headsignDestination', () => {
  it('takes the part after the origin, keeping hyphens inside names', () => {
    expect(headsignDestination('Est.del Nord - La Malva-rosa')).toBe('La Malva-rosa');
    expect(headsignDestination('La Malva-rosa')).toBe('La Malva-rosa');
    expect(headsignDestination('')).toBe('');
  });
});

describe('describeLiveBus', () => {
  const stop = dir.stops[5]; // 1702 m
  it('gives stops away to the selected stop when the bus is approaching', () => {
    const info = describeLiveBus(busAt(500), stop.stopCode);
    expect(info.destination).toBe('La Malva-rosa');
    expect(info.stopsAway).toBe(3); // stops at 746, 905, 1232 are before the 1702 stop and still ahead
    expect(info.nextStopName).toBeNull();
  });
  it('0 means the selected stop is the next one', () => {
    expect(describeLiveBus(busAt(1500), stop.stopCode).stopsAway).toBe(0);
  });
  it('a bus that already passed the selected stop shows its next stop instead', () => {
    const info = describeLiveBus(busAt(2000), stop.stopCode);
    expect(info.stopsAway).toBeNull();
    expect(info.nextStopName).toBe(dir.stops[6].stopName);
  });
  it('with no stop selected it shows the next stop', () => {
    const info = describeLiveBus(busAt(500), null);
    expect(info.stopsAway).toBeNull();
    expect(info.nextStopName).toBe(dir.stops[2].stopName);
  });
  it('a stop that is not on the bus direction falls back to the next stop', () => {
    const info = describeLiveBus(busAt(500), '99999');
    expect(info.stopsAway).toBeNull();
    expect(info.nextStopName).toBe(dir.stops[2].stopName);
  });
  it('unknown direction still returns the headsign', () => {
    const info = describeLiveBus({ id: 'x', trayecto: 'A - B', directionKey: 'nope', alongM: 0, snappedLonLat: [0, 0] }, null);
    expect(info).toMatchObject({ destination: 'B', stopsAway: null, nextStopName: null });
  });
});

describe('liveBusSheetBox', () => {
  it('spans the width in portrait', () => {
    expect(liveBusSheetBox(false)).toMatchObject({ left: 12, right: 12, maxWidth: 380 });
  });
  it('stops short of the right-hand stop board (34vw wide at right 16) in landscape', () => {
    const box = liveBusSheetBox(true);
    expect(box.right).toBe('auto');
    expect(box.width).toBe('min(380px, calc(66vw - 40px))');
  });
});

describe('fix age', () => {
  it('measures the age from the fix time, falls back to the polled age, else null', () => {
    expect(liveFixAgeSeconds({ fixTimeMs: 1000 }, 13000)).toBe(12);
    expect(liveFixAgeSeconds({ fixTimeMs: 5000 }, 1000)).toBe(0);
    expect(liveFixAgeSeconds({ ageSeconds: 7 }, 1000)).toBe(7);
    expect(liveFixAgeSeconds({}, 1000)).toBeNull();
  });
  it('words seconds, then minutes, and nothing when unknown', () => {
    const t = (k, v) => `${k}:${JSON.stringify(v)}`;
    expect(fixAgeLabel(t, 12)).toBe('bus.liveBusAgeSeconds:{"seconds":12}');
    expect(fixAgeLabel(t, 125)).toBe('bus.liveBusAgeMinutes:{"minutes":2}');
    expect(fixAgeLabel(t, null)).toBe('');
  });
});

describe('isFixDimmed', () => {
  it('dims only fixes older than 60 s', () => {
    expect(STALE_DIM_AFTER_S).toBe(60);
    expect(isFixDimmed(0)).toBe(false);
    expect(isFixDimmed(60)).toBe(false);
    expect(isFixDimmed(61)).toBe(true);
    expect(isFixDimmed(119)).toBe(true);
  });
  it('never dims an unknown age', () => {
    expect(isFixDimmed(null)).toBe(false);
    expect(isFixDimmed(undefined)).toBe(false);
  });
});
