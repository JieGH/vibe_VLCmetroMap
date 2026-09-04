import { describe, it, expect, beforeEach } from 'vitest';
import trainPositionEngine, { haversineDistance } from './trainPositionEngine';
import arrivalStore, { STRATEGIC_HUBS, MAJOR_STATIONS } from './arrivalStore';
import paradasApi from '../data/paradas_api.json';
import segmentTimes from '../data/segment_times.json';

const stationByName = (lineId, name) =>
  trainPositionEngine.getLineStations(lineId).find(s => s.name === name);

describe('station ids used to reach the API', () => {
  const apiStationsById = new Map(paradasApi.map(p => [Number(p.id), p.nombre]));

  // A hub pointing at the wrong id fails silently: the fetch succeeds, the
  // station just isn't the one we meant. Seeding 122 ("Francesc Cubells")
  // instead of Marítim left lines 5 and 7 with no live trains at all.
  it.each(STRATEGIC_HUBS)('strategic hub $name resolves to itself', (hub) => {
    expect(apiStationsById.get(hub.id)).toBe(hub.name);
  });

  it.each(MAJOR_STATIONS)('major station $name resolves to itself', (station) => {
    expect(apiStationsById.get(station.id)).toBe(station.name);
  });

  it('reaches every line from the Major Stations', () => {
    const covered = new Set();
    for (const station of MAJOR_STATIONS) {
      for (let l = 1; l <= 10; l++) {
        const lineId = String(l);
        if (stationByName(lineId, station.name)) covered.add(lineId);
      }
    }
    expect([...covered].sort((a, b) => Number(a) - Number(b)))
      .toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
  });
});

describe('network coverage', () => {
  it('runs lines 5 and 7 through Ayora to Marítim', () => {
    for (const lineId of ['5', '7']) {
      const names = trainPositionEngine.getLineStations(lineId).map(s => s.name);
      expect(names).toContain('Ayora');
      expect(names).toContain('Amistat');
      expect(names).toContain('Aragó');
      expect(names).toContain('Marítim');
    }
  });

  it('orders the eastern chain correctly along the track', () => {
    // Marítim is the eastern terminus, so walking inland from it the stations
    // must appear in service order. Track distance runs the opposite way on
    // each line, so compare the sequence rather than raw distances.
    const chain = ['Marítim', 'Ayora', 'Amistat', 'Aragó', 'Alameda'];
    for (const lineId of ['5', '7']) {
      const distances = chain.map(n => stationByName(lineId, n).trackDist);
      const ascending = distances.every((d, i) => i === 0 || d > distances[i - 1]);
      const descending = distances.every((d, i) => i === 0 || d < distances[i - 1]);
      expect(ascending || descending).toBe(true);
    }
  });

  it('places every station in a chain on that line’s track', () => {
    for (let l = 1; l <= 10; l++) {
      const lineId = String(l);
      if (!trainPositionEngine.getLineTrack(lineId)) continue;
      for (const station of trainPositionEngine.getLineStations(lineId)) {
        const { coordinates } = trainPositionEngine
          .getCoordsAndBearingAtDistance(lineId, station.trackDist, true);
        const offTrack = haversineDistance(station.coords, coordinates);
        // A station in the chain sets the anchor points the walk interpolates
        // between, so one matched to the wrong track corrupts every position
        // computed through it.
        expect(offTrack, `${lineId} ${station.name}`).toBeLessThan(300);
      }
    }
  });

  it('holds out stations whose line geometry cannot reach them', () => {
    const offTrack = trainPositionEngine.offTrackStations.map(s => `${s.line}:${s.name}`);
    // Every remaining gap is a branch missing from metro_lines.json, not a
    // data error: lines 5 and 7 run north to Machado, line 1 to Torrent
    // Avinguda, and line 8 through-services down the line 6 corridor, but none
    // of those polylines cover the branch.
    expect(offTrack).toContain('5:Machado');
    expect(offTrack).toContain('7:Machado');
    expect(offTrack).toContain('1:Torrent Avinguda');
    expect(offTrack.length).toBeLessThan(20);

    // But the chains that remain must still be usable. Line 8 is legitimately
    // short: its geometry is the Marítim ↔ Neptú shuttle, and the stations held
    // out of it are the through-services that run down the line 6 corridor.
    expect(trainPositionEngine.getLineStations('8').map(s => s.name))
      .toEqual(['Neptú', 'Grau - La Marina', 'Francesc Cubells', 'Marítim']);

    for (let l = 1; l <= 10; l++) {
      if (l === 8) continue;
      expect(
        trainPositionEngine.getLineStations(String(l)).length,
        `line ${l} chain`
      ).toBeGreaterThan(7);
    }
  });
});

