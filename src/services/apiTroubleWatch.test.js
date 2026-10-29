import { describe, it, expect, beforeEach, vi } from 'vitest';

// diagnostics keeps module-level state, so every test starts from a fresh copy.
const setup = async () => {
  vi.resetModules();
  const diag = await import('../utils/diagnostics');
  const watch = await import('./apiTroubleWatch');
  let t = 1_000_000;
  const report = vi.fn();
  const stop = watch.watchApiTrouble({ report, now: () => t });
  return { diag, watch, report, stop, tick: (ms) => { t += ms; } };
};

describe('#144 API trouble watch (Telegram alert source)', () => {
  beforeEach(() => vi.resetModules());

  it('a blocked answer is reported at once, with the request rate that preceded it', async () => {
    const { diag, report } = await setup();
    for (let i = 0; i < 7; i += 1) diag.recordApiRequest('bus');
    diag.recordApiFailure('bus', { kind: 'blocked', status: 403 });
    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith(expect.objectContaining({
      api: 'bus', kind: 'blocked', status: 403, requestsLast10s: 7, requestsLast60s: 7,
    }));
  });

  it('a rate-limited answer is reported at once', async () => {
    const { diag, report } = await setup();
    diag.recordApiFailure('train', { kind: 'rate-limited', status: 429 });
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ api: 'train', kind: 'rate-limited', status: 429 }));
  });

  it('a lone timeout is not reported; a streak of them is', async () => {
    const { diag, watch, report } = await setup();
    for (let i = 0; i < watch.TROUBLE_STREAK - 1; i += 1) diag.recordApiFailure('bus', { kind: 'unreachable', status: null });
    expect(report).not.toHaveBeenCalled();
    diag.recordApiFailure('bus', { kind: 'unreachable', status: null });
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ api: 'bus', kind: 'unreachable', failuresInARow: watch.TROUBLE_STREAK }));
  });

  it('the same alert is not repeated within the repeat window, but is after it', async () => {
    const { diag, watch, report, tick } = await setup();
    diag.recordApiFailure('bus', { kind: 'blocked', status: 403 });
    diag.recordApiFailure('bus', { kind: 'blocked', status: 403 });
    expect(report).toHaveBeenCalledTimes(1);
    tick(watch.TROUBLE_REPEAT_MS + 1);
    diag.recordApiFailure('bus', { kind: 'blocked', status: 403 });
    expect(report).toHaveBeenCalledTimes(2);
  });

  it('reports recovery with how long the trouble lasted, once', async () => {
    const { diag, report, tick } = await setup();
    diag.recordApiFailure('bus', { kind: 'blocked', status: 403 });
    tick(42_000);
    diag.recordApiSuccess('bus');
    diag.recordApiSuccess('bus');
    expect(report).toHaveBeenLastCalledWith({ api: 'bus', recovered: true, downForMs: 42_000 });
    expect(report).toHaveBeenCalledTimes(2);
  });

  it('stops watching when asked', async () => {
    const { diag, report, stop } = await setup();
    stop();
    diag.recordApiFailure('bus', { kind: 'blocked', status: 403 });
    expect(report).not.toHaveBeenCalled();
  });
});
