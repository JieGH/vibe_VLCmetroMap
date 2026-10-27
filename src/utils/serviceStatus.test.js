import { describe, it, expect } from 'vitest';
import { computeServiceStatus } from './serviceStatus';

const feed = (failuresInARow = 0, status = null) => ({
  lastFailure: failuresInARow ? { kind: 'unreachable', status, at: '2026-10-27T10:00:00.000Z' } : null,
  failuresInARow,
  lastSuccessAt: null,
});
const run = (train, bus, trainRefused = false, busRefused = false) =>
  computeServiceStatus({ health: { train, bus }, trainRefused, busRefused });

describe('computeServiceStatus', () => {
  it('is ok with no failures, and one lone failure is not enough (FGV hangs on its own now and then)', () => {
    expect(run(feed(), feed()).level).toBe('ok');
    expect(run(feed(1), feed(1)).level).toBe('ok');
  });

  it('is degraded after two failures in a row, naming the feed', () => {
    const s = run(feed(2, 502), feed());
    expect(s.level).toBe('degraded');
    expect(s.train).toMatchObject({ state: 'degraded', httpStatus: 502 });
    expect(s.bus.state).toBe('ok');
  });

  it('is blocked when a feed refuses the network, and blocked outranks degraded', () => {
    const s = run(feed(2), feed(0), false, true);
    expect(s.level).toBe('blocked');
    expect(s.bus.state).toBe('blocked');
    expect(s.train.state).toBe('degraded');
  });
});
