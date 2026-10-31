import { describe, expect, it, vi } from 'vitest';
import { createJourneySession } from './journeySession';
import { createJourneyNativeAdapter } from './journeyNative';

const start = 1_800_000_000_000;
const place = (name, lat) => ({ name, coordinates: [-0.38, lat] });
const journey = {
  id: 'rail-library', from: place('Street', 39.46), to: place('Library', 39.49),
  startTime: start, endTime: start + 1_200_000,
  legs: [
    { id: 'walk', mode: 'WALK', startTime: start, endTime: start + 300_000, from: place('Street', 39.46), to: place('Boarding station', 39.47), intermediateStops: [] },
    { id: 'metro', mode: 'METRO', startTime: start + 360_000, endTime: start + 1_200_000, from: place('Boarding station', 39.47), to: place('Library station', 39.49), route: { shortName: '3' }, intermediateStops: [
      { ...place('Middle station', 39.48), arrivalTime: start + 720_000, departureTime: start + 740_000 },
    ] },
  ],
};
const harness = () => {
  let at = start;
  const clearIntervalFn = vi.fn();
  const session = createJourneySession({ now: () => at, setIntervalFn: () => 123, clearIntervalFn });
  return { session, clearIntervalFn, time: value => { at = value; session.tick(); } };
};

describe('active passenger Journey', () => {
  it('starts only explicitly and keeps scheduled progress estimated until the passenger confirms boarding', () => {
    const h = harness();
    expect(h.session.getSnapshot().status).toBe('idle');
    h.session.start(journey);
    expect(h.session.getSnapshot()).toMatchObject({ status: 'active', legIndex: 0, boardingConfirmed: false, progressSource: 'estimated' });
    h.time(start + 800_000);
    expect(h.session.getSnapshot()).toMatchObject({ legIndex: 1, callIndex: 1, boardingConfirmed: false, progressSource: 'estimated' });
    h.session.confirmBoarding();
    expect(h.session.getSnapshot().boardingConfirmed).toBe(true);
    expect(h.session.getSnapshot().progressSource).toBe('estimated');
    h.session.cancel();
    expect(h.session.getSnapshot().status).toBe('cancelled');
    expect(h.clearIntervalFn).toHaveBeenCalledWith(123);
  });

  it('lets the passenger correct a delayed Journey without the next clock tick undoing the correction', () => {
    const h = harness();
    h.session.start(journey);
    h.time(start + 900_000);
    h.session.correctCall(1, 0);
    expect(h.session.getSnapshot()).toMatchObject({ legIndex: 1, callIndex: 0, progressSource: 'manual', boardingConfirmed: false });
    h.time(start + 910_000);
    expect(h.session.getSnapshot().callIndex).toBe(0);
    h.session.advanceLeg();
    expect(h.session.getSnapshot().status).toBe('active');
    h.session.complete();
    expect(h.session.getSnapshot().status).toBe('completed');
  });

  it('uses an accurate fresh location to correct the current call without assuming boarding', () => {
    const h = harness();
    h.session.start(journey);
    h.time(start + 400_000);
    h.session.updateLocation({ coordinates: [-0.38, 39.48], accuracy: 15, updatedAt: start + 400_000 });
    expect(h.session.getSnapshot()).toMatchObject({ callIndex: 1, progressSource: 'location', boardingConfirmed: false });
    h.session.updateLocation({ coordinates: [-0.38, 39.49], accuracy: 1000, updatedAt: start + 400_000 });
    expect(h.session.getSnapshot().callIndex).toBe(1);
    h.session.updateLocation({ coordinates: [-0.38, 39.49], accuracy: 15, updatedAt: start });
    expect(h.session.getSnapshot().callIndex).toBe(1);
  });

  it('reports foreground-only web capability instead of claiming a native background session is active', async () => {
    const plugin = { startSession: vi.fn() };
    const adapter = createJourneyNativeAdapter({ isNative: () => false, plugin });
    const response = await adapter.startSession({ session: { version: 1 } });
    expect(response).toMatchObject({ supported: false, status: 'unavailable', platform: 'web' });
    expect(plugin.startSession).not.toHaveBeenCalled();
  });

  it('announces an estimated alighting point once per transit portion without confirming the passenger boarded', () => {
    let at = start;
    const onAlert = vi.fn();
    const session = createJourneySession({ now: () => at, setIntervalFn: () => 1, clearIntervalFn: () => {}, onAlert });
    session.start(journey);
    at = start + 800_000;
    session.tick(); session.tick();
    expect(onAlert).toHaveBeenCalledTimes(1);
    expect(onAlert.mock.calls[0][0]).toMatchObject({ estimated: true, destination: 'Library station' });
    expect(session.getSnapshot().boardingConfirmed).toBe(false);
    session.cancel(); session.tick();
    expect(session.getSnapshot().alightAlert).toBe(null);
  });

  it('keeps native cleanup after a pending start and never revives a cancelled session', async () => {
    let resolveStart;
    const plugin = {
      startSession: vi.fn(() => new Promise(resolve => { resolveStart = resolve; })),
      stopSession: vi.fn(async () => ({ supported: true, status: 'stopped' })),
    };
    const session = createJourneySession({ now: () => start, setIntervalFn: () => 1, clearIntervalFn: () => {}, nativeAdapter: plugin });
    session.start(journey);
    await Promise.resolve(); await Promise.resolve();
    session.cancel();
    resolveStart({ supported: true, status: 'active' });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(plugin.stopSession).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot()).toMatchObject({ status: 'cancelled', nativeStatus: 'stopped' });
  });
});
