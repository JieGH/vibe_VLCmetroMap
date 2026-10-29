import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createBusFleetPoller, BUS_POLL_INTERVAL_MS } from './busFleetPoller';

const makeDoc = () => {
  const listeners = new Set();
  return {
    hidden: false,
    addEventListener: (type, fn) => { if (type === 'visibilitychange') listeners.add(fn); },
    removeEventListener: (type, fn) => { listeners.delete(fn); },
    setHidden(h) { this.hidden = h; listeners.forEach((fn) => fn()); },
    count: () => listeners.size,
  };
};

const setup = (over = {}) => {
  const doc = makeDoc();
  const fetchFleet = vi.fn(async () => [{ gid: 1 }]);
  const tracker = { update: vi.fn((recs) => recs.map((r) => ({ id: `b${r.gid}` }))), reset: vi.fn() };
  const onBuses = vi.fn();
  const onResponse = vi.fn();
  const onError = vi.fn();
  const poller = createBusFleetPoller({ fetchFleet, tracker, onBuses, onResponse, onError, doc, now: () => 1000, ...over });
  return { doc, fetchFleet, tracker, onBuses, onResponse, onError, poller };
};
const flush = () => vi.advanceTimersByTimeAsync(0);

describe('busFleetPoller', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('polls every 30 s per ADR-0014', () => {
    expect(BUS_POLL_INTERVAL_MS).toBe(30000);
  });

  it('never fetches until focused', async () => {
    const { fetchFleet } = setup();
    await vi.advanceTimersByTimeAsync(120000);
    expect(fetchFleet).not.toHaveBeenCalled();
  });

  it('fetches immediately on focus, feeds the tracker and reports buses', async () => {
    const { poller, fetchFleet, tracker, onBuses } = setup();
    poller.setFocused(true);
    await flush();
    expect(fetchFleet).toHaveBeenCalledWith('19');
    expect(tracker.update).toHaveBeenCalledWith([{ gid: 1 }], 1000);
    expect(onBuses).toHaveBeenLastCalledWith([{ id: 'b1' }]);
  });

  it('keeps polling every interval while focused', async () => {
    const { poller, fetchFleet } = setup();
    poller.setFocused(true);
    await flush();
    await vi.advanceTimersByTimeAsync(BUS_POLL_INTERVAL_MS);
    expect(fetchFleet).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(BUS_POLL_INTERVAL_MS);
    expect(fetchFleet).toHaveBeenCalledTimes(3);
  });

  it('stops immediately on unfocus, clears the markers and resets the tracker', async () => {
    const { poller, fetchFleet, tracker, onBuses } = setup();
    poller.setFocused(true);
    await flush();
    poller.setFocused(false);
    expect(onBuses).toHaveBeenLastCalledWith([]);
    expect(tracker.reset).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(120000);
    expect(fetchFleet).toHaveBeenCalledTimes(1);
    expect(poller.isPolling()).toBe(false);
  });

  it('ignores a response that lands after unfocus', async () => {
    let resolve;
    const fetchFleet = vi.fn(() => new Promise((r) => { resolve = r; }));
    const { poller, onBuses, tracker } = setup({ fetchFleet });
    poller.setFocused(true);
    poller.setFocused(false);
    onBuses.mockClear();
    resolve([{ gid: 9 }]);
    await flush();
    expect(tracker.update).not.toHaveBeenCalled();
    expect(onBuses).not.toHaveBeenCalled();
  });

  it('does not poll while the document is hidden and resumes immediately when visible', async () => {
    const { poller, doc, fetchFleet } = setup();
    poller.setFocused(true);
    await flush();
    doc.setHidden(true);
    await vi.advanceTimersByTimeAsync(120000);
    expect(fetchFleet).toHaveBeenCalledTimes(1);
    doc.setHidden(false);
    await flush();
    expect(fetchFleet).toHaveBeenCalledTimes(2);
  });

  it('does not start when focused while the document is hidden', async () => {
    const { poller, doc, fetchFleet } = setup();
    doc.hidden = true;
    poller.setFocused(true);
    await vi.advanceTimersByTimeAsync(60000);
    expect(fetchFleet).not.toHaveBeenCalled();
  });

  it('pauses when the native app goes to the background', async () => {
    const { poller, fetchFleet } = setup();
    poller.setFocused(true);
    await flush();
    poller.setForeground(false);
    await vi.advanceTimersByTimeAsync(120000);
    expect(fetchFleet).toHaveBeenCalledTimes(1);
    poller.setForeground(true);
    await flush();
    expect(fetchFleet).toHaveBeenCalledTimes(2);
  });

  it('never double-polls on repeated setFocused(true)', async () => {
    const { poller, fetchFleet } = setup();
    poller.setFocused(true);
    poller.setFocused(true);
    await flush();
    expect(fetchFleet).toHaveBeenCalledTimes(1);
  });

  it('a failed fetch is survived and retried on the next interval', async () => {
    const fetchFleet = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValue([{ gid: 2 }]);
    const { poller, onBuses } = setup({ fetchFleet });
    poller.setFocused(true);
    await flush();
    await vi.advanceTimersByTimeAsync(BUS_POLL_INTERVAL_MS);
    expect(onBuses).toHaveBeenLastCalledWith([{ id: 'b2' }]);
  });

  it('destroy stops everything and removes the listener', async () => {
    const { poller, doc, fetchFleet } = setup();
    poller.setFocused(true);
    await flush();
    poller.destroy();
    expect(doc.count()).toBe(0);
    await vi.advanceTimersByTimeAsync(120000);
    expect(fetchFleet).toHaveBeenCalledTimes(1);
  });

  it('reports a good response after the buses, and an error on a failed fetch', async () => {
    const fetchFleet = vi.fn().mockRejectedValueOnce(new Error('refused')).mockResolvedValue([]);
    const { poller, onResponse, onError } = setup({ fetchFleet });
    poller.setFocused(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onResponse).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(BUS_POLL_INTERVAL_MS);
    expect(onResponse).toHaveBeenCalledTimes(1);
  });
});
