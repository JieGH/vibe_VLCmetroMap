import { describe, it, expect, beforeEach } from 'vitest';
import arrivalStore from './arrivalStore';
import { getStationFocus } from './stationFocus';

// Àngel Guimerà is the network's densest interchange and sits mid-line on
// line 3, so it is the case that actually has two directions.
const ANGEL_GUIMERA = { apiId: 17, name: 'Àngel Guimerà', lines: ['1', '2', '3', '5', '9'] };
const RAFELBUNYOL = { apiId: 1, name: 'Rafelbunyol', lines: ['3'] };

const remember = (station, arrivals, now, fetchedAt = now) => {
  arrivalStore.memory.set(String(station.apiId), {
    stationId: station.apiId,
    stationName: station.name,
    fetchedAt,
    arrivals: arrivals.map((a) => ({
      line: a.line,
      destination: a.destination,
      vehicleId: a.vehicleId ?? null,
      lineColor: '#888',
      lineName: `Line ${a.line}`,
      targetTimestamp: now + a.inSeconds * 1000,
      isLive: true,
    })),
  });
};

describe('bringing a station into focus', () => {
  beforeEach(() => arrivalStore.memory.clear());

  it('splits arrivals into the two directions the station is served in', () => {
    const now = Date.now();
    remember(ANGEL_GUIMERA, [
      { line: '3', destination: 'Rafelbunyol', inSeconds: 120 },
      { line: '3', destination: 'Aeroport', inSeconds: 300 },
    ], now);

    const focus = getStationFocus(ANGEL_GUIMERA, now);

    expect(focus.directions).toHaveLength(2);
    const labels = focus.directions.map((d) => d.label);
    expect(labels).toContain('Rafelbunyol');
    expect(labels).toContain('Aeroport');
  });

  // "Both directions if applicable" — a terminus has one.
  it('gives a terminus a single direction', () => {
    const now = Date.now();
    remember(RAFELBUNYOL, [
      { line: '3', destination: 'Aeroport', inSeconds: 90 },
      { line: '3', destination: 'Aeroport', inSeconds: 480 },
    ], now);

    const focus = getStationFocus(RAFELBUNYOL, now);

    expect(focus.directions).toHaveLength(1);
    expect(focus.directions[0].label).toBe('Aeroport');
    expect(focus.directions[0].arrivals).toHaveLength(2);
  });

  it('sets direction label to the soonest Arrival destination, not multi-terminus chains', () => {
    const now = Date.now();
    remember(ANGEL_GUIMERA, [
      { line: '3', destination: 'Rafelbunyol', inSeconds: 200 },
      { line: '1', destination: 'Bétera', inSeconds: 260 },
      { line: '3', destination: 'Aeroport', inSeconds: 90 },
    ], now);

    const focus = getStationFocus(ANGEL_GUIMERA, now);
    const towardsAeroport = focus.directions.find((d) => d.destinations.includes('Aeroport'));
    const theOtherWay = focus.directions.find((d) => d !== towardsAeroport);

    expect(theOtherWay.destinations).toContain('Rafelbunyol');
    expect(theOtherWay.destinations).toContain('Bétera');
    // Clear destination of the upcoming train only, not multi-destination chains
    expect(theOtherWay.destination).toBe('Rafelbunyol');
    expect(theOtherWay.label).toBe('Rafelbunyol');
  });

  it('places whichever direction has the soonest arrival at the top of the directions list', () => {
    const now = Date.now();
    // Test 1: Aeroport (backward) due in 60s, Rafelbunyol (forward) due in 300s
    remember(ANGEL_GUIMERA, [
      { line: '3', destination: 'Rafelbunyol', inSeconds: 300 },
      { line: '3', destination: 'Aeroport', inSeconds: 60 },
    ], now);

    const focus1 = getStationFocus(ANGEL_GUIMERA, now);
    expect(focus1.directions).toHaveLength(2);
    expect(focus1.directions[0].destination).toBe('Aeroport');
    expect(focus1.directions[0].arrivals[0].seconds).toBe(60);
    expect(focus1.directions[1].destination).toBe('Rafelbunyol');
    expect(focus1.directions[1].arrivals[0].seconds).toBe(300);

    // Test 2: Rafelbunyol (forward) due in 45s, Aeroport (backward) due in 240s
    remember(ANGEL_GUIMERA, [
      { line: '3', destination: 'Rafelbunyol', inSeconds: 45 },
      { line: '3', destination: 'Aeroport', inSeconds: 240 },
    ], now);

    const focus2 = getStationFocus(ANGEL_GUIMERA, now);
    expect(focus2.directions).toHaveLength(2);
    expect(focus2.directions[0].destination).toBe('Rafelbunyol');
    expect(focus2.directions[0].arrivals[0].seconds).toBe(45);
    expect(focus2.directions[1].destination).toBe('Aeroport');
    expect(focus2.directions[1].arrivals[0].seconds).toBe(240);
  });

  // The marker draws each direction as an arm pointing the way the track
  // actually leaves the station, so the two arms of a single line must come out
  // roughly opposite rather than being assumed to be up and down.
  it('points each direction along the track it leaves on', () => {
    const now = Date.now();
    remember(ANGEL_GUIMERA, [
      { line: '3', destination: 'Rafelbunyol', inSeconds: 120 },
      { line: '3', destination: 'Aeroport', inSeconds: 300 },
    ], now);

    const [a, b] = getStationFocus(ANGEL_GUIMERA, now).directions;
    const separation = (((a.bearing - b.bearing) % 360) + 360) % 360;
    const apart = Math.abs(separation - 180);
    expect(a.bearing).toBeGreaterThanOrEqual(0);
    expect(a.bearing).toBeLessThan(360);
    expect(apart, `${a.bearing}° vs ${b.bearing}°`).toBeLessThan(30);
  });

  it('averages bearings the short way round the compass', () => {
    const now = Date.now();
    remember(RAFELBUNYOL, [{ line: '3', destination: 'Aeroport', inSeconds: 90 }], now);
    const [only] = getStationFocus(RAFELBUNYOL, now).directions;
    expect(Number.isFinite(only.bearing)).toBe(true);
  });

  it('orders each direction by how soon the train arrives', () => {
    const now = Date.now();
    remember(ANGEL_GUIMERA, [
      { line: '3', destination: 'Rafelbunyol', inSeconds: 600 },
      { line: '1', destination: 'Bétera', inSeconds: 120 },
      { line: '9', destination: 'Alboraia', inSeconds: 340 },
    ], now);

    for (const direction of getStationFocus(ANGEL_GUIMERA, now).directions) {
      const seconds = direction.arrivals.map((a) => a.seconds);
      expect(seconds).toEqual([...seconds].sort((a, b) => a - b));
    }
  });

  it('gives the panel one flat table, however the directions fell out', () => {
    const now = Date.now();
    remember(ANGEL_GUIMERA, [
      { line: '3', destination: 'Rafelbunyol', inSeconds: 600 },
      { line: '3', destination: 'Aeroport', inSeconds: 120 },
    ], now);

    const focus = getStationFocus(ANGEL_GUIMERA, now);
    expect(focus.arrivals.map((a) => a.seconds)).toEqual([120, 600]);
  });

  // The panel has to say which it is: a live answer was fetched now, a memory
  // answer is a countdown running on from an older fetch.
  it('reports a fresh fetch as live and an old one as memory', () => {
    const now = Date.now();
    remember(ANGEL_GUIMERA, [{ line: '3', destination: 'Aeroport', inSeconds: 300 }], now);
    expect(getStationFocus(ANGEL_GUIMERA, now).isFresh).toBe(true);

    remember(ANGEL_GUIMERA, [{ line: '3', destination: 'Aeroport', inSeconds: 300 }], now, now - 180000);
    const stale = getStationFocus(ANGEL_GUIMERA, now);
    expect(stale.isFresh).toBe(false);
    expect(stale.secondsUnheard).toBe(180);
  });

  it('says so plainly when there is nothing in memory at all', () => {
    const focus = getStationFocus(ANGEL_GUIMERA, Date.now());
    expect(focus.arrivals).toEqual([]);
    expect(focus.directions).toEqual([]);
    expect(focus.isFresh).toBe(false);
  });

  it('survives a station with no live prediction endpoint', () => {
    const focus = getStationFocus({ name: 'Ayora', lines: ['5', '7'] }, Date.now());
    expect(focus.name).toBe('Ayora');
    expect(focus.arrivals).toEqual([]);
  });
});