describe('track geometry fidelity', () => {
  // Locked deliberately. The polylines are simplified to keep them out of the
  // JS chunk, and the failure mode of over-simplifying is silent: a station
  // drifts past the 250 m off-track threshold, drops out of its chain, and
  // every position computed through that stretch shifts. Chain sizes catch
  // that; a diff here means the network shape changed, not just the geometry.
  const EXPECTED_CHAIN_SIZES = {
    1: 40, 2: 34, 3: 27, 4: 31, 5: 18, 6: 21, 7: 16, 8: 4, 9: 23, 10: 8,
  };

  // Metres. Simplification must not change how long a line is.
  const EXPECTED_TRACK_LENGTHS = {
    1: 72164, 2: 40097, 3: 24673, 4: 14996, 5: 13320,
    6: 8854, 7: 15738, 8: 1282, 9: 23418, 10: 5017,
  };

  it('keeps every line chain intact', () => {
    const actual = {};
    for (let l = 1; l <= 10; l++) actual[l] = trainPositionEngine.getLineStations(String(l)).length;
    expect(actual).toEqual(EXPECTED_CHAIN_SIZES);
  });

  it('preserves each line’s length to within 0.5%', () => {
    for (const [line, expected] of Object.entries(EXPECTED_TRACK_LENGTHS)) {
      const actual = trainPositionEngine.getLineTrack(line).totalLength;
      const drift = Math.abs(actual - expected) / expected;
      expect(drift, `line ${line}: ${Math.round(actual)}m vs ${expected}m`).toBeLessThan(0.005);
    }
  });

  it('keeps every station close to where it projected before', () => {
    // A station's trackDist is the anchor the walk interpolates from, so a
    // shift here moves every train near it by the same amount.
    for (let l = 1; l <= 10; l++) {
      const lineId = String(l);
      for (const station of trainPositionEngine.getLineStations(lineId)) {
        const { coordinates } = trainPositionEngine
          .getCoordsAndBearingAtDistance(lineId, station.trackDist, true);
        expect(
          haversineDistance(station.coords, coordinates),
          `${lineId} ${station.name}`
        ).toBeLessThan(250);
      }
    }
  });
});

describe('walking the station chain', () => {
  it('puts a train at the platform when its countdown is spent', () => {
    const position = trainPositionEngine
      .estimatePositionFromArrival('3', 'Rafelbunyol', 'Xàtiva', 0);
    const xativa = stationByName('3', 'Xàtiva');
    expect(position.status).toBe('At Platform');
    expect(Math.abs(position.distanceAlongTrack - xativa.trackDist)).toBeLessThan(1);
  });

  it('puts a train one segment back when the countdown matches one segment', () => {
    const target = stationByName('3', 'Xàtiva');
    const previous = stationByName('3', 'Colón');
    const segment = trainPositionEngine.getSegmentSeconds('3', previous, target);

    // Colón → Xàtiva heading west (towards Aeroport, decreasing track distance).
    const position = trainPositionEngine
      .estimatePositionFromArrival('3', 'Aeroport', 'Xàtiva', segment - segmentTimes.dwellSeconds);

    expect(Math.abs(position.distanceAlongTrack - previous.trackDist)).toBeLessThan(30);
  });

  it('advances monotonically towards the target as the countdown shrinks', () => {
    const target = stationByName('3', 'Àngel Guimerà');
    let previousGap = Infinity;

    for (let seconds = 600; seconds >= 0; seconds -= 30) {
      const position = trainPositionEngine
        .estimatePositionFromArrival('3', 'Rafelbunyol', 'Àngel Guimerà', seconds);
      const gap = Math.abs(position.distanceAlongTrack - target.trackDist);
      expect(gap).toBeLessThanOrEqual(previousGap + 1);
      previousGap = gap;
    }
    expect(previousGap).toBeLessThan(1);
  });

  it('never places a train beyond the end of the line', () => {
    const track = trainPositionEngine.getLineTrack('5');
    for (const seconds of [0, 120, 600, 1080, 3600]) {
      for (const destination of ['Marítim', 'Aeroport']) {
        const position = trainPositionEngine
          .estimatePositionFromArrival('5', destination, 'Xàtiva', seconds);
        expect(position.distanceAlongTrack).toBeGreaterThanOrEqual(0);
        expect(position.distanceAlongTrack).toBeLessThanOrEqual(track.totalLength);
      }
    }
  });

  it('walks opposite ways for opposite headsigns', () => {
    const east = trainPositionEngine
      .estimatePositionFromArrival('3', 'Rafelbunyol', 'Àngel Guimerà', 300);
    const west = trainPositionEngine
      .estimatePositionFromArrival('3', 'Aeroport', 'Àngel Guimerà', 300);

    expect(east.isForward).not.toBe(west.isForward);
    const target = stationByName('3', 'Àngel Guimerà');
    // One approaches from each side of the station.
    expect(
      Math.sign(east.distanceAlongTrack - target.trackDist)
    ).not.toBe(
      Math.sign(west.distanceAlongTrack - target.trackDist)
    );
  });

  it('tracks the timetable rather than one flat speed', () => {
    // The engine used to place trains at a flat 10.5 m/s. On the slow city
    // segments the timetable walk must land materially closer to the station.
    const target = stationByName('3', 'Alameda');
    const position = trainPositionEngine
      .estimatePositionFromArrival('3', 'Aeroport', 'Alameda', 480);

    const walked = Math.abs(position.distanceAlongTrack - target.trackDist);
    const flatSpeedWouldGive = 10.5 * 480;
    expect(walked).toBeLessThan(flatSpeedWouldGive * 0.85);
  });
});

