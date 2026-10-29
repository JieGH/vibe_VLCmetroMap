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
    expect(tr.nearestApproaching).toHaveBeenCalledWith('18', expect.any(Number));
  });

  it('forwards foreground changes', () => {
    const p = fakePoller();
    const store = createBusFleetStore({ createPoller: p.factory, tracker: tracker() });
    store.setForeground(false);
    expect(p.foreground).toEqual([false]);
  });
});
