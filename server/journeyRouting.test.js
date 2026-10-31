import { describe, expect, it, vi } from 'vitest';
import { createJourneyRouter } from './journeyRouting.js';

const START = Date.parse('2026-10-31T12:00:00+01:00');
const from = { name: 'Àngel Guimerà', coordinates: [-0.384, 39.469] };
const to = { name: 'Benimaclet', coordinates: [-0.363, 39.485] };
const request = { from, to, departureTime: new Date(START).toISOString() };
const point = (name, lon, lat, id) => ({ name, lon, lat, stop: { gtfsId: id } });
const response = () => ({
  data: {
    serviceTimeRange: { start: START / 1000 - 86400, end: START / 1000 + 86400 },
    planConnection: {
      routingErrors: [],
      edges: [{ node: {
        start: '2026-10-31T12:02:00+01:00', end: '2026-10-31T12:13:00+01:00',
        walkDistance: 0, numberOfTransfers: 0,
        legs: [{
          id: 'otp-leg-1', mode: 'SUBWAY', distance: 4200,
          start: { scheduledTime: '2026-10-31T12:02:00+01:00' },
          end: { scheduledTime: '2026-10-31T12:13:00+01:00' },
          from: point('Àngel Guimerà', -0.384, 39.469, 'rail:42'),
          to: point('Benimaclet', -0.363, 39.485, 'rail:57'),
          intermediatePlaces: [{ ...point('Colón', -0.37, 39.47, 'rail:43'),
            arrival: { scheduledTime: '2026-10-31T12:06:00+01:00' },
            departure: { scheduledTime: '2026-10-31T12:07:00+01:00' } }],
          route: { gtfsId: 'rail:3', shortName: '3' }, headsign: 'Rafelbunyol',
          legGeometry: { points: '_p~iF~ps|U_ulLnnqC_mqNvxq`@' },
        }],
      } }],
    },
  },
});