describe('fusing repeat sightings of one train', () => {
  beforeEach(() => {
    arrivalStore.memory.clear();
    trainPositionEngine.renderState.clear();
  });

  const sighting = (key, stationName, line, destination, vehicleId, secondsFromNow, now) => {
    arrivalStore.memory.set(key, {
      stationId: key,
      stationName,
      fetchedAt: now,
      arrivals: [{
        line, destination, vehicleId,
        targetTimestamp: now + secondsFromNow * 1000,
        isLive: true,
      }],
    });
  };

  it('treats one vehicle seen at two stations as one train', () => {
    const now = Date.now();
    sighting('a', 'Xàtiva', '3', 'Rafelbunyol', '3704', 60, now);
    sighting('b', 'Alameda', '3', 'Rafelbunyol', '3704', 300, now);

    const vehicles = trainPositionEngine.getLiveVehiclesFromMemory(now);
    expect(vehicles).toHaveLength(1);
    expect(vehicles[0].sightingCount).toBe(2);
  });

  it('anchors on the nearest sighting, where the walk is shortest', () => {
    const now = Date.now();
    sighting('a', 'Xàtiva', '3', 'Rafelbunyol', '3704', 60, now);
    sighting('b', 'Alameda', '3', 'Rafelbunyol', '3704', 300, now);

    const [vehicle] = trainPositionEngine.getLiveVehiclesFromMemory(now);
    const xativa = stationByName('3', 'Xàtiva');
    // 60s out from Xàtiva puts it within one segment of that station.
    expect(Math.abs(vehicle.distanceAlongTrack - xativa.trackDist)).toBeLessThan(900);
  });

  it('derives direction from two sightings without trusting the headsign', () => {
    const now = Date.now();
    // Nonsense headsign: only the sighting order can settle direction here.
    sighting('a', 'Xàtiva', '3', 'Not A Station', '3704', 60, now);
    sighting('b', 'Alameda', '3', 'Not A Station', '3704', 300, now);

    const [vehicle] = trainPositionEngine.getLiveVehiclesFromMemory(now);
    const xativa = stationByName('3', 'Xàtiva');
    const alameda = stationByName('3', 'Alameda');
    // It reaches Alameda later, so it is travelling Xàtiva → Alameda.
    expect(vehicle.isForward).toBe(alameda.trackDist > xativa.trackDist);
  });

  it('keeps two different vehicles apart', () => {
    const now = Date.now();
    sighting('a', 'Xàtiva', '3', 'Rafelbunyol', '3704', 60, now);
    sighting('b', 'Alameda', '3', 'Rafelbunyol', '3713', 300, now);

    expect(trainPositionEngine.getLiveVehiclesFromMemory(now)).toHaveLength(2);
  });

  it('drops sightings that are too stale or too far ahead', () => {
    const now = Date.now();
    sighting('a', 'Xàtiva', '3', 'Rafelbunyol', '3704', -120, now);
    sighting('b', 'Alameda', '3', 'Rafelbunyol', '3713', 2000, now);

    expect(trainPositionEngine.getLiveVehiclesFromMemory(now)).toHaveLength(0);
  });
});

describe('segment times', () => {
  it('covers every line with plausible speeds', () => {
    for (let l = 1; l <= 10; l++) {
      const line = segmentTimes.lines[String(l)];
      expect(line, `line ${l}`).toBeDefined();
      expect(line.segmentCount).toBeGreaterThan(5);

      const speed = (line.fallback || segmentTimes.networkFallback).metresPerSecond;
      expect(speed, `line ${l} fallback`).toBeGreaterThan(3);
      expect(speed, `line ${l} fallback`).toBeLessThan(30);
    }
  });

  it('times the eastern chain from the timetable, not the fallback', () => {
    // These segments were fallback-estimated while the feed was stale. The
    // current feed carries them, so they must resolve to a real entry.
    const line5 = segmentTimes.lines['5'].segments;
    const chain = ['Marítim', 'Ayora', 'Amistat', 'Aragó', 'Alameda'];

    for (let i = 0; i + 1 < chain.length; i++) {
      const from = stationByName('5', chain[i]);
      const to = stationByName('5', chain[i + 1]);
      const covered = line5[`${from.stopId}>${to.stopId}`] || line5[`${to.stopId}>${from.stopId}`];
      expect(covered, `${chain[i]} → ${chain[i + 1]}`).toBeDefined();
    }
  });

  it('falls back to distance where the timetable has no entry', () => {
    const stations = trainPositionEngine.getLineStations('5');
    const fabricated = { stopId: 'no-such-stop', trackDist: stations[0].trackDist + 800 };
    const seconds = trainPositionEngine.getSegmentSeconds('5', stations[0], fabricated);

    expect(seconds).toBeGreaterThan(40);
    expect(seconds).toBeLessThan(300);
  });
});
