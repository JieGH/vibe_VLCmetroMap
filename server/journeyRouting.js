import { createHash } from 'node:crypto';

// OTP is an operator-configured endpoint, never a URL supplied by the passenger.
// Version 2.7.0's planConnection API keeps street routing and transit scheduling
// in the same graph. All exported timestamps are Unix milliseconds.
const QUERY = `query Journey($from: PlanLabeledLocationInput!, $to: PlanLabeledLocationInput!, $dateTime: PlanDateTimeInput!) {
  serviceTimeRange { start end }
  planConnection(origin: $from, destination: $to, dateTime: $dateTime, first: 12,
    modes: { direct: [WALK], transit: { transit: [{mode: SUBWAY}, {mode: TRAM}, {mode: RAIL}, {mode: BUS}] } }) {
    routingErrors { code description }
    edges { node {
      start end walkDistance numberOfTransfers
      legs {
        id mode distance headsign
        start { scheduledTime } end { scheduledTime }
        from { name lat lon stop { gtfsId } }
        to { name lat lon stop { gtfsId } }
        intermediatePlaces { name lat lon stop { gtfsId } arrival { scheduledTime } departure { scheduledTime } }
        route { gtfsId shortName }
        legGeometry { points }
      }
    } }
  }
}`;

const timestamp = value => Date.parse(value);
const place = p => ({ name: p.name || '', coordinates: [p.lon, p.lat], ...(p.stop?.gtfsId && { stopId: p.stop.gtfsId }) });
const idFor = value => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 20);
const failure = (status, code, message) => ({ status, body: { error: { code, message } } });

function validPlace(value) {
  return value && typeof value.name === 'string' && value.name.trim().length > 0 && value.name.length <= 200 &&
    Array.isArray(value.coordinates) && value.coordinates.length === 2 &&
    value.coordinates.every(Number.isFinite) && Math.abs(value.coordinates[0]) <= 180 && Math.abs(value.coordinates[1]) <= 90;
}

function validRequest(input) {
  if (!input || !validPlace(input.from) || !validPlace(input.to)) return false;
  if (Object.keys(input).some(key => !['from', 'to', 'departureTime', 'preferences'].includes(key))) return false;
  if (typeof input.departureTime !== 'string' || !/(Z|[+-]\d\d:\d\d)$/.test(input.departureTime) || !Number.isFinite(timestamp(input.departureTime))) return false;
  const p = input.preferences;
  if (p !== undefined && (!p || typeof p !== 'object' || Array.isArray(p))) return false;
  if (p?.maxWalkMinutes !== undefined && (!Number.isFinite(p.maxWalkMinutes) || p.maxWalkMinutes < 1 || p.maxWalkMinutes > 120)) return false;
  if (p?.allowLongerWalk !== undefined && typeof p.allowLongerWalk !== 'boolean') return false;
  return true;
}

function validEndpoint(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
}

function geometry(points) {
  let latitude = 0, longitude = 0, index = 0;
  const coordinates = [];
  const next = () => {
    let value = 0, shift = 0, byte;
    do {
      if (index >= points.length || shift > 30) throw new Error('Invalid route geometry');
      byte = points.charCodeAt(index++) - 63;
      if (byte < 0 || byte > 63) throw new Error('Invalid route geometry');
      value |= (byte & 31) << shift;
      shift += 5;
    } while (byte >= 32);
    return (value & 1) ? ~(value >> 1) : value >> 1;
  };
  while (index < points.length) {
    latitude += next(); longitude += next();
    coordinates.push([longitude / 100000, latitude / 100000]);
  }
  return { type: 'LineString', coordinates };
}

function normalizeJourney(itinerary, input) {
  const modes = { WALK: 'WALK', SUBWAY: 'METRO', RAIL: 'METRO', TRAM: 'TRAM', BUS: 'BUS' };
  const legs = itinerary.legs.map((leg, index) => ({
    id: leg.id || `leg-${index}`,
    mode: modes[leg.mode],
    startTime: timestamp(leg.start.scheduledTime), endTime: timestamp(leg.end.scheduledTime),
    from: place(leg.from), to: place(leg.to),
    intermediateStops: (leg.intermediatePlaces || []).map(p => ({ ...place(p),
      arrivalTime: timestamp(p.arrival?.scheduledTime), departureTime: timestamp(p.departure?.scheduledTime) })),
    route: leg.route ? { id: leg.route.gtfsId, shortName: leg.route.shortName || '', headsign: leg.headsign || '' } : null,
    distanceMetres: leg.distance,
    geometry: geometry(leg.legGeometry?.points || ''),
    departureSource: 'scheduled', accessibility: 'unknown',
  }));
  const startTime = timestamp(itinerary.start), endTime = timestamp(itinerary.end);
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime < startTime || !legs.length ||
      !Number.isFinite(itinerary.walkDistance) || itinerary.walkDistance < 0 || !Number.isInteger(itinerary.numberOfTransfers) ||
      legs.some(leg => !leg.mode || !Number.isFinite(leg.startTime) || !Number.isFinite(leg.endTime) || leg.endTime < leg.startTime ||
        !validPlace(leg.from) || !validPlace(leg.to) || !Number.isFinite(leg.distanceMetres) || leg.distanceMetres < 0 ||
        leg.geometry.coordinates.length < 2 || (leg.mode !== 'WALK' && !leg.route?.id))) {
    throw new Error('Incomplete routing response');
  }
  return {
    id: idFor(legs), from: input.from, to: input.to, startTime, endTime,
    durationSeconds: (endTime - startTime) / 1000,
    walkDistanceMetres: itinerary.walkDistance,
    transfers: itinerary.numberOfTransfers,
    legs,
  };
}

