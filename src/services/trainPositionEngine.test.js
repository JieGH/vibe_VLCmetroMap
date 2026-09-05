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
    const pastDue = vehicleAt('Xàtiva', -35, now);

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

  it('falls back to distance where the timetable has no entry', () => {
    const stations = trainPositionEngine.getLineStations('5');
    const fabricated = { stopId: 'no-such-stop', trackDist: stations[0].trackDist + 800 };
    const seconds = trainPositionEngine.getSegmentSeconds('5', stations[0], fabricated);

    expect(seconds).toBeGreaterThan(40);
    expect(seconds).toBeLessThan(300);
  });
});
