// Train Position Engine
//
// Answers one question: given the live arrival predictions we hold, where is
// each train right now?
//
// A prediction is "vehicle 5301 reaches Àngel Guimerà in 415 seconds". Turning
// that into a coordinate means walking back along the line from Àngel Guimerà,
// spending each segment's real timetabled interval, until those 415 seconds are
// used up. The obvious shortcut — multiply the countdown by one commercial
// speed — is wrong in both directions, because real segments run anywhere from
// 3.9 m/s in the dense centre to 16.9 m/s on the northern stretch. At the
// network median of 7.5 m/s the old constant of 10.5 placed every train about
// 40% too far back: roughly two stations of error in the city centre.
import metroData from '../data/metro_lines.json';
import gtfsData from '../data/gtfs_expanded.json';
import segmentTimes from '../data/segment_times.json';
import fgvSegmentTimes from '../data/segment_times_fgv.json';
import returnTrackData from '../data/return_tracks.json';
import directionStationData from '../data/direction_stations.json';
import arrivalStore, { NETWORK_SYNC_INTERVAL_MS } from './arrivalStore';

// Haversine distance in meters
export const haversineDistance = (c1, c2) => {
  const R = 6371000;
  const dLat = (c2[1] - c1[1]) * (Math.PI / 180);
  const dLon = (c2[0] - c1[0]) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(c1[1] * (Math.PI / 180)) * Math.cos(c2[1] * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// Project a geographical coordinate onto a polyline to find its cumulative distance along the track
export const projectPointOntoPolyline = (point, coords, cumDists) => {
  let minPerpDist = Infinity;
  let bestDistAlong = 0;

  for (let i = 0; i < coords.length - 1; i++) {
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const segLen = cumDists[i + 1] - cumDists[i];
    if (segLen === 0) continue;

    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const lenSq = dx * dx + dy * dy;
    let t = lenSq === 0 ? 0 : ((point[0] - p1[0]) * dx + (point[1] - p1[1]) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));

    const proj = [p1[0] + t * dx, p1[1] + t * dy];
    const d = haversineDistance(point, proj);
    if (d < minPerpDist) {
      minPerpDist = d;
      bestDistAlong = cumDists[i] + t * segLen;
    }
  }

  return { distAlongTrack: bestDistAlong, perpDistance: minPerpDist };
};

const DWELL_SECONDS = segmentTimes.dwellSeconds ?? 12.5;
// The dwell carved out of an FGV-measured Segment Interval: timed platforms
// hold 40s and more, where the GTFS split assumes 12.5s.
const FGV_DWELL_SECONDS = fgvSegmentTimes.dwellSeconds ?? DWELL_SECONDS;

// A prediction this far past its arrival time is stale enough to drop, and one
// this far out has accumulated too much walk error to place with confidence.
const MAX_SECONDS_PAST = 20;
const MAX_SECONDS_AHEAD = 1080;

// Several lines serve branches their polyline in metro_lines.json does not
// cover — line 9 lists Rafelbunyol among its stations but its geometry stops
// 9.8 km short at Alboraia. Projecting those onto the nearest point of the
// wrong track would silently corrupt the station order the walk depends on, so
// they are held out of the chain instead. Real platforms sit a little to the
// side of the alignment, hence the tolerance rather than an exact test.
const MAX_STATION_OFFSET_METRES = 250;

// How fast a marker may close on an estimate that has run ahead of it: a
// multiple of the Vehicle's own running speed in the Segment it is placed in,
// held between a floor, so a train dwelling at a platform still gets there,
// and a ceiling just above MAX_RUNNING_METRES_PER_SECOND. A single fixed rate
// of 25 m/s (90 km/h) was 3-6x what a city-centre tram runs at: after a
// Network Sync re-timed a stale prediction, trains slid at that rate for up to
// a minute (docs/research/marker-drift.md).
//
// Past the resync distance the estimate is a different reading of the train
// altogether and the marker goes straight there. Forward and backward are
// kept apart so they can be tuned separately: a marker that waits for the
// estimate is better than one that reverses, and a long chase forward only
// lags the train.
const CATCH_UP_SPEED_FACTOR = 2;
const CATCH_UP_MIN_METRES_PER_SECOND = 6;
const CATCH_UP_MAX_METRES_PER_SECOND = 20;
const FALLBACK_RUNNING_SPEED = 7.5; // network median, m/s
const RESYNC_FORWARD_METRES = 1500;
const RESYNC_BACKWARD_METRES = 1500;

// The fastest a Vehicle averages between two platforms, braking and
// accelerating included: 1.8x its Line's Commercial Speed, at least 10 m/s
// and never above 17 m/s, the quickest segment in segment_times.json (16.9
// m/s on the northern stretch). A single network figure let trams run short
// segments at 17 m/s; FGV states tram intervals to the minute too, so 521 m
// with 20s of running left walked Mas del Rosari > La Coma at 26 m/s.
const MAX_RUNNING_METRES_PER_SECOND = 17;
const MIN_RUNNING_CEILING_METRES_PER_SECOND = 10;
const RUNNING_CEILING_SPEED_FACTOR = 1.8;

// ─── How much to trust a placed train ────────────────────────────────────────
//
// A live marker should look as confident as its position actually is. Two
// things blur that position, and neither is the prediction's age on its own:
// because `targetTimestamp` is an absolute epoch, a prediction sitting in
// memory keeps counting down correctly, and the walk gets *more* accurate as
// the train approaches, because fewer Segment Intervals are left to spend.
//
// 1. Quantisation. The GTFS Feed states every time to a whole minute, so each
//    Segment Interval taken from it carries ±30s. Intervals measured from FGV
//    have second resolution, but FGV re-times its own countdown by 25s (p90)
//    near a Station (docs/research/marker-drift.md), so ±30s still stands for
//    both. Those errors accumulate as a random walk, so n segments cost
//    roughly √n × 30s.
// 2. Drift, for the train running late against what the API predicted. Nothing
//    in this repo measures that yet — issue #4 is the live watch that would —
//    so the rate below is calibrated, not derived: it is set so that two missed
//    Network Syncs cost about what a full-length countdown costs on a median
//    line, the two states issue #7's table puts at the same opacity. Revisit it
//    with real numbers rather than treating it as measured.
//    Seconds inside one Network Sync interval are the healthy cadence and cost
//    nothing.
//
// Both terms are seconds of doubt, converted to metres at the Line's Commercial
// Speed. That puts one segment on line 6 (the slowest at 4.1 m/s) at 123 m, and
// a nine-segment full-countdown walk on line 1 (11.01 m/s) at 991 m — the two
// ends of the range this network spans.
const QUANTISATION_SECONDS = 30;
const DRIFT_SECONDS_PER_SECOND_UNHEARD = 0.25;

// Below this a position is as good as this model gets — one segment on a median
// line is about 200 m — so it costs no confidence. A walked position bottoms
// out at 1 km of doubt.
const FULL_CONFIDENCE_METRES = 200;
const LOST_CONFIDENCE_METRES = 1000;

// Two floors, because they are two different claims. A walked position, however
// long the walk, still rests on a prediction the API actually made; Dead
// Reckoning does not. Keeping them apart means a dead-reckoned train reads as
// the faintest thing on the map on every line — without it, a full-countdown
// train on line 1 (991 m of doubt) is already indistinguishable from one that
// has run out of prediction entirely.
export const MIN_WALKED_CONFIDENCE = 0.45;

// A train whose position is a guess must still be visible: it should read as
// uncertain, not absent.
export const MIN_POSITION_CONFIDENCE = 0.35;

/**
 * Metres of doubt around a walked position.
 */
export const estimatePositionUncertainty = (segmentsWalked, secondsUnheard, metresPerSecond) => {
  const quantisation = Math.sqrt(Math.max(0, segmentsWalked)) * QUANTISATION_SECONDS;
  const beyondOneSync = Math.max(0, secondsUnheard - NETWORK_SYNC_INTERVAL_MS / 1000);
  const drift = beyondOneSync * DRIFT_SECONDS_PER_SECOND_UNHEARD;
  return (quantisation + drift) * metresPerSecond;
};

/**
 * The 0.45–1 scale a walked position is drawn at. Dead Reckoning does not come
 * through here: it has no walk to size, and sits at MIN_POSITION_CONFIDENCE.
 */
export const confidenceFromUncertainty = (uncertaintyMetres) => {
  const span = LOST_CONFIDENCE_METRES - FULL_CONFIDENCE_METRES;
  const lost = (uncertaintyMetres - FULL_CONFIDENCE_METRES) / span;
  return Math.max(MIN_WALKED_CONFIDENCE, Math.min(1, 1 - lost));
};

// Sightings of one Vehicle must reach its Stations in the order it travels
// them. FGV re-times a countdown by up to 25s (p90) between fetches, and the
// Sightings of one Vehicle are rarely fetched together, so two Stations 40s
// apart can read a few seconds backwards without either being wrong. Past this
// the pair contradicts the Station Chain (docs/research/marker-drift.md).
const ORDER_TOLERANCE_SECONDS = 10;

const normalise = (value) => (value || '').toLowerCase().trim();

class TrainPositionEngine {
  constructor() {
    this.lineTracks = new Map();
    this.lineStations = new Map();
    // Lines whose coast section is one-way and whose return track differs from
    // the outbound one (ADR-0007). Their tracks and Station Chains are kept per
    // direction, under `${lineId}:return`; every other Line shares one of each.
    this.returnLines = new Set();
    // How often the Sighting order filter dropped a Sighting, per Line.
    this.orderFilterStats = new Map();
    // Stations a line serves but its geometry cannot reach; trains bound for
    // these hold at the nearest terminus rather than being drawn off-track.
    this.offTrackStations = [];
    // Per-vehicle render position, so a fresh fetch eases the marker to its new
    // anchor instead of teleporting it.
    this.renderState = new Map();
    this.resyncForwardMetres = RESYNC_FORWARD_METRES;
    this.resyncBackwardMetres = RESYNC_BACKWARD_METRES;
    this.init();
  }

  init() {
    const allStationPoints = (gtfsData.features || []).filter(
      f => f.geometry && f.geometry.type === 'Point'
    );

    for (let l = 1; l <= 10; l++) {
      const lineId = String(l);
      const feature = (metroData.features || []).find(
        f => f.properties && f.properties.line === lineId && f.geometry && f.geometry.type === 'LineString'
      );
      if (!feature) continue;

      const coords = feature.geometry.coordinates;
      if (!coords || coords.length < 2) continue;

      // 1. Calculate cumulative track distances
      const cumDists = [0];
      for (let i = 1; i < coords.length; i++) {
        cumDists.push(cumDists[i - 1] + haversineDistance(coords[i - 1], coords[i]));
      }
      const totalLength = cumDists[cumDists.length - 1] || 1;

      const timing = segmentTimes.lines[lineId] || {};
      this.lineTracks.set(lineId, {
        coords,
        cumDists,
        totalLength,
        segments: timing.segments || {},
        // Measured from FGV's own second-resolution predictions; preferred
        // over the minute-quantised GTFS figure wherever it exists.
        fgvSegments: fgvSegmentTimes.lines?.[lineId]?.segments || {},
        // Only used where the timetable has no entry for a segment.
        fallbackSpeed: (timing.fallback || segmentTimes.networkFallback).metresPerSecond,
        minSegmentSeconds: (timing.fallback || segmentTimes.networkFallback).minSeconds ?? DWELL_SECONDS + 15,
        color: feature.properties.color || '#888888',
        name: feature.properties.name || `Line ${lineId}`,
      });

      // 2. Project stations serving this line
      const stationsForLine = allStationPoints.filter(
        st => Array.isArray(st.properties.lines) && st.properties.lines.includes(lineId)
      );

      const projectedStations = stationsForLine.map((st) => {
        const proj = projectPointOntoPolyline(st.geometry.coordinates, coords, cumDists);
        return {
          id: st.properties.id,
          stopId: st.properties.stop_id || null,
          apiId: st.properties.apiId || null,
          name: st.properties.name,
          coords: st.geometry.coordinates,
          trackDist: proj.distAlongTrack,
          offTrackMetres: proj.perpDistance,
        };
      });

      for (const station of projectedStations) {
        if (station.offTrackMetres > MAX_STATION_OFFSET_METRES) {
          this.offTrackStations.push({
            line: lineId,
            name: station.name,
            metres: Math.round(station.offTrackMetres),
          });
        }
      }

      const onTrack = projectedStations.filter(st => st.offTrackMetres <= MAX_STATION_OFFSET_METRES);
      const returnCoords = returnTrackData.lines?.[lineId]?.coordinates;
      const served = directionStationData.lines?.[lineId];

      if (!returnCoords || !served) {
        this.lineStations.set(lineId, onTrack.sort((a, b) => a.trackDist - b.trackDist));
        continue;
      }

      // One-way section: the outbound chain keeps the Stations the feed says
      // trams call at going out, and the return chain those coming back, each
      // projected onto its own track so Dr. Lluch has a distance on both.
      const outbound = new Set(served.forward);
      const inbound = new Set(served.reverse);
      this.lineStations.set(lineId, onTrack
        .filter(st => outbound.has(st.stopId))
        .sort((a, b) => a.trackDist - b.trackDist));

      const returnCum = [0];
      for (let i = 1; i < returnCoords.length; i++) {
        returnCum.push(returnCum[i - 1] + haversineDistance(returnCoords[i - 1], returnCoords[i]));
      }
      this.returnLines.add(lineId);
      this.lineTracks.set(`${lineId}:return`, {
        ...this.lineTracks.get(lineId),
        coords: returnCoords,
        cumDists: returnCum,
        totalLength: returnCum[returnCum.length - 1] || 1,
      });
      this.lineStations.set(`${lineId}:return`, stationsForLine
        .filter(st => inbound.has(st.properties.stop_id))
        .map((st) => {
          const proj = projectPointOntoPolyline(st.geometry.coordinates, returnCoords, returnCum);
          return {
            id: st.properties.id,
            stopId: st.properties.stop_id || null,
            apiId: st.properties.apiId || null,
            name: st.properties.name,
            coords: st.geometry.coordinates,
            trackDist: proj.distAlongTrack,
            offTrackMetres: proj.perpDistance,
          };
        })
        .filter(st => st.offTrackMetres <= MAX_STATION_OFFSET_METRES)
        .sort((a, b) => a.trackDist - b.trackDist));
    }
  }

  hasReturnTrack(lineId) {
    return this.returnLines.has(String(lineId));
  }

  // The track and Station Chain a Vehicle travelling this way uses: the return
  // ones on a Line with a one-way section, the Line's single ones otherwise.
  chainKey(lineId, isForward) {
    const id = String(lineId);
    return !isForward && this.returnLines.has(id) ? `${id}:return` : id;
  }

  getLineTrack(lineId, isForward = true) {
    return this.lineTracks.get(this.chainKey(lineId, isForward));
  }

  getLineStations(lineId, isForward = true) {
    return this.lineStations.get(this.chainKey(lineId, isForward)) || [];
  }

  /**
   * One Segment between arriving at one station and arriving at the next:
   * its interval, taken from FGV's measured figure, then the timetable, then
   * distance, and the Station Dwell at the origin that interval includes.
   *
   * FGV comes first even against the GTFS entry for the same direction: GTFS
   * states times to the minute, so its 120s for Amistat → Aragó is further
   * from the ~85s timed on the platform than FGV's 91s is in either direction.
   */
  getSegmentTiming(lineId, from, to) {
    const stated = this.getStatedSegmentTiming(lineId, from, to);

    // An interval is a time, not a speed, and neither source knows the
    // distance. FGV's far-out countdowns are timetable projections stated to
    // the minute, so a 3.3 km segment can read 120s, and the 40s dwell carved
    // out of a 60s interval leaves 732 m to be run in 20s. Walked as stated,
    // those Segments ran the marker at 25-40 m/s. So running time never drops
    // below what the Line's running ceiling allows: the dwell gives way
    // first, down to the GTFS one, and only then does the interval stretch.
    const track = this.getLineTrack(lineId);
    const ceiling = track
      ? Math.min(MAX_RUNNING_METRES_PER_SECOND, Math.max(MIN_RUNNING_CEILING_METRES_PER_SECOND, RUNNING_CEILING_SPEED_FACTOR * track.fallbackSpeed))
      : MAX_RUNNING_METRES_PER_SECOND;
    const minRunning = Math.abs(to.trackDist - from.trackDist) / ceiling;
    if (stated.seconds - stated.dwell >= minRunning) return stated;

    const dwell = Math.min(stated.dwell, Math.max(DWELL_SECONDS, stated.seconds - minRunning));
    return { seconds: Math.max(stated.seconds, dwell + minRunning), dwell };
  }

  /**
   * The interval and dwell as the sources state them, before the running time
   * is checked against the distance.
   */
  getStatedSegmentTiming(lineId, from, to) {
    const track = this.getLineTrack(lineId);
    if (!track) return { seconds: DWELL_SECONDS + 60, dwell: DWELL_SECONDS };

    if (from.stopId && to.stopId) {
      const measured = track.fgvSegments[`${from.stopId}>${to.stopId}`]
        ?? track.fgvSegments[`${to.stopId}>${from.stopId}`];
      if (measured) return { seconds: measured.seconds, dwell: FGV_DWELL_SECONDS };

      // Timetables are directional but running times are near-symmetric, and
      // some segments are only ever served one way in the feed.
      const timetabled = track.segments[`${from.stopId}>${to.stopId}`]
        ?? track.segments[`${to.stopId}>${from.stopId}`];
      if (timetabled) return { seconds: timetabled, dwell: DWELL_SECONDS };
    }

    const metres = Math.abs(to.trackDist - from.trackDist);
    return {
      seconds: Math.max(track.minSegmentSeconds, Math.round(metres / track.fallbackSpeed)),
      dwell: DWELL_SECONDS,
    };
  }

  /**
   * Seconds between arriving at one station and arriving at the next.
   * Includes the dwell at the origin.
   */
  getSegmentSeconds(lineId, from, to) {
    return this.getSegmentTiming(lineId, from, to).seconds;
  }

  /**
   * [lng, lat] and bearing at a distance along the track.
   */
  getCoordsAndBearingAtDistance(lineId, distanceMeters, isForward = true) {
    const track = this.getLineTrack(lineId, isForward);
    if (!track) return { coordinates: [0, 0], bearing: 0 };

    const dist = Math.max(0, Math.min(track.totalLength, distanceMeters));
    const { coords, cumDists } = track;

    // Binary search for segment
    let low = 0;
    let high = cumDists.length - 1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (cumDists[mid] <= dist) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    const idx = Math.max(0, Math.min(coords.length - 2, high));
    const segStartDist = cumDists[idx];
    const segEndDist = cumDists[idx + 1];
    const segLen = segEndDist - segStartDist;
    const t = segLen > 0 ? (dist - segStartDist) / segLen : 0;

    const p1 = coords[idx];
    const p2 = coords[idx + 1];
    const lng = p1[0] + t * (p2[0] - p1[0]);
    const lat = p1[1] + t * (p2[1] - p1[1]);

    // Bearing
    const dx = isForward ? (p2[0] - p1[0]) : (p1[0] - p2[0]);
    const dy = isForward ? (p2[1] - p1[1]) : (p1[1] - p2[1]);
    const rad = Math.atan2(dx, dy);
    const bearing = (rad * 180 / Math.PI + 360) % 360;

    return { coordinates: [lng, lat], bearing };
  }

  findStation(lineId, stationName, isForward = true) {
    const stations = this.getLineStations(lineId, isForward);
    const target = normalise(stationName);
    if (!target) return null;

    const exact = stations.find(s => normalise(s.name) === target);
    if (exact) return exact;

    return stations.find(
      s => normalise(s.name).includes(target) || target.includes(normalise(s.name))
    ) || null;
  }

  /**
   * Which way along the track is this train travelling?
   *
   * The headsign is a real station name, so locating it on the line gives the
   * answer directly; the terminus checks are only there for the handful of
   * headsigns that name a station on a branch this polyline does not cover.
   *
   * On a Line with a one-way section the target may sit on only one of the two
   * Station Chains: pass its outbound Station as `target` and its return one as
   * `returnTarget`, and a Station served one way (Cabanyal, Platja Malva-rosa)
   * settles the direction on its own.
   */
  resolveDirection(lineId, destination, target, returnTarget = null) {
    const stations = this.getLineStations(lineId);

    if (this.hasReturnTrack(lineId)) {
      if (target && !returnTarget) return true;
      if (returnTarget && !target) return false;

      // Station on both chains: the headsign's own position on each says which
      // way it points. Dr. Lluch as both target and headsign is no evidence.
      const evidence = [];
      const outDest = this.findStation(lineId, destination, true);
      if (outDest && target && outDest.trackDist !== target.trackDist) {
        evidence.push(outDest.trackDist > target.trackDist);
      }
      const backDest = this.findStation(lineId, destination, false);
      if (backDest && returnTarget && backDest.trackDist !== returnTarget.trackDist) {
        evidence.push(backDest.trackDist > returnTarget.trackDist);
      }
      if (evidence.length && evidence.every(e => e === evidence[0])) return evidence[0];
    }

    if (stations.length < 2 || !target) return true;

    const destination_ = this.findStation(lineId, destination);
    if (destination_ && destination_.trackDist !== target.trackDist && !this.hasReturnTrack(lineId)) {
      return destination_.trackDist > target.trackDist;
    }

    const normDest = normalise(destination);
    const firstStop = stations[0];
    const lastStop = stations[stations.length - 1];
    if (normDest && normalise(firstStop.name).startsWith(normDest.slice(0, 4))) return false;
    if (normDest && normalise(lastStop.name).startsWith(normDest.slice(0, 4))) return true;

    return true;
  }

  /**
   * Walk the station chain to place a train that is `secondsToTarget` away from
   * `target`, spending each segment's timetabled interval on the way.
   *
   * A negative countdown means the train has already called at the target, and
   * it is held there.
   *
   * Reports `segmentsWalked` alongside the position, counting a part-crossed
   * segment as the fraction of it spent. That is what the ±30s each Segment
   * Interval carries accumulates over, so it is what sizes the uncertainty the
   * marker is drawn with.
   *
   * Also reports whether it ended up Dead Reckoning: placed past a spent
   * countdown with no prediction left. Sitting out a Station Dwell at the
   * target is not that — the train is where it was reported to be — so the
   * distinction is the walk's to make, not something a caller can read off the
   * sign of the countdown.
   */
  walkFromStation(lineId, target, secondsToTarget, isForward) {
    const track = this.getLineTrack(lineId, isForward);
    const stations = this.getLineStations(lineId, isForward);
    if (!track || !target) return null;

    const targetIndex = stations.findIndex(s => s.id === target.id);
    if (targetIndex < 0) return null;

    // Walking backwards from the target means stepping against the direction of
    // travel; walking forwards from it means stepping with the direction.
    const stepBack = isForward ? -1 : 1;
    let segmentsWalked = 0;

    if (secondsToTarget <= 0) {
      // Still inside the dwell it was predicted to arrive for: the train is at
      // the platform the API named, which is the best-known position there is.
      // Past it, the train is Dead Reckoned but still held at that platform:
      // real dwells run 40s and more (166s at Alameda, timed 2026-10-24), so
      // walking it out after 12.5s only sent it down the line for the next
      // prediction to drag back.
      return {
        trackDist: target.trackDist,
        status: 'At Platform',
        nextStation: target,
        segmentsWalked,
        isDeadReckoned: -secondsToTarget > DWELL_SECONDS,
        metresPerSecond: track.fallbackSpeed,
      };
    }

    let remaining = secondsToTarget;
    let arrivalIndex = targetIndex;

    while (true) {
      const departureIndex = arrivalIndex + stepBack;
      if (departureIndex < 0 || departureIndex >= stations.length) {
        // The prediction reaches further back than this line's geometry goes,
        // which happens on branches the polyline does not cover. Hold at the
        // terminus rather than inventing track.
        return {
          trackDist: stations[arrivalIndex].trackDist,
          status: 'At Terminus',
          nextStation: stations[targetIndex],
          segmentsWalked,
          isDeadReckoned: false,
          metresPerSecond: track.fallbackSpeed,
        };
      }

      const departure = stations[departureIndex];
      const arrival = stations[arrivalIndex];
      const timing = this.getSegmentTiming(lineId, departure, arrival);
      const running = Math.max(1, timing.seconds - timing.dwell);
      const metresPerSecond = Math.abs(arrival.trackDist - departure.trackDist) / running;

      if (remaining <= running) {
        const progress = 1 - remaining / running;
        return {
          trackDist: departure.trackDist + (arrival.trackDist - departure.trackDist) * progress,
          status: remaining <= 60 ? 'Approaching' : 'En Route',
          nextStation: arrival,
          segmentsWalked: segmentsWalked + (1 - progress),
          isDeadReckoned: false,
          metresPerSecond,
        };
      }

      remaining -= running;
      segmentsWalked += 1;
      if (remaining <= timing.dwell) {
        return { trackDist: departure.trackDist, status: 'At Platform', nextStation: arrival, segmentsWalked, isDeadReckoned: false, metresPerSecond };
      }
      remaining -= timing.dwell;
      arrivalIndex = departureIndex;
    }
  }

  /**
   * Which Station an Arrival is for, and which way it is travelling. On a Line
   * with a one-way section the Station is the one on the Chain for that way.
   */
  locateArrival(lineId, stationName, destination) {
    const outbound = this.findStation(lineId, stationName, true);
    if (!this.hasReturnTrack(lineId)) {
      if (!outbound) return null;
      return { station: outbound, isForward: this.resolveDirection(lineId, destination, outbound) };
    }

    const inbound = this.findStation(lineId, stationName, false);
    if (!outbound && !inbound) return null;
    const isForward = this.resolveDirection(lineId, destination, outbound, inbound);
    return { station: isForward ? outbound : inbound, isForward };
  }

  /**
   * Position a train from one arrival prediction.
   */
  estimatePositionFromArrival(lineId, destination, targetStationName, secondsToTarget) {
    const stations = this.getLineStations(lineId);
    if (!this.getLineTrack(lineId) || stations.length === 0) return null;

    const located = this.locateArrival(lineId, targetStationName, destination);
    if (!located) return null;
    const { station: target, isForward } = located;
    const walked = this.walkFromStation(lineId, target, secondsToTarget, isForward);
    if (!walked) return null;

    const { coordinates, bearing } = this.getCoordsAndBearingAtDistance(lineId, walked.trackDist, isForward);
    return {
      coordinates,
      bearing,
      distanceAlongTrack: walked.trackDist,
      isForward,
      status: walked.status,
      targetStation: target.name,
      nextStation: walked.nextStation ? walked.nextStation.name : target.name,
      secondsToTarget: Math.round(secondsToTarget),
    };
  }

  /**
   * Gather every sighting of every vehicle across all cached stations.
   *
   * The same train is routinely predicted at several stations at once. Each
   * sighting is a separate constraint on where it is, and the nearest one in
   * time is the most reliable, because walk error grows with the countdown.
   */
  collectVehicleSightings(now) {
    const byVehicle = new Map();

    for (const [, entry] of arrivalStore.memory.entries()) {
      if (!entry || !Array.isArray(entry.arrivals)) continue;

      // When we last heard from the API about this station. Not how old the
      // countdown is — that stays honest on its own — but how long the train
      // has had to drift from the prediction unobserved.
      const fetchedAt = Number.isFinite(entry.fetchedAt) ? entry.fetchedAt : now;

      for (const arrival of entry.arrivals) {
        if (!arrival.isLive || !arrival.targetTimestamp) continue;

        const secondsRemaining = (arrival.targetTimestamp - now) / 1000;
        if (secondsRemaining < -MAX_SECONDS_PAST || secondsRemaining > MAX_SECONDS_AHEAD) continue;

        const lineId = String(arrival.line);
        const station = this.findStation(lineId, entry.stationName, true);
        // Which way the Vehicle goes is not known yet, and a Station served one
        // way only (Cabanyal, Platja Malva-rosa) exists on one chain, so both
        // are looked up. On a Line without a return track they are the same.
        const returnStation = this.hasReturnTrack(lineId)
          ? this.findStation(lineId, entry.stationName, false)
          : station;
        if (!station && !returnStation) continue;

        // Without a vehicle id from the API, a sighting cannot be tied to any
        // other, so it stands alone as its own train.
        const key = arrival.vehicleId
          ? `${lineId}-${arrival.vehicleId}`
          : `${lineId}-${arrival.destination}-${Math.round(arrival.targetTimestamp / 60000)}`;

        if (!byVehicle.has(key)) {
          byVehicle.set(key, {
            key,
            lineId,
            vehicleId: arrival.vehicleId || null,
            destination: arrival.destination,
            sightings: [],
          });
        }
        byVehicle.get(key).sightings.push({ station, returnStation, secondsRemaining, fetchedAt });
      }
    }

    return byVehicle;
  }

  /**
   * The Sightings of a Vehicle that lie on the Station Chain for one direction,
   * each with the Station it names on that Chain.
   */
  sightingsOnChain(train, isForward) {
    const out = [];
    for (const sighting of train.sightings) {
      const station = isForward ? sighting.station : sighting.returnStation;
      if (station) out.push({ ...sighting, station });
    }
    return out;
  }

  /**
   * Drop the Sightings whose countdowns contradict the Station Chain.
   *
   * A Vehicle reaches its Stations in chain order, so read along the way it
   * travels the countdowns must not decrease. FGV sometimes states one that
   * does: for a tram bound for the coast it can give La Cadena a countdown
   * earlier than Beteró, though Beteró is the Station before it (the live feed
   * of 2026-10-24 does, for far-out Vehicles; the polyline order is right, and
   * GTFS agrees). Anchoring on such a Sighting puts the tram at a Station it
   * has not reached, so it is dropped rather than believed.
   *
   * Keeps the largest consistent subset. Where two subsets are as large, the
   * one whose gaps best match the Segment Intervals between its Stations wins,
   * since a bogus Sighting is the one that does not fit the timetable. A
   * Station is kept at most once: a Vehicle calls at it once on a journey.
   */
  consistentSightings(lineId, sightings, isForward) {
    if (sightings.length < 2) return sightings;

    const stations = this.getLineStations(lineId, isForward);
    const step = isForward ? 1 : -1;
    const indexOf = new Map(stations.map((st, i) => [st.id, i]));
    const ordered = sightings
      .filter(s => indexOf.has(s.station.id))
      .sort((a, b) => step * (indexOf.get(a.station.id) - indexOf.get(b.station.id))
        || a.secondsRemaining - b.secondsRemaining);

    const expectedGap = (from, to) => {
      let seconds = 0;
      for (let i = indexOf.get(from.station.id); i !== indexOf.get(to.station.id); i += step) {
        seconds += this.getSegmentTiming(lineId, stations[i], stations[i + step]).seconds;
      }
      return seconds;
    };

    // best[i]: the best chain of Sightings ending at ordered[i], by count and
    // then by how far its gaps stray from the timetable.
    const best = [];
    for (let i = 0; i < ordered.length; i++) {
      best[i] = { length: 1, misfit: 0, previous: -1 };
      for (let j = 0; j < i; j++) {
        if (ordered[j].station.id === ordered[i].station.id) continue;
        const gap = ordered[i].secondsRemaining - ordered[j].secondsRemaining;
        if (gap < -ORDER_TOLERANCE_SECONDS) continue;
        const length = best[j].length + 1;
        const misfit = best[j].misfit + Math.abs(gap - expectedGap(ordered[j], ordered[i]));
        if (length > best[i].length || (length === best[i].length && misfit < best[i].misfit)) {
          best[i] = { length, misfit, previous: j };
        }
      }
    }

    let end = 0;
    for (let i = 1; i < best.length; i++) {
      if (best[i].length > best[end].length
        || (best[i].length === best[end].length && best[i].misfit < best[end].misfit)) end = i;
    }
    const kept = new Set();
    for (let i = end; i >= 0; i = best[i].previous) kept.add(ordered[i]);
    return sightings.filter(s => kept.has(s));
  }

  recordOrderFilter(lineId, train, before, after) {
    if (!this.orderFilterStats.has(lineId)) {
      this.orderFilterStats.set(lineId, { evaluations: 0, withDrop: 0, dropped: new Map() });
    }
    const stats = this.orderFilterStats.get(lineId);
    stats.evaluations += 1;
    if (after.length === before.length) return;
    stats.withDrop += 1;
    for (const s of before) {
      if (after.includes(s)) continue;
      const pair = `${train.key}|${s.station.name}`;
      stats.dropped.set(pair, (stats.dropped.get(pair) || 0) + 1);
    }
  }

  /**
   * Anchor and direction from one Vehicle's Sightings, on a Line with a single
   * Station Chain.
   */
  anchorAndDirection(train, sightings) {
    sightings = [...sightings].sort(
      (a, b) => Math.abs(a.secondsRemaining) - Math.abs(b.secondsRemaining)
    );
    // Anchor on the Station the train is heading for, even when one it has
    // just passed is nearer in time. Walking forwards from a passed Station
    // and back from the one ahead disagree, so picking whichever is nearer
    // flipped the anchor — and the marker — the moment the passed Sighting
    // went stale. Only with nothing ahead does a passed Station anchor.
    const anchor = sightings
      .filter(s => s.secondsRemaining >= 0)
      .sort((a, b) => a.secondsRemaining - b.secondsRemaining)[0] ?? sightings[0];

    // Two sightings settle the direction outright: the station the train
    // reaches later is the one it is heading towards. That beats matching the
    // headsign against station names.
    // Every other sighting votes, not just the nearest: where FGV states a
    // Station out of order the pair reads backwards, and letting that pair
    // alone decide flipped the train whenever it became the nearest. A tie
    // falls back to the headsign.
    let votes = 0;
    for (const other of sightings) {
      if (other === anchor || other.station.trackDist === anchor.station.trackDist) continue;
      if (other.secondsRemaining === anchor.secondsRemaining) continue;
      const later = other.secondsRemaining > anchor.secondsRemaining ? other : anchor;
      const earlier = later === other ? anchor : other;
      votes += later.station.trackDist > earlier.station.trackDist ? 1 : -1;
    }
    const isForward = votes === 0
      ? this.resolveDirection(train.lineId, train.destination, anchor.station)
      : votes > 0;
    return { anchor, isForward };
  }

  /**
   * Which Sightings a Vehicle is placed from, which one anchors the walk, and
   * which way it is going.
   *
   * On a Line with a one-way section the direction decides which Station Chain
   * the Sightings belong to, so each way is tried: the chain that keeps more of
   * them in order wins, and a tie falls back to the headsign. Stations on only
   * the other chain are ignored. A Vehicle near the L4 terminus can carry both
   * headsigns' Sightings at once, and this is what tells them apart.
   */
  placeVehicle(train) {
    const lineId = train.lineId;

    if (this.hasReturnTrack(lineId)) {
      const tries = [true, false].map((isForward) => {
        const onChain = this.sightingsOnChain(train, isForward);
        return { isForward, onChain, kept: this.consistentSightings(lineId, onChain, isForward) };
      });
      let pick = tries[0].kept.length >= tries[1].kept.length ? tries[0] : tries[1];
      if (tries[0].kept.length === tries[1].kept.length) {
        const reference = [...train.sightings]
          .sort((a, b) => Math.abs(a.secondsRemaining) - Math.abs(b.secondsRemaining))
          .find(s => s.secondsRemaining >= 0) ?? train.sightings[0];
        const heading = this.resolveDirection(lineId, train.destination, reference.station, reference.returnStation);
        pick = heading ? tries[0] : tries[1];
      }
      if (pick.kept.length === 0) return null;
      this.recordOrderFilter(lineId, train, pick.onChain, pick.kept);
      const sorted = [...pick.kept].sort(
        (a, b) => Math.abs(a.secondsRemaining) - Math.abs(b.secondsRemaining)
      );
      const anchor = sorted.filter(s => s.secondsRemaining >= 0)
        .sort((a, b) => a.secondsRemaining - b.secondsRemaining)[0] ?? sorted[0];
      return { anchor, isForward: pick.isForward, count: pick.onChain.length };
    }

    const all = this.sightingsOnChain(train, true);
    let placed = this.anchorAndDirection(train, all);
    const kept = this.consistentSightings(lineId, all, placed.isForward);
    this.recordOrderFilter(lineId, train, all, kept);
    if (kept.length < all.length) placed = this.anchorAndDirection(train, kept);
    return { ...placed, count: all.length };
  }

  /**
   * Extract real-time trains from arrival memory.
   */
  getLiveVehiclesFromMemory(now = Date.now()) {
    const vehicles = [];

    for (const train of this.collectVehicleSightings(now).values()) {
      const placed = this.placeVehicle(train);
      if (!placed) continue;
      const { anchor, isForward } = placed;

      const walked = this.walkFromStation(
        train.lineId, anchor.station, anchor.secondsRemaining, isForward
      );
      if (!walked) continue;

      const { coordinates, bearing } = this.getCoordsAndBearingAtDistance(
        train.lineId, walked.trackDist, isForward
      );

      const secondsUnheard = Math.max(0, (now - anchor.fetchedAt) / 1000);
      const uncertaintyMetres = estimatePositionUncertainty(
        walked.segmentsWalked, secondsUnheard, this.getLineTrack(train.lineId, isForward).fallbackSpeed
      );
      // Dead Reckoning is the sharpest loss of confidence there is, and it is
      // not about age at all — a prediction fetched a second ago can already be
      // in it — so it goes straight to the floor rather than through the walk's
      // own scale.
      const { isDeadReckoned } = walked;

      vehicles.push({
        id: `live-${train.key}`,
        line: train.lineId,
        vehicleId: train.vehicleId,
        direction: train.destination,
        coordinates,
        bearing,
        distanceAlongTrack: walked.trackDist,
        isForward,
        isLive: true,
        status: walked.status,
        sightingCount: placed.count,
        positionUncertaintyMetres: Math.round(uncertaintyMetres),
        positionConfidence: isDeadReckoned
          ? MIN_POSITION_CONFIDENCE
          : confidenceFromUncertainty(uncertaintyMetres),
        isDeadReckoned,
        runningSpeed: walked.metresPerSecond,
        secondsUnheard: Math.round(secondsUnheard),
        targetStation: walked.nextStation ? walked.nextStation.name : anchor.station.name,
        secondsToTarget: Math.max(0, Math.round(anchor.secondsRemaining)),
      });
    }

    return vehicles;
  }

  /**
   * Headway simulation for lines with no live data. These are not real trains
   * and callers must present them as such.
   */
  getHeadwayVehiclesForLine(lineId, now = Date.now()) {
    const outTrack = this.getLineTrack(lineId);
    const outStations = this.getLineStations(lineId);
    if (!outTrack || outStations.length < 2) return [];

    const firstStop = outStations[0];
    const lastStop = outStations[outStations.length - 1];
    const speed = outTrack.fallbackSpeed;
    const totalLength = outTrack.totalLength;

    // One round-trip cycle duration in milliseconds
    const oneWaySecs = totalLength / speed;
    const cycleTimeMs = Math.max(600000, oneWaySecs * 1000 * 2.2);

    // Number of trains per direction based on line length
    const numTrainsPerDir = totalLength > 40000 ? 3 : (totalLength > 15000 ? 2 : 1);
    const vehicles = [];

    for (let dir = 0; dir < 2; dir++) {
      const isForward = dir === 0;
      // A one-way section has a track of its own for each way.
      const track = this.getLineTrack(lineId, isForward);
      const stations = this.getLineStations(lineId, isForward);
      const legLength = track.totalLength;
      const destination = isForward ? lastStop.name : firstStop.name;

      for (let tIdx = 0; tIdx < numTrainsPerDir; tIdx++) {
        const offsetMs = (cycleTimeMs / numTrainsPerDir) * tIdx + (dir * (cycleTimeMs / (numTrainsPerDir * 2)));
        const cycleProgress = (((now + offsetMs) % cycleTimeMs) / cycleTimeMs);

        // Ping-pong smoothly along the line
        const posProgress = cycleProgress > 0.5 ? (1 - cycleProgress) * 2 : cycleProgress * 2;
        const currentDist = posProgress * legLength;

        // Determine nearest upcoming station
        let nearestTarget = isForward ? lastStop : firstStop;
        for (const st of stations) {
          if (isForward && st.trackDist >= currentDist) {
            nearestTarget = st;
            break;
          } else if (!isForward && st.trackDist <= currentDist) {
            nearestTarget = st;
            break;
          }
        }

        const remainingDist = Math.abs(nearestTarget.trackDist - currentDist);
        const secondsToTarget = Math.round(remainingDist / speed);

        const { coordinates, bearing } = this.getCoordsAndBearingAtDistance(lineId, currentDist, isForward);

        vehicles.push({
          id: `sim-L${lineId}-${isForward ? 'fwd' : 'rev'}-${tIdx}`,
          line: lineId,
          direction: destination,
          coordinates,
          bearing,
          distanceAlongTrack: currentDist,
          isForward,
          isLive: false,
          isSimulated: true,
          targetStation: nearestTarget.name,
          secondsToTarget,
        });
      }
    }

    return vehicles;
  }

  /**
   * Metres per second the marker may close a forward gap at: a multiple of
   * how fast the Vehicle runs in the Segment it is placed in, so the marker
   * reads as that train speeding up rather than sliding.
   */
  catchUpRate(vehicle) {
    const running = vehicle.runningSpeed > 0 ? vehicle.runningSpeed : FALLBACK_RUNNING_SPEED;
    return Math.max(CATCH_UP_MIN_METRES_PER_SECOND, Math.min(CATCH_UP_MAX_METRES_PER_SECOND, CATCH_UP_SPEED_FACTOR * running));
  }

  /**
   * Draw a live train moving forwards only. Live trains only: simulated ones
   * are already continuous.
   *
   * Every fresh prediction re-walks the train, and near a Station FGV re-times
   * its countdown by 25s (p90) between polls — up when the train is held, down
   * when it leaves. Drawn as-is, each re-time was a 200 m slide one way or the
   * other (docs/research/marker-drift.md). A real train never reverses, so a
   * marker the estimate has fallen behind waits for it, and one the estimate
   * has run ahead of catches up no faster than any train could.
   */
  smoothVehicle(vehicle, now) {
    if (!vehicle.isLive) return vehicle;

    const isForward = vehicle.isForward !== false;
    const previous = this.renderState.get(vehicle.id);
    const resync = () => {
      this.renderState.set(vehicle.id, { trackDist: vehicle.distanceAlongTrack, isForward, at: now });
      return vehicle;
    };

    if (!previous || previous.isForward !== isForward) return resync();

    const ahead = (vehicle.distanceAlongTrack - previous.trackDist) * (isForward ? 1 : -1);
    // A gap this large is not a correction but a different reading of where
    // the train is — a new anchor far down the line — so the marker goes there.
    if (ahead > this.resyncForwardMetres || -ahead > this.resyncBackwardMetres) return resync();

    const elapsedSeconds = Math.max(0, now - previous.at) / 1000;
    const step = Math.max(0, Math.min(ahead, this.catchUpRate(vehicle) * elapsedSeconds));
    const drawn = previous.trackDist + step * (isForward ? 1 : -1);
    this.renderState.set(vehicle.id, { trackDist: drawn, isForward, at: now });
    if (drawn === vehicle.distanceAlongTrack) return vehicle;

    const { coordinates, bearing } = this.getCoordsAndBearingAtDistance(vehicle.line, drawn, isForward);
    return { ...vehicle, coordinates, bearing, distanceAlongTrack: drawn };
  }

  /**
   * Main entry point: live trains where we have predictions, headway trains
   * elsewhere.
   */
  getAllVehicles(now = Date.now()) {
    const liveVehicles = this.getLiveVehiclesFromMemory(now);
    const allVehicles = [...liveVehicles];

    for (let l = 1; l <= 10; l++) {
      const lineId = String(l);
      const liveOnLine = liveVehicles.filter(v => v.line === lineId);

      if (liveOnLine.length === 0) {
        allVehicles.push(...this.getHeadwayVehiclesForLine(lineId, now));
      } else if (liveOnLine.length === 1) {
        // Add opposite direction headway train
        const simulated = this.getHeadwayVehiclesForLine(lineId, now);
        const oppSim = simulated.find(s => s.direction !== liveOnLine[0].direction);
        if (oppSim) allVehicles.push(oppSim);
      }
    }

    // Drop render state for trains that are no longer on the map.
    const alive = new Set(allVehicles.map(v => v.id));
    for (const id of this.renderState.keys()) {
      if (!alive.has(id)) this.renderState.delete(id);
    }

    return allVehicles.map(v => this.smoothVehicle(v, now));
  }
}

export const trainPositionEngine = new TrainPositionEngine();
export default trainPositionEngine;
