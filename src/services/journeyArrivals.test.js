import { describe, expect, it, vi } from 'vitest';
import { createJourneyArrivals } from './journeyArrivals';
import { clearEmtCache, fetchStopArrivals } from './emtArrivalService';

const NOW = Date.parse('2026-10-31T17:00:00Z');
const railLeg = { id: 'rail-leg', mode: 'METRO', startTime: NOW + 300000, endTime: NOW + 900000,
  from: { name: 'Àngel Guimerà', coordinates: [-0.385, 39.4703], stopId: 'metrovalencia:25' },
  to: { name: 'Benimaclet', coordinates: [-0.3623, 39.4848], stopId: 'metrovalencia:67' },
  route: { id: 'metrovalencia:V3-182-64', shortName: '3', headsign: 'Rafelbunyol' }, intermediateStops: [] };
const journey = { id: 'journey', legs: [railLeg] };
const busLeg = { ...railLeg, id: 'bus-leg', mode: 'BUS',
  from: { name: 'Plaça de l’Ajuntament', coordinates: [-0.3767, 39.4699], stopId: 'emt:2403' },
  route: { id: 'emt:1017', shortName: '4', headsign: 'Port' } };
const emptyRailMemory = () => ({ subscribe: () => () => {}, getCachedArrivals: () => null, getStationArrivals: vi.fn() });