describe('rail Journey routing service boundary', () => {
  it('plans a scheduled Journey with named boarding, intermediate, and alighting calls', async () => {
    const plan = createJourneyRouter({ otpUrl: 'http://127.0.0.1:8801/otp/gtfs/v1',
      fetchFn: async () => Response.json(response()), now: () => START });
    const result = await plan(request);
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ status: 'ok', generatedAt: START,
      journeys: [{ from, to, startTime: START + 120000, endTime: START + 780000,
        durationSeconds: 660, walkDistanceMetres: 0, transfers: 0,
        legs: [{ mode: 'METRO', departureSource: 'scheduled', accessibility: 'unknown',
          from: { name: 'Àngel Guimerà', stopId: 'rail:42' },
          to: { name: 'Benimaclet', stopId: 'rail:57' },
          intermediateStops: [{ name: 'Colón', arrivalTime: START + 360000, departureTime: START + 420000 }],
          route: { id: 'rail:3', shortName: '3', headsign: 'Rafelbunyol' },
          geometry: { type: 'LineString', coordinates: [[-120.2, 38.5], [-120.95, 40.7], [-126.453, 43.252]] },
        }],
      }],
    });
  });

  it('rejects invalid passenger inputs before contacting OTP and fails honestly when unconfigured', async () => {
    let calls = 0;
    const fetchFn = async () => { calls++; return Response.json(response()); };
    const plan = createJourneyRouter({ otpUrl: 'http://127.0.0.1:8801/otp/gtfs/v1', fetchFn });
    for (const invalid of [null, {}, { ...request, from: { name: 'Invalid', coordinates: [Infinity, 40] } },
      { ...request, departureTime: 'yesterday' }, { ...request, departureTime: '2026-10-31T11:00:00' },
      { ...request, preferences: { maxWalkMinutes: -1 } }, { ...request, otpUrl: 'https://attacker.test' }]) {
      const result = await plan(invalid);
      expect(result).toMatchObject({ status: 400, body: { error: { code: 'invalid-request' } } });
    }
    expect(calls).toBe(0);
    expect(await createJourneyRouter({ otpUrl: '', fetchFn })(request)).toMatchObject({
      status: 503, body: { error: { code: 'routing-unavailable' } },
    });
    expect(calls).toBe(0);
  });

  it('distinguishes an expired calendar, no connection, and an unavailable or malformed router', async () => {
    const run = async (payload, status = 200) => createJourneyRouter({
      otpUrl: 'http://127.0.0.1:8801/otp/gtfs/v1', now: () => START,
      fetchFn: async () => Response.json(payload, { status }),
    })(request);
    const expired = response();
    expired.data.serviceTimeRange.end = START / 1000 - 1;
    expect(await run(expired)).toMatchObject({ status: 422, body: { error: { code: 'calendar-expired' } } });
    const none = response();
    none.data.planConnection.edges = [];
    none.data.planConnection.routingErrors = [{ code: 'NO_TRANSIT_CONNECTION' }];
    expect(await run(none)).toMatchObject({ status: 200, body: { status: 'no-route', journeys: [] } });
    for (const payload of [{ errors: [{ message: 'Bad graph' }] }, {}, { data: { planConnection: {} } }]) {
      expect(await run(payload)).toMatchObject({ status: 502, body: { error: { code: 'routing-unavailable' } } });
    }
    expect(await run({ message: 'down' }, 503)).toMatchObject({ status: 503, body: { error: { code: 'routing-unavailable' } } });
    const broken = response();
    broken.data.planConnection.edges[0].node.legs[0].mode = 'CAR';
    expect(await run(broken)).toMatchObject({ status: 502, body: { error: { code: 'routing-unavailable' } } });
  });

  it('bounds simultaneous upstream work and ends a hung router request at the deadline', async () => {
    vi.useFakeTimers();
    try {
      const requests = [];
      const plan = createJourneyRouter({ otpUrl: 'http://127.0.0.1:8801/otp/gtfs/v1', maxInFlight: 1, timeoutMs: 50,
        fetchFn: (_url, options) => { requests.push(options); return new Promise(() => {}); } });
      const first = plan(request);
      expect(await plan(request)).toMatchObject({ status: 429, body: { error: { code: 'routing-busy' } } });
      expect(requests).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(50);
      expect(await first).toMatchObject({ status: 504, body: { error: { code: 'routing-timeout' } } });
      expect(requests[0].signal.aborted).toBe(true);
      const again = plan(request);
      await vi.advanceTimersByTimeAsync(50);
      expect((await again).status).toBe(504);
      expect(requests).toHaveLength(2);
    } finally { vi.useRealTimers(); }
  });

  it('retains the ordered EMT bus and rail calls of a mixed-mode transfer Journey', async () => {
    const payload = response();
    const itinerary = payload.data.planConnection.edges[0].node;
    const rail = itinerary.legs[0];
    const bus = { ...rail, id: 'bus-1', mode: 'BUS', route: { gtfsId: 'emt:90', shortName: '90' }, headsign: 'Campanar',
      from: point('EMT origin', -0.4, 39.47, 'emt:101'), to: rail.from,
      start: { scheduledTime: '2026-10-31T11:48:00+01:00' },
      end: { scheduledTime: '2026-10-31T11:58:00+01:00' } };
    itinerary.legs = [bus, rail];
    itinerary.start = '2026-10-31T11:48:00+01:00';
    itinerary.numberOfTransfers = 1;
    const plan = createJourneyRouter({ otpUrl: 'http://127.0.0.1:8801/otp/gtfs/v1', fetchFn: async () => Response.json(payload) });
    const result = await plan(request);
    expect(result.status).toBe(200);
    expect(result.body.journeys[0]).toMatchObject({ transfers: 1,
      legs: [{ mode: 'BUS', route: { shortName: '90' }, departureSource: 'scheduled', from: { stopId: 'emt:101' } }, { mode: 'METRO' }],
    });
  });

  it('shows fastest arrival first and collapses later departures on the same transit path', async () => {
    const payload = response();
    const original = payload.data.planConnection.edges[0].node;
    const later = structuredClone(original);
    later.end = '2026-10-31T12:23:00+01:00';
    later.legs[0].end.scheduledTime = later.end;
    const other = structuredClone(original);
    other.end = '2026-10-31T12:17:00+01:00';
    other.legs[0].route = { gtfsId: 'rail:9', shortName: '9' };
    other.legs[0].end.scheduledTime = other.end;
    payload.data.planConnection.edges = [{ node: later }, { node: other }, { node: original }];
    const result = await createJourneyRouter({ otpUrl: 'http://127.0.0.1:8801/otp/gtfs/v1',
      fetchFn: async () => Response.json(payload) })(request);
    expect(result.body.journeys).toHaveLength(2);
    expect(result.body.journeys.map(journey => journey.legs[0].route.shortName)).toEqual(['3', '9']);
    expect(result.body.journeys[0].recommendation).toBe('fastest');
  });

  it('requires explicit acceptance before offering a Journey exceeding a 15-minute walking portion', async () => {
    const payload = response();
    const itinerary = payload.data.planConnection.edges[0].node;
    itinerary.end = '2026-10-31T12:22:00+01:00';
    itinerary.walkDistance = 1600;
    itinerary.legs[0] = { ...itinerary.legs[0], mode: 'WALK', route: null, distance: 1600,
      end: { scheduledTime: itinerary.end }, intermediatePlaces: [] };
    const plan = createJourneyRouter({ otpUrl: 'http://127.0.0.1:8801/otp/gtfs/v1', fetchFn: async () => Response.json(payload) });
    expect((await plan(request)).body).toMatchObject({ status: 'walking-limit', journeys: [] });
    const accepted = await plan({ ...request, preferences: { maxWalkMinutes: 15, allowLongerWalk: true } });
    expect(accepted.body).toMatchObject({ status: 'ok', journeys: [{ exceedsWalkLimit: true }] });
    itinerary.end = '2026-10-31T12:17:00+01:00';
    itinerary.legs[0].end.scheduledTime = itinerary.end;
    expect((await plan(request)).body).toMatchObject({ status: 'ok', journeys: [{ exceedsWalkLimit: false }] });
  });

  it('keeps useful lower-walking and fewer-transfer choices even when they are not the next departures', async () => {
    const payload = response();
    const original = payload.data.planConnection.edges[0].node;
    payload.data.planConnection.edges = [
      ['3', '13', 500, 2], ['5', '14', 600, 2], ['7', '15', 700, 2], ['9', '16', 100, 1], ['10', '17', 800, 0],
    ].map(([line, minute, walkDistance, transfers]) => {
      const node = structuredClone(original);
      node.end = `2026-10-31T12:${minute}:00+01:00`;
      node.walkDistance = walkDistance;
      node.numberOfTransfers = transfers;
      node.legs[0].route = { gtfsId: `rail:${line}`, shortName: line };
      node.legs[0].end.scheduledTime = node.end;
      return { node };
    });
    const result = await createJourneyRouter({ otpUrl: 'http://127.0.0.1:8801/otp/gtfs/v1',
      fetchFn: async () => Response.json(payload) })(request);
    expect(result.body.journeys.map(journey => journey.legs[0].route.shortName)).toEqual(['3', '9', '10']);
    expect(result.body.journeys.map(journey => journey.recommendation)).toEqual(['fastest', 'less-walking', 'fewer-transfers']);
  });
});
