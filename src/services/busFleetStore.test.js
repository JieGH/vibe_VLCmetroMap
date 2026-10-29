import { describe, it, expect, vi } from 'vitest';
import { createBusFleetStore } from './busFleetStore';

function fakePoller() {
  const p = { handlers: null, focused: [], foreground: [], destroyed: false };
  p.factory = (opts) => {
    p.handlers = opts;
    return { setFocused: (v) => p.focused.push(v), setForeground: (v) => p.foreground.push(v), destroy: () => { p.destroyed = true; } };
  };
  return p;
}
const tracker = (fn = () => null) => ({ nearestApproaching: vi.fn(fn), update: vi.fn(), reset: vi.fn() });

describe('busFleetStore', () => {
  it('creates the poller only on first use (nothing starts at import)', () => {
    const p = fakePoller();
    const factory = vi.fn(p.factory);
    const store = createBusFleetStore({ createPoller: factory, tracker: tracker() });
    expect(factory).not.toHaveBeenCalled();
    store.setFocused(true);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(p.focused).toEqual([true]);
  });

  it('shares one poller and tracker between every subscriber', () => {
    const p = fakePoller();
    const tr = tracker();
    const store = createBusFleetStore({ createPoller: p.factory, tracker: tr });
    const a = vi.fn();
    const b = vi.fn();
    store.subscribe(a);
    store.subscribe(b);
    store.setFocused(true);
    expect(p.handlers.tracker).toBe(tr);
    p.handlers.onBuses([{ id: 'bus-1' }]);
    expect(a).toHaveBeenCalledWith([{ id: 'bus-1' }]);
    expect(b).toHaveBeenCalledWith([{ id: 'bus-1' }]);
    expect(store.getBuses()).toEqual([{ id: 'bus-1' }]);
  });

  it('replays the current buses to a late subscriber, and unsubscribe stops delivery', () => {
    const p = fakePoller();
    const store = createBusFleetStore({ createPoller: p.factory, tracker: tracker() });
    store.setFocused(true);
    p.handlers.onBuses([{ id: 'bus-1' }]);
    const late = vi.fn();
    const off = store.subscribe(late);
    expect(late).toHaveBeenCalledWith([{ id: 'bus-1' }]);
    off();
    p.handlers.onBuses([]);
    expect(late).toHaveBeenCalledTimes(1);
  });

  it('nearestApproaching asks the tracker and is null before the poller exists', () => {
    const tr = tracker(() => ({ stopsAway: 3 }));
    const store = createBusFleetStore({ createPoller: fakePoller().factory, tracker: tr });
    expect(store.nearestApproaching('18')).toEqual({ stopsAway: 3 });
    expect(tr.nearestApproaching).toHaveBeenCalledWith('18', expect.any(Number), null);
    store.nearestApproaching('18', 'to-nord');
    expect(tr.nearestApproaching).toHaveBeenLastCalledWith('18', expect.any(Number), 'to-nord');
  });

  it('forwards foreground changes', () => {
    const p = fakePoller();
    const store = createBusFleetStore({ createPoller: p.factory, tracker: tracker() });
    store.setForeground(false);
    expect(p.foreground).toEqual([false]);
  });

  describe('empty state (issue: quiet note when no line 19 buses)', () => {
    const live = () => {
      const p = fakePoller();
      const store = createBusFleetStore({ createPoller: p.factory, tracker: tracker(), now: () => 5000 });
      store.setFocused(true);
      return { p, store };
    };
    it('is silent before the first response', () => {
      const { store } = live();
      expect(store.getStatus()).toEqual({ lastResponseAt: null, error: false, empty: false });
    });
    it('is empty once a response arrived with zero buses (or all hidden as stale)', () => {
      const { p, store } = live();
      p.handlers.onBuses([]);
      p.handlers.onResponse();
      expect(store.getStatus()).toEqual({ lastResponseAt: 5000, error: false, empty: true });
    });
    it('is not empty while a bus is tracked', () => {
      const { p, store } = live();
      p.handlers.onBuses([{ id: 'bus-1' }]);
      p.handlers.onResponse();
      expect(store.getStatus().empty).toBe(false);
    });
    it('stays silent after an error, and recovers on the next good response', () => {
      const { p, store } = live();
      p.handlers.onBuses([]);
      p.handlers.onResponse();
      p.handlers.onError();
      expect(store.getStatus()).toMatchObject({ error: true, empty: false });
      p.handlers.onResponse();
      expect(store.getStatus()).toMatchObject({ error: false, empty: true });
    });
    it('resets on blur so the next focus starts silent', () => {
      const { p, store } = live();
      p.handlers.onResponse();
      store.setFocused(false);
      expect(store.getStatus()).toEqual({ lastResponseAt: null, error: false, empty: false });
    });
    it('notifies status subscribers only when something changes', () => {
      const { p, store } = live();
      const fn = vi.fn();
      const off = store.subscribeStatus(fn);
      p.handlers.onResponse();
      expect(fn).toHaveBeenLastCalledWith(expect.objectContaining({ empty: true }));
      off();
      p.handlers.onError();
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('next bus claim (the bus the board row refers to)', () => {
    it('exposes the claimed bus and clears it when the claim is released', () => {
      const store = createBusFleetStore({ createPoller: fakePoller().factory, tracker: tracker() });
      const fn = vi.fn();
      store.subscribeNextBus(fn);
      store.setNextBus('row-a', { busId: 'bus-2', stopsAway: 3 });
      expect(store.getNextBus()).toEqual({ busId: 'bus-2', stopsAway: 3 });
      store.setNextBus('row-a', null);
      expect(store.getNextBus()).toBeNull();
      expect(fn).toHaveBeenCalledTimes(2);
    });
    it('the latest claim wins and a released older claim does not clear it', () => {
      const store = createBusFleetStore({ createPoller: fakePoller().factory, tracker: tracker() });
      store.setNextBus('a', { busId: 'bus-1', stopsAway: 1 });
      store.setNextBus('b', { busId: 'bus-2', stopsAway: 2 });
      store.setNextBus('a', null);
      expect(store.getNextBus()).toEqual({ busId: 'bus-2', stopsAway: 2 });
    });
    it('ignores identical re-claims (no notification churn)', () => {
      const store = createBusFleetStore({ createPoller: fakePoller().factory, tracker: tracker() });
      const fn = vi.fn();
      store.subscribeNextBus(fn);
      store.setNextBus('a', { busId: 'bus-1', stopsAway: 1 });
      store.setNextBus('a', { busId: 'bus-1', stopsAway: 1 });
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });
});