describe('chosen Journey Arrival information', () => {
  it('shows rail Arrival Memory synchronously, without selecting a passenger Vehicle or making a request', () => {
    const fetchBusArrivals = vi.fn();
    const getStationArrivals = vi.fn();
    const railMemory = { subscribe: () => () => {}, getStationArrivals,
      getCachedArrivals: () => ({ fetchedAt: NOW - 10000, isFresh: true, arrivals: [
        { line: '3', destination: 'Rafelbunyol', targetTimestamp: NOW + 180000, isLive: true, vehicleId: 'reported-vehicle' },
        { line: '3', destination: 'Aeroport', targetTimestamp: NOW + 60000, isLive: true },
        { line: '9', destination: 'Alboraia', targetTimestamp: NOW + 120000, isLive: true },
      ] }) };
    const arrivals = createJourneyArrivals({ railMemory, fetchBusArrivals, now: () => NOW });
    arrivals.select({ journey, legIndex: 0, callIndex: 0 });
    expect(arrivals.getSnapshot()).toMatchObject({ scheduledTime: NOW + 300000, tripConfirmed: false,
      stop: { name: 'Àngel Guimerà' }, predictions: [{ line: '3', destination: 'Rafelbunyol', seconds: 180,
        targetTimestamp: NOW + 180000, source: 'live', tripConfirmed: false }] });
    expect(arrivals.getSnapshot().predictions).toHaveLength(1);
    expect(fetchBusArrivals).not.toHaveBeenCalled();
    expect(getStationArrivals).not.toHaveBeenCalled();
    arrivals.dispose();
  });

  it('fetches one bus stop only on explicit refresh, reuses its TTL/in-flight work, and ages the original countdown', async () => {
    vi.useFakeTimers(); vi.setSystemTime(NOW); clearEmtCache();
    let release;
    const fetchFn = vi.fn(() => new Promise(resolve => { release = resolve; }));
    const arrivals = createJourneyArrivals({ railMemory: emptyRailMemory(),
      fetchBusArrivals: code => fetchStopArrivals(code, { fetchFn }) });
    try {
      arrivals.select({ journey: { id: 'bus-journey', legs: [busLeg] } });
      expect(arrivals.getSnapshot()).toMatchObject({ predictions: [], isLoading: false });
      expect(fetchFn).not.toHaveBeenCalled();
      const refreshed = arrivals.refresh();
      const joined = arrivals.refresh();
      expect(arrivals.getSnapshot()).toMatchObject({ isLoading: true, scheduledTime: busLeg.startTime });
      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(fetchFn.mock.calls[0][0]).toContain('parada=2403&');
      release({ ok: true, text: async () => '<estimacion><bus><linea>4</linea><destino>Port</destino><minutos>3 min.</minutos></bus></estimacion>' });
      await Promise.all([refreshed, joined]);
      expect(arrivals.getSnapshot()).toMatchObject({ isLoading: false, tripConfirmed: false,
        predictions: [{ seconds: 180, targetTimestamp: NOW + 180000, source: 'live', tripConfirmed: false }] });
      vi.advanceTimersByTime(10000);
      await arrivals.refresh();
      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(arrivals.getSnapshot().predictions[0].seconds).toBe(170);
      vi.advanceTimersByTime(10000);
      expect(arrivals.getSnapshot().predictions[0]).toMatchObject({ seconds: 160, source: 'stale' });
      vi.advanceTimersByTime(160001);
      expect(arrivals.getSnapshot().predictions).toEqual([]);
      expect(fetchFn).toHaveBeenCalledTimes(1);
    } finally { arrivals.dispose(); clearEmtCache(); vi.useRealTimers(); }
  });

  it('keeps the scheduled Journey and aged stale prediction when an explicit bus refresh fails', async () => {
    const fetchBusArrivals = vi.fn(async () => { throw new Error('offline'); });
    const arrivals = createJourneyArrivals({ railMemory: emptyRailMemory(), now: () => NOW, fetchBusArrivals,
      getBusSnapshot: () => ({ fetchedAt: NOW - 30000, isFresh: false,
        arrivals: [{ line: '4', destination: 'Port', dueSeconds: 180, isLive: true }] }) });
    arrivals.select({ journey: { id: 'bus-journey', legs: [busLeg] } });
    await arrivals.refresh();
    expect(arrivals.getSnapshot()).toMatchObject({ error: 'unavailable', scheduledTime: busLeg.startTime,
      predictions: [{ source: 'stale', seconds: 150, targetTimestamp: NOW + 150000, tripConfirmed: false }] });
    expect(fetchBusArrivals).toHaveBeenCalledExactlyOnceWith('2403');
    arrivals.dispose();
  });

  it('never fetches on Journey Progress selection, while hidden, or for unrecognized bus stop identity', async () => {
    let visible = false;
    const fetchBusArrivals = vi.fn(async () => []);
    const arrivals = createJourneyArrivals({ railMemory: emptyRailMemory(), fetchBusArrivals,
      getBusSnapshot: () => null, isVisible: () => visible });
    const nextStop = { name: 'Next stop', stopId: 'emt:1624', arrivalTime: NOW + 60000, departureTime: NOW + 60000 };
    const selected = { id: 'bus-journey', legs: [{ ...busLeg, intermediateStops: [nextStop] }] };
    arrivals.select({ journey: selected, callIndex: 0 });
    arrivals.select({ journey: selected, callIndex: 1 });
    expect(fetchBusArrivals).not.toHaveBeenCalled();
    await arrivals.refresh();
    expect(fetchBusArrivals).not.toHaveBeenCalled();
    visible = true;
    await arrivals.refresh();
    expect(fetchBusArrivals).toHaveBeenCalledExactlyOnceWith('1624');
    arrivals.select({ journey: { id: 'unrecognized', legs: [{ ...busLeg, from: { ...busLeg.from, stopId: 'other:2403' } }] } });
    await arrivals.refresh();
    expect(fetchBusArrivals).toHaveBeenCalledTimes(1);
    arrivals.dispose();
  });

  it('subscribes to rail Memory updates and does not let a previous bus lookup replace the selected rail stop', async () => {
    let changed;
    let release;
    const unsubscribe = vi.fn();
    let railSnapshot = null;
    const memory = { subscribe: listener => { changed = listener; return unsubscribe; },
      getCachedArrivals: () => railSnapshot, getStationArrivals: vi.fn() };
    const arrivals = createJourneyArrivals({ railMemory: memory, now: () => NOW,
      getBusSnapshot: () => null, fetchBusArrivals: () => new Promise(resolve => { release = resolve; }) });
    const observed = [];
    const stop = arrivals.subscribe(snapshot => observed.push(snapshot));
    arrivals.select({ journey: { id: 'bus-journey', legs: [busLeg] } });
    const oldRequest = arrivals.refresh();
    arrivals.select({ journey });
    railSnapshot = { fetchedAt: NOW, isFresh: true,
      arrivals: [{ line: '3', destination: 'Rafelbunyol', targetTimestamp: NOW + 60000, isLive: true }] };
    changed();
    expect(observed.at(-1)).toMatchObject({ legId: 'rail-leg', predictions: [{ seconds: 60 }] });
    release([]); await oldRequest;
    expect(arrivals.getSnapshot()).toMatchObject({ legId: 'rail-leg', error: null, stop: { name: 'Àngel Guimerà' } });
    stop();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    arrivals.dispose();
  });
});