describe('laterArrivals', () => {
  it('leaves out the train each direction already headlines', () => {
    const now = Date.now();
    remember(ANGEL_GUIMERA, [
      { line: '3', destination: 'Rafelbunyol', seconds: 120 },
      { line: '3', destination: 'Rafelbunyol', seconds: 600 },
      { line: '5', destination: 'Marítim', seconds: 240 },
    ], now);

    const focus = getStationFocus(ANGEL_GUIMERA, now);

    expect(focus.arrivals).toHaveLength(3);
    // Two directions, so two headlines; only what neither headlined is left.
    const headlined = focus.directions.map((d) => d.arrivals[0]);
    expect(headlined).toHaveLength(focus.directions.length);
    expect(focus.laterArrivals).toHaveLength(3 - focus.directions.length);
    for (const arrival of headlined) {
      expect(focus.laterArrivals).not.toContain(arrival);
    }
  });

  it('says nothing more when the headlines have said it all', () => {
    // The case that made the panel read as a stutter: two trains due, two
    // direction rows, and a table repeating both of them verbatim.
    const now = Date.now();
    remember(RAFELBUNYOL, [{ line: '3', destination: 'Aeroport', seconds: 300 }], now);

    const focus = getStationFocus(RAFELBUNYOL, now);

    expect(focus.arrivals).toHaveLength(1);
    expect(focus.laterArrivals).toEqual([]);
  });

  it('keeps every arrival when no direction could be resolved', () => {
    // An Off-Track Station has no trustworthy direction, so nothing is
    // headlined and the table stays the whole story.
    const now = Date.now();
    const offTrack = { apiId: 68, name: 'Fira València', lines: ['4'] };
    remember(offTrack, [{ line: '4', destination: 'Mas del Rosari', seconds: 180 }], now);

    const focus = getStationFocus(offTrack, now);

    expect(focus.directions).toEqual([]);
    expect(focus.laterArrivals).toHaveLength(1);
  });
});