async function readPayload(response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Missing routing response body');
  const chunks = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 2 * 1024 * 1024) throw new Error('Routing response too large');
      chunks.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally { await reader.cancel().catch(() => {}); }
}

function alternatives(journeys) {
  const distinct = new Map();
  for (const journey of journeys.toSorted((a, b) => a.endTime - b.endTime || a.walkDistanceMetres - b.walkDistanceMetres)) {
    const rides = journey.legs.filter(leg => leg.mode !== 'WALK');
    const path = rides.length ? rides.map(leg => [leg.mode, leg.route.id, leg.from.stopId, leg.to.stopId,
      leg.intermediateStops.map(stop => stop.stopId)]) : ['WALK', journey.from.coordinates, journey.to.coordinates];
    const key = JSON.stringify(path);
    if (!distinct.has(key)) distinct.set(key, journey);
  }
  const candidates = [...distinct.values()];
  if (!candidates.length) return [];
  const selected = new Map([[candidates[0].id, { ...candidates[0], recommendation: 'fastest' }]]);
  const lessWalking = candidates.toSorted((a, b) => a.walkDistanceMetres - b.walkDistanceMetres || a.endTime - b.endTime)[0];
  const fewerTransfers = candidates.toSorted((a, b) => a.transfers - b.transfers || a.endTime - b.endTime)[0];
  if (lessWalking.walkDistanceMetres < candidates[0].walkDistanceMetres) selected.set(lessWalking.id, { ...lessWalking, recommendation: 'less-walking' });
  if (fewerTransfers.transfers < candidates[0].transfers && !selected.has(fewerTransfers.id)) selected.set(fewerTransfers.id, { ...fewerTransfers, recommendation: 'fewer-transfers' });
  for (const journey of candidates) {
    if (selected.size >= 3) break;
    if (!selected.has(journey.id)) selected.set(journey.id, journey);
  }
  return [...selected.values()].sort((a, b) => a.endTime - b.endTime);
}

function exceedsWalkingLimit(journey, maxMinutes) {
  let walkingMs = 0;
  for (const leg of journey.legs) {
    walkingMs = leg.mode === 'WALK' ? walkingMs + leg.endTime - leg.startTime : 0;
    if (walkingMs > maxMinutes * 60000) return true;
  }
  return false;
}

/** Returns HTTP status/body for the application's fixed POST /api/journeys route. */
export function createJourneyRouter({ otpUrl = process.env.OTP_URL, fetchFn = globalThis.fetch,
  now = Date.now, timeoutMs = 12000, maxInFlight = 2 } = {}) {
  let inFlight = 0;
  return async function planJourneys(input) {
    if (!validRequest(input)) return failure(400, 'invalid-request', 'Choose named starting and destination coordinates and an ISO departure time with timezone.');
    if (!validEndpoint(otpUrl)) return failure(503, 'routing-unavailable', 'Journey planning is not configured.');
    if (inFlight >= maxInFlight) return failure(429, 'routing-busy', 'Journey planning is busy. Try again shortly.');
    inFlight++;
    const controller = new AbortController();
    let timer;
    const from = { label: input.from.name, location: { coordinate: { longitude: input.from.coordinates[0], latitude: input.from.coordinates[1] } } };
    const to = { label: input.to.name, location: { coordinate: { longitude: input.to.coordinates[0], latitude: input.to.coordinates[1] } } };
    try {
      const operation = (async () => {
        const upstream = await fetchFn(otpUrl, { method: 'POST', signal: controller.signal,
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ query: QUERY, variables: { from, to, dateTime: { earliestDeparture: input.departureTime } } }) });
        if (!upstream.ok) return null;
        return readPayload(upstream);
      })();
      const payload = await Promise.race([operation, new Promise((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(Object.assign(new Error('Deadline'), { code: 'routing-timeout' })); }, timeoutMs);
      })]);
      if (!payload) return failure(503, 'routing-unavailable', 'The Journey routing service is unavailable.');
      const range = payload.data?.serviceTimeRange;
      const plan = payload.data?.planConnection;
      if (payload.errors?.length || !range || !Number.isFinite(range.start) || !Number.isFinite(range.end) ||
          !Array.isArray(plan?.edges) || !Array.isArray(plan.routingErrors)) {
        return failure(502, 'routing-unavailable', 'The Journey routing service returned an invalid response.');
      }
      const departure = timestamp(input.departureTime) / 1000;
      if (departure < range.start || departure > range.end || plan.routingErrors.some(error => error.code === 'OUTSIDE_SERVICE_PERIOD')) {
        return failure(422, 'calendar-expired', 'The departure is outside the available service calendar.');
      }
      const candidates = plan.edges.map(({ node }) => normalizeJourney(node, input)).map(journey => ({ ...journey,
        exceedsWalkLimit: exceedsWalkingLimit(journey, input.preferences?.maxWalkMinutes ?? 15) }));
      const eligible = input.preferences?.allowLongerWalk ? candidates : candidates.filter(journey => !journey.exceedsWalkLimit);
      const journeys = alternatives(eligible);
      const status = journeys.length ? 'ok' : candidates.length ? 'walking-limit' : 'no-route';
      return { status: 200, body: { status, journeys, generatedAt: now(),
        servicePeriod: { startTime: range.start * 1000, endTime: range.end * 1000 } } };
    } catch (error) {
      if (error.code === 'routing-timeout') return failure(504, 'routing-timeout', 'Journey planning did not answer in time.');
      return failure(502, 'routing-unavailable', 'The Journey routing service could not produce a verified Journey.');
    } finally { clearTimeout(timer); controller.abort(); inFlight--; }
  };
}
