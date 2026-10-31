import { describe, expect, it } from 'vitest';
import { createJourneySession } from './journeySession';
import { createJourneyRecovery } from './journeyRecovery';

const journey = {
  id: 'rail-trip', from: { name: 'Xàtiva', coordinates: [-0.377, 39.466] }, to: { name: 'Colón', coordinates: [-0.37, 39.47] },
  startTime: 1000, endTime: 61000,
  legs: [{ id: 'rail-leg', mode: 'METRO', startTime: 1000, endTime: 61000,
    from: { name: 'Xàtiva', coordinates: [-0.377, 39.466] }, to: { name: 'Colón', coordinates: [-0.37, 39.47] }, intermediateStops: [] }],
};
const memory = () => {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
};

describe('unfinished passenger Journey recovery', () => {
  it('retains instructions across reopen without restarting tracking, and resumes only on explicit action', async () => {
    const storage = memory();
    const recovery = createJourneyRecovery({ storage });
    const session = createJourneySession({ now: () => 1000, setIntervalFn: () => 1, clearIntervalFn: () => {} });
    session.subscribe(snapshot => recovery.save(snapshot));
    session.start(journey);
    const reopened = createJourneyRecovery({ storage });
    const saved = reopened.load();
    expect(saved.journey.to.name).toBe('Colón');
    const resumed = createJourneySession({ now: () => 2000, setIntervalFn: () => 1, clearIntervalFn: () => {} });
    expect(resumed.getSnapshot().status).toBe('idle');
    await resumed.resume(saved);
    expect(resumed.getSnapshot().sessionId).toBe(saved.sessionId);
    expect(resumed.getSnapshot().status).toBe('active');
    session.cancel();
    expect(reopened.load()).toBeNull();
    resumed.dispose();
  });

  it('discards corrupt storage and stays usable when persistence is denied', () => {
    const badStorage = { getItem: () => '{broken', removeItem: () => {}, setItem: () => { throw new Error('Storage denied'); } };
    const recovery = createJourneyRecovery({ storage: badStorage });
    expect(recovery.load()).toBeNull();
    expect(recovery.save({ version: 1, status: 'active', sessionId: 'saved', startedAt: 1, updatedAt: 1,
      scheduleOffset: 0, legIndex: 0, callIndex: 0, journey })).toBe(false);
  });
});
