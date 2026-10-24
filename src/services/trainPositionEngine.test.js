import { describe, it, expect, beforeEach } from 'vitest';
import trainPositionEngine, {
  haversineDistance,
  estimatePositionUncertainty,
  confidenceFromUncertainty,
  MIN_POSITION_CONFIDENCE,
  MIN_WALKED_CONFIDENCE,
} from './trainPositionEngine';
import arrivalStore, { STRATEGIC_HUBS, MAJOR_STATIONS } from './arrivalStore';
import paradasApi from '../data/paradas_api.json';
import segmentTimes from '../data/segment_times.json';

const stationByName = (lineId, name) =>
  trainPositionEngine.getLineStations(lineId).find(s => s.name === name);

// One sighting of one vehicle at one station, written straight into arrival
// memory. `fetchedAt` defaults to now: a station heard from this instant.
const sighting = (key, stationName, line, destination, vehicleId, secondsFromNow, now, fetchedAt = now) => {
  arrivalStore.memory.set(key, {
    stationId: key,
    stationName,
    fetchedAt,
    arrivals: [{
      line, destination, vehicleId,
      targetTimestamp: now + secondsFromNow * 1000,
      isLive: true,
    }],
  });
};

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
    1: 40, 2: 34, 3: 27, 4: 30, 5: 18, 6: 19, 7: 16, 8: 4, 9: 23, 10: 8,
  };

  // Outbound chains only. Lines 4 and 6 are one-way along the coast (ADR-0007),
  // so their outbound chain loses Cabanyal (and, on line 6, Dr. Lluch), which
  // trams call at only on the way back.

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

  // There is deliberately no "stations are still near their track" test here.
  // The engine filters its chains to offTrackMetres <= 250 when it builds them,
  // so any such assertion re-measures an already-filtered set and cannot fail —
  // over-simplification would show up as a station silently *leaving* a chain,
  // which is what the chain-size test above actually catches.
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

  // The line 6 polyline projects La Cadena after Beteró, though trains bound
  // for Marítim reach it first, so that one pair reads backwards.
  it('settles direction by every sighting, not one misplaced Station', () => {
    const now = Date.now();
    sighting('a', 'La Cadena', '6', 'Marítim', '6038', 20, now);
    sighting('b', 'Beteró', '6', 'Marítim', '6038', 100, now);
    sighting('c', 'Platja Malva-rosa', '6', 'Marítim', '6038', 300, now);
    sighting('d', 'Platja les Arenes', '6', 'Marítim', '6038', 360, now);

    const [vehicle] = trainPositionEngine.getLiveVehiclesFromMemory(now);
    const maritim = stationByName('6', 'Marítim');
    const tossal = stationByName('6', 'Tossal del Rei');
    expect(vehicle.isForward).toBe(maritim.trackDist > tossal.trackDist);
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

describe('how confident a placed train is', () => {
  beforeEach(() => {
    arrivalStore.memory.clear();
    trainPositionEngine.renderState.clear();
  });

  const vehicleAt = (station, secondsFromNow, now, fetchedAt = now) => {
    arrivalStore.memory.clear();
    sighting('a', station, '3', 'Rafelbunyol', '3704', secondsFromNow, now, fetchedAt);
    return trainPositionEngine.getLiveVehiclesFromMemory(now)[0];
  };

  // The two ends of the range #7 quotes, checked against the real Commercial
  // Speeds rather than the network median: line 6 is the slowest line at
  // 4.1 m/s, line 1 the fastest at 11.01 m/s.
  it('sizes uncertainty from the walk length and the line’s speed', () => {
    const oneSegmentOnLine6 = estimatePositionUncertainty(1, 0, trainPositionEngine.getLineTrack('6').fallbackSpeed);
    const nineSegmentsOnLine1 = estimatePositionUncertainty(9, 0, trainPositionEngine.getLineTrack('1').fallbackSpeed);

    expect(Math.round(oneSegmentOnLine6)).toBe(123);
    expect(Math.round(nineSegmentsOnLine1)).toBe(991);
  });

  it('holds full confidence while uncertainty stays inside one segment', () => {
    expect(confidenceFromUncertainty(0)).toBe(1);
    expect(confidenceFromUncertainty(200)).toBe(1);
    expect(confidenceFromUncertainty(360)).toBeCloseTo(0.8, 1);
    expect(confidenceFromUncertainty(600)).toBeCloseTo(0.5, 1);
  });

  it('never drops a train below the visible floor', () => {
    expect(confidenceFromUncertainty(100000)).toBe(MIN_WALKED_CONFIDENCE);
    expect(MIN_POSITION_CONFIDENCE).toBeGreaterThan(0.3);
  });

  it('is certain about a train standing at the platform it was reported at', () => {
    const now = Date.now();
    expect(vehicleAt('Xàtiva', 0, now).positionConfidence).toBe(1);
  });

  // A train a few seconds past its predicted arrival is sitting out its Station
  // Dwell at the platform the API named, which is the best-known position there
  // is. Reading Dead Reckoning off the sign of the countdown used to flip it
  // from certain to the floor one second after its arrival time.
  it('stays certain about a train still sitting out its dwell', () => {
    const now = Date.now();
    const justArrived = vehicleAt('Xàtiva', -10, now);

    expect(justArrived.status).toBe('At Platform');
    expect(justArrived.isDeadReckoned).toBe(false);
    expect(justArrived.positionConfidence).toBe(1);
  });

  // The headline requirement of #7: on one line, the longer the walk the less
  // confident the position, because every segment stepped adds ±30s of the
  // feed's minute-quantisation.
  it('is less confident about a long countdown than a short one on the same line', () => {
    const now = Date.now();
    const near = vehicleAt('Xàtiva', 120, now);
    const far = vehicleAt('Xàtiva', 1000, now);

    expect(far.line).toBe(near.line);
    expect(far.positionUncertaintyMetres).toBeGreaterThan(near.positionUncertaintyMetres);
    expect(far.positionConfidence).toBeLessThan(near.positionConfidence);
  });

  // A prediction does not rot by sitting in memory — targetTimestamp is
  // absolute, so the countdown stays honest. What rots is the train drifting
  // from the schedule the API predicted, and that grows with missed syncs.
  it('loses confidence in a train whose syncs have gone missing', () => {
    const now = Date.now();
    const synced = vehicleAt('Xàtiva', 300, now, now - 120000);
    const abandoned = vehicleAt('Xàtiva', 300, now, now - 360000);

    expect(abandoned.positionConfidence).toBeLessThan(synced.positionConfidence);
    // One sync interval is the healthy cadence, so it must cost nothing.
    expect(synced.positionConfidence).toBe(vehicleAt('Xàtiva', 300, now).positionConfidence);
  });

  it('drops a dead-reckoned train to the floor however fresh its prediction is', () => {
    const now = Date.now();
    const approaching = vehicleAt('Xàtiva', 120, now);
    const pastDue = vehicleAt('Xàtiva', -18, now);

    expect(pastDue.isDeadReckoned).toBe(true);
    expect(pastDue.positionConfidence).toBe(MIN_POSITION_CONFIDENCE);
    expect(pastDue.positionConfidence).toBeLessThan(approaching.positionConfidence);
    expect(approaching.isDeadReckoned).toBe(false);
  });

  // Uncertainty is metres, so it scales with the line's Commercial Speed, and
  // on the fastest lines a full-length countdown alone runs past 1 km. Without
  // a floor of its own for the walk, a dead-reckoned train on line 1 would be
  // drawn exactly like one that still has a prediction to spend.
  it('keeps a dead-reckoned train fainter than any walked position, on every line', () => {
    expect(MIN_POSITION_CONFIDENCE).toBeLessThan(MIN_WALKED_CONFIDENCE);
    for (let l = 1; l <= 10; l++) {
      const track = trainPositionEngine.getLineTrack(String(l));
      if (!track) continue;
      const worstWalk = estimatePositionUncertainty(9, 900, track.fallbackSpeed);
      expect(confidenceFromUncertainty(worstWalk), `line ${l}`)
        .toBeGreaterThan(MIN_POSITION_CONFIDENCE);
    }
  });

  it('reports how long since the API last confirmed a train', () => {
    const now = Date.now();
    expect(vehicleAt('Xàtiva', 300, now, now - 240000).secondsUnheard).toBe(240);
  });

  it('leaves simulated trains alone', () => {
    const now = Date.now();
    const simulated = trainPositionEngine.getHeadwayVehiclesForLine('3', now);
    expect(simulated.length).toBeGreaterThan(0);
    for (const vehicle of simulated) {
      expect(vehicle.positionConfidence).toBeUndefined();
    }
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

  // Timed on the platform 2026-10-24: 42.4s dwell at Aragó, 74.1s to Alameda.
  // GTFS states 120s and leaves 107.5s of running; FGV's measured interval,
  // with its 40s dwell, lands within a few seconds of the stopwatch.
  it('prefers FGV-measured intervals and their dwell over the minute-quantised timetable', () => {
    const arago = stationByName('5', 'Aragó');
    const alameda = stationByName('5', 'Alameda');
    const timing = trainPositionEngine.getSegmentTiming('5', arago, alameda);

    expect(timing.dwell).toBe(40);
    expect(Math.abs(timing.seconds - timing.dwell - 74.1)).toBeLessThan(10);
  });

  it('falls back to distance where the timetable has no entry', () => {
    const stations = trainPositionEngine.getLineStations('5');
    const fabricated = { stopId: 'no-such-stop', trackDist: stations[0].trackDist + 800 };
    const seconds = trainPositionEngine.getSegmentSeconds('5', stations[0], fabricated);

    expect(seconds).toBeGreaterThan(40);
    expect(seconds).toBeLessThan(300);
  });
});

// docs/research/marker-drift.md: near a Station FGV re-times its countdown by
// 25s (p90) between polls, and each re-time used to slide the marker 200 m one
// way or the other.
describe('a live marker never runs backwards', () => {
  beforeEach(() => {
    arrivalStore.memory.clear();
    trainPositionEngine.renderState.clear();
  });

  const liveAt = (secondsFromNow, now) => {
    sighting('a', 'Colón', '3', 'Aeroport', '3704', secondsFromNow, now);
    return trainPositionEngine.getAllVehicles(now).find(v => v.isLive);
  };
  const progress = (vehicle) => vehicle.distanceAlongTrack * (vehicle.isForward ? 1 : -1);

  it('waits where it is when a prediction is re-timed later', () => {
    const now = Date.now();
    const before = liveAt(40, now);
    // The train is held: the next poll says 40s more, not 39.
    const after = liveAt(80, now + 1000);

    expect(progress(after)).toBe(progress(before));
  });

  it('catches up no faster than a train could when re-timed sooner', () => {
    const now = Date.now();
    const before = liveAt(90, now);
    const after = liveAt(45, now + 1000);

    const moved = progress(after) - progress(before);
    expect(moved).toBeGreaterThan(0);
    expect(moved).toBeLessThanOrEqual(25);
  });

  it('goes straight to a reading far down the line', () => {
    const now = Date.now();
    liveAt(30, now);
    const colon = stationByName('3', 'Colón');
    const after = liveAt(900, now + 1000);

    expect(Math.abs(after.distanceAlongTrack - colon.trackDist)).toBeGreaterThan(1500);
  });
});

describe('where a train that has called at a Station is drawn', () => {
  beforeEach(() => {
    arrivalStore.memory.clear();
    trainPositionEngine.renderState.clear();
  });

  it('anchors on the Station ahead even when the passed one is nearer in time', () => {
    const now = Date.now();
    sighting('a', 'Xàtiva', '3', 'Rafelbunyol', '3704', -5, now);
    sighting('b', 'Colón', '3', 'Rafelbunyol', '3704', 80, now);

    const [vehicle] = trainPositionEngine.getLiveVehiclesFromMemory(now);
    expect(vehicle.targetStation).not.toBe('Xàtiva');
    expect(vehicle.secondsToTarget).toBe(80);
  });

  it('holds a train at the platform past its dwell instead of walking it out', () => {
    const now = Date.now();
    sighting('a', 'Xàtiva', '3', 'Rafelbunyol', '3704', -18, now);

    const [vehicle] = trainPositionEngine.getLiveVehiclesFromMemory(now);
    expect(vehicle.status).toBe('At Platform');
    expect(vehicle.distanceAlongTrack).toBe(stationByName('3', 'Xàtiva').trackDist);
    expect(vehicle.isDeadReckoned).toBe(true);
  });
});

// docs/research/marker-drift.md, phase 4: a 40s dwell carved out of a
// minute-quantised interval walked trains at 25-40 m/s.
describe('how fast the walk may run a train', () => {
  const fastestSegment = (lineId) => {
    const stations = trainPositionEngine.getLineStations(lineId);
    let fastest = 0;
    for (let i = 0; i + 1 < stations.length; i++) {
      const timing = trainPositionEngine.getSegmentTiming(lineId, stations[i], stations[i + 1]);
      const metres = Math.abs(stations[i + 1].trackDist - stations[i].trackDist);
      fastest = Math.max(fastest, metres / (timing.seconds - timing.dwell));
    }
    return fastest;
  };

  it('never runs a metro segment faster than 17 m/s', () => {
    for (const line of ['1', '2', '3', '5', '7', '9']) {
      expect(fastestSegment(line), `line ${line}`).toBeLessThanOrEqual(17 + 1e-9);
    }
  });

  it('holds trams to a tram speed rather than the metro ceiling', () => {
    for (const line of ['4', '6']) {
      expect(fastestSegment(line), `line ${line}`).toBeLessThan(13);
    }
  });

  it('catches up at the train’s own pace, within a floor and a ceiling', () => {
    expect(trainPositionEngine.catchUpRate({ runningSpeed: 5 })).toBe(10);
    expect(trainPositionEngine.catchUpRate({ runningSpeed: 1 })).toBe(6);
    expect(trainPositionEngine.catchUpRate({ runningSpeed: 16 })).toBe(20);
    expect(trainPositionEngine.catchUpRate({})).toBe(15);
  });
});

describe('the one-way coastal section (issue #84)', () => {
  const names = (lineId, isForward) =>
    trainPositionEngine.getLineStations(lineId, isForward).map(s => s.name);
  const at = (lineId, name, isForward) =>
    trainPositionEngine.getLineStations(lineId, isForward).find(s => s.name === name);

  beforeEach(() => {
    arrivalStore.memory.clear();
    trainPositionEngine.renderState.clear();
  });

  it('serves the beach going out and Cabanyal coming back, on both lines', () => {
    for (const lineId of ['4', '6']) {
      expect(names(lineId, true), `L${lineId} out`).toEqual(expect.arrayContaining(['La Cadena', 'Platja Malva-rosa', 'Platja les Arenes']));
      expect(names(lineId, true), `L${lineId} out`).not.toContain('Cabanyal');
      expect(names(lineId, false), `L${lineId} back`).toEqual(expect.arrayContaining(['Beteró', 'La Cadena', 'Cabanyal', 'Dr. Lluch']));
      expect(names(lineId, false), `L${lineId} back`).not.toContain('Platja Malva-rosa');
      expect(names(lineId, false), `L${lineId} back`).not.toContain('Platja les Arenes');
    }
  });

  it('ends line 4 at Dr. Lluch both ways, and passes line 6 through it only on the way back', () => {
    expect(names('4', true).at(-1)).toBe('Dr. Lluch');
    expect(names('4', false).at(-1)).toBe('Dr. Lluch');
    expect(names('6', true)).not.toContain('Dr. Lluch');
    expect(names('6', false)).toContain('Dr. Lluch');
    expect(names('6', true).at(-1)).toBe('Marítim');
    expect(names('6', false).at(-1)).toBe('Marítim');
  });

  it('orders the way back as Dr. Lluch, Cabanyal, La Cadena, Beteró', () => {
    for (const lineId of ['4', '6']) {
      const d = ['Dr. Lluch', 'Cabanyal', 'La Cadena', 'Beteró'].map(n => at(lineId, n, false).trackDist);
      expect(d[0]).toBeGreaterThan(d[1]);
      expect(d[1]).toBeGreaterThan(d[2]);
      expect(d[2]).toBeGreaterThan(d[3]);
    }
  });

  it('keeps the outbound order, La Cadena after Beteró: the polyline is right and FGV is not', () => {
    for (const lineId of ['4', '6']) {
      expect(at(lineId, 'La Cadena', true).trackDist).toBeGreaterThan(at(lineId, 'Beteró', true).trackDist);
    }
  });

  it('walks Dr. Lluch to Cabanyal as 400 m in about a minute, not 887 m', () => {
    for (const lineId of ['4', '6']) {
      const from = at(lineId, 'Dr. Lluch', false);
      const to = at(lineId, 'Cabanyal', false);
      const metres = Math.abs(from.trackDist - to.trackDist);
      expect(metres, `L${lineId}`).toBeLessThan(500);
      expect(metres).toBeGreaterThan(300);
      const seconds = trainPositionEngine.getSegmentSeconds(lineId, from, to);
      expect(seconds).toBeGreaterThan(45);
      expect(seconds).toBeLessThan(90);
    }
  });

  it('shares one track and one chain on a line with no return track', () => {
    for (const lineId of ['1', '3', '5', '8', '10']) {
      expect(trainPositionEngine.hasReturnTrack(lineId)).toBe(false);
      expect(trainPositionEngine.getLineTrack(lineId, false)).toBe(trainPositionEngine.getLineTrack(lineId, true));
      expect(trainPositionEngine.getLineStations(lineId, false)).toBe(trainPositionEngine.getLineStations(lineId, true));
    }
  });

  it('draws eastbound trams down the beach leg heading south, and westbound ones up the inner leg heading north', () => {
    for (const lineId of ['4', '6']) {
      const malva = at(lineId, 'Platja Malva-rosa', true);
      const arenes = at(lineId, 'Platja les Arenes', true);
      for (let f = 0.1; f < 1; f += 0.2) {
        const out = trainPositionEngine.getCoordsAndBearingAtDistance(
          lineId, malva.trackDist + f * (arenes.trackDist - malva.trackDist), true
        );
        expect(Math.abs(out.bearing - 180), `L${lineId} beach ${f}`).toBeLessThan(10);
        expect(out.coordinates[0]).toBeGreaterThan(-0.3262); // the beach leg, lon -0.3256
      }

      const drLluch = at(lineId, 'Dr. Lluch', false);
      const cabanyal = at(lineId, 'Cabanyal', false);
      for (let f = 0.1; f < 1; f += 0.2) {
        const back = trainPositionEngine.getCoordsAndBearingAtDistance(
          lineId, drLluch.trackDist + f * (cabanyal.trackDist - drLluch.trackDist), false
        );
        const offNorth = Math.min(back.bearing, 360 - back.bearing);
        expect(offNorth, `L${lineId} inner ${f}`).toBeLessThan(20);
        expect(back.coordinates[0]).toBeLessThan(-0.3270); // the inner leg, lon -0.328 to -0.3274
      }
    }
  });

  it('places an eastbound train on the beach leg and a westbound one on the inner leg', () => {
    const now = Date.now();
    sighting('a', 'Platja Malva-rosa', '6', 'Marítim', '6001', -10, now);
    sighting('b', 'Platja les Arenes', '6', 'Marítim', '6001', 30, now);
    sighting('c', 'Dr. Lluch', '6', 'Tossal del Rei', '6002', -10, now);
    sighting('d', 'Cabanyal', '6', 'Tossal del Rei', '6002', 30, now);

    const byId = Object.fromEntries(trainPositionEngine.getLiveVehiclesFromMemory(now).map(v => [v.vehicleId, v]));
    expect(byId['6001'].isForward).toBe(true);
    expect(Math.abs(byId['6001'].bearing - 180)).toBeLessThan(10);
    expect(byId['6001'].coordinates[0]).toBeGreaterThan(-0.3262);
    expect(byId['6002'].isForward).toBe(false);
    expect(Math.min(byId['6002'].bearing, 360 - byId['6002'].bearing)).toBeLessThan(20);
    expect(byId['6002'].coordinates[0]).toBeLessThan(-0.3270);
  });

  it('takes the direction from the chain a Station belongs to', () => {
    expect(trainPositionEngine.locateArrival('4', 'Cabanyal', 'Mas del Rosari'))
      .toMatchObject({ isForward: false, station: { name: 'Cabanyal' } });
    expect(trainPositionEngine.locateArrival('6', 'Platja les Arenes', 'Marítim'))
      .toMatchObject({ isForward: true, station: { name: 'Platja les Arenes' } });
    expect(trainPositionEngine.locateArrival('4', 'Dr. Lluch', 'Dr. Lluch').isForward).toBe(true);
    expect(trainPositionEngine.locateArrival('4', 'Dr. Lluch', 'Mas del Rosari').isForward).toBe(false);
    expect(trainPositionEngine.locateArrival('6', 'Dr. Lluch', 'Tossal del Rei').isForward).toBe(false);
    expect(trainPositionEngine.locateArrival('6', 'Cabanyal', 'Tossal del Rei').station.name).toBe('Cabanyal');
  });

  it('sets a tram leaving Dr. Lluch westbound while it carries both headsigns', () => {
    const now = Date.now();
    // Vehicle 4085 at T653: arriving at the terminus, then on to Benimaclet.
    sighting('a', 'Dr. Lluch', '4', 'Mas del Rosari', '4085', 20, now);
    sighting('b', 'Cabanyal', '4', 'Mas del Rosari', '4085', 80, now);
    sighting('c', 'La Cadena', '4', 'Mas del Rosari', '4085', 200, now);
    sighting('d', 'Beteró', '4', 'Mas del Rosari', '4085', 298, now);
    sighting('e', 'Benimaclet', '4', 'Mas del Rosari', '4085', 784, now);

    const [vehicle] = trainPositionEngine.getLiveVehiclesFromMemory(now);
    expect(vehicle.isForward).toBe(false);
    expect(vehicle.sightingCount).toBe(5);
    expect(vehicle.targetStation).toBe('Dr. Lluch');
  });

  it('ignores Sightings at Stations that are not on the chain it travels', () => {
    const now = Date.now();
    sighting('a', 'Beteró', '4', 'Dr. Lluch', '4090', 100, now);
    sighting('b', 'La Cadena', '4', 'Dr. Lluch', '4090', 140, now);
    sighting('c', 'Platja Malva-rosa', '4', 'Dr. Lluch', '4090', 200, now);
    // FGV never states Cabanyal for this heading; it is not on the way out.
    sighting('d', 'Cabanyal', '4', 'Dr. Lluch', '4090', 30, now);

    const [vehicle] = trainPositionEngine.getLiveVehiclesFromMemory(now);
    expect(vehicle.isForward).toBe(true);
    expect(vehicle.sightingCount).toBe(3);
    expect(vehicle.targetStation).not.toBe('Cabanyal');
  });
});

describe('dropping Sightings that contradict the Station Chain', () => {
  beforeEach(() => {
    arrivalStore.memory.clear();
    trainPositionEngine.renderState.clear();
  });

  const eastbound4086 = (now) => {
    // Vehicle 4086 as FGV stated it: La Cadena before Beteró, on a tram that
    // reaches Beteró first.
    sighting('a', 'La Cadena', '4', 'Dr. Lluch', '4086', 47, now);
    sighting('b', 'Beteró', '4', 'Dr. Lluch', '4086', 229, now);
    sighting('c', 'Platja Malva-rosa', '4', 'Dr. Lluch', '4086', 491, now);
    sighting('d', 'Platja les Arenes', '4', 'Dr. Lluch', '4086', 550, now);
  };

  it('keeps Beteró and drops La Cadena when they tie on count', () => {
    const now = Date.now();
    eastbound4086(now);
    const train = [...trainPositionEngine.collectVehicleSightings(now).values()][0];
    const all = trainPositionEngine.sightingsOnChain(train, true);
    const kept = trainPositionEngine.consistentSightings('4', all, true).map(s => s.station.name);
    expect(kept.sort()).toEqual(['Beteró', 'Platja Malva-rosa', 'Platja les Arenes']);
  });

  it('anchors on the surviving Sighting, so the tram is not placed at La Cadena', () => {
    const now = Date.now();
    eastbound4086(now);
    const [vehicle] = trainPositionEngine.getLiveVehiclesFromMemory(now);
    const beteroDist = trainPositionEngine.getLineStations('4').find(s => s.name === 'Beteró').trackDist;
    expect(vehicle.isForward).toBe(true);
    // 229 s from Beteró: well short of it, not at La Cadena beyond it.
    expect(vehicle.distanceAlongTrack).toBeLessThan(beteroDist);
  });

  it('keeps every Sighting that is in order', () => {
    const now = Date.now();
    sighting('a', 'Xàtiva', '3', 'Rafelbunyol', '3704', 60, now);
    sighting('b', 'Alameda', '3', 'Rafelbunyol', '3704', 300, now);
    sighting('c', 'Colón', '3', 'Rafelbunyol', '3704', 180, now);
    const train = [...trainPositionEngine.collectVehicleSightings(now).values()][0];
    const all = trainPositionEngine.sightingsOnChain(train, true);
    const forward = all[0].station.trackDist < all[1].station.trackDist;
    expect(trainPositionEngine.consistentSightings('3', all, forward).length).toBe(3);
  });
});
