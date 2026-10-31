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

  it('clears an alighting alert once the last call is reached without ending the Journey automatically', () => {
    const h = harness();
    h.session.start(journey);
    h.time(start + 800_000);
    expect(h.session.getSnapshot().alightAlert).not.toBe(null);
    h.time(start + 1_300_000);
    expect(h.session.getSnapshot()).toMatchObject({ status: 'active', callIndex: 2, alightAlert: null });
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

  it('resumes an explicitly chosen saved Journey with its identity and delay, without treating old location as fresh', async () => {
    const h = harness();
    h.session.start(journey, { soundEnabled: true });
    h.time(start + 800_000);
    h.session.correctCall(1, 0);
    const saved = JSON.parse(JSON.stringify(h.session.getSnapshot()));
    h.session.dispose();
    const restored = harness();
    restored.time(start + 810_000);
    await restored.session.resume(saved);
    expect(restored.session.getSnapshot()).toMatchObject({ status: 'active', sessionId: saved.sessionId,
      startedAt: saved.startedAt, scheduleOffset: saved.scheduleOffset, legIndex: 1, callIndex: 0,
      progressSource: 'estimated', soundEnabled: true });
    await expect(restored.session.resume({ ...saved, callIndex: 999 })).rejects.toThrow();
  });

  it('inspects and adopts newer locked-phone progress before sending a native start', async () => {
    const h = harness();
    h.session.start(journey);
    const saved = h.session.getSnapshot();
    const nativeAdapter = {
      getSession: vi.fn(async () => ({ supported: true, status: 'active', session: {
        version: 1, id: saved.sessionId, journey, legIndex: 1, callIndex: 1,
        updatedAt: start + 900_000, scheduleOffset: 0, boardingConfirmed: false,
      } })),
      startSession: vi.fn(), updateSession: vi.fn(async () => ({ supported: true, status: 'active' })),
    };
    const session = createJourneySession({ now: () => start + 900_000, nativeAdapter, setIntervalFn: () => 1, clearIntervalFn: () => {} });
    await session.resume(saved);
    expect(session.getSnapshot()).toMatchObject({ sessionId: saved.sessionId, legIndex: 1, callIndex: 1, nativeStatus: 'active' });
    expect(nativeAdapter.startSession).not.toHaveBeenCalled();
  });

  it('cannot restart guidance after a pending resume was cancelled', async () => {
    const h = harness();
    h.session.start(journey);
    const saved = h.session.getSnapshot();
    let answer;
    const nativeAdapter = { getSession: () => new Promise(resolve => { answer = resolve; }), startSession: vi.fn() };
    const session = createJourneySession({ now: () => start, nativeAdapter, setIntervalFn: () => 1, clearIntervalFn: () => {} });
    const pending = session.resume(saved);
    await Promise.resolve(); await Promise.resolve();
    session.cancel();
    answer({ supported: false, status: 'unavailable' });
    await pending;
    expect(session.getSnapshot().status).toBe('idle');
    expect(nativeAdapter.startSession).not.toHaveBeenCalled();
  });

  it('reports a native session that stopped accepting updates as unavailable', async () => {
    const nativeAdapter = {
      startSession: async () => ({ supported: true, status: 'active' }),
      updateSession: async () => ({ supported: false, status: 'unavailable' }),
    };
    const session = createJourneySession({ now: () => start, nativeAdapter, setIntervalFn: () => 1, clearIntervalFn: () => {} });
    session.start(journey);
    await new Promise(resolve => setTimeout(resolve, 0));
    session.correctCall(1, 0);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(session.getSnapshot().nativeStatus).toBe('unavailable');
  });

  it('ends the foreground Journey when the passenger stops previously active guidance from the OS notification', async () => {
    const nativeAdapter = {
      startSession: async () => ({ supported: true, status: 'active' }),
      getSession: async () => ({ supported: true, status: 'stopped', session: null }),
      stopSession: async () => ({ supported: true, status: 'stopped' }),
    };
    const session = createJourneySession({ now: () => start, nativeAdapter, setIntervalFn: () => 1, clearIntervalFn: () => {} });
    session.start(journey);
    await new Promise(resolve => setTimeout(resolve, 0));
    await session.reconcileNative();
    expect(session.getSnapshot()).toMatchObject({ status: 'cancelled', nativeStatus: 'stopped' });
  });
});
