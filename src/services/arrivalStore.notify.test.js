import { describe, it, expect, vi, afterEach } from 'vitest';
import { arrivalStore } from './arrivalStore';

describe('arrivalStore notification coalescing', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('turns a burst of answers within one frame into one subscribe callback', () => {
    let frame = null;
    vi.stubGlobal('requestAnimationFrame', (cb) => { frame = cb; return 1; });
    const listener = vi.fn();
    const unsubscribe = arrivalStore.subscribe(listener);

    for (let i = 0; i < 5; i++) arrivalStore.notify();
    expect(listener).not.toHaveBeenCalled();

    frame();
    expect(listener).toHaveBeenCalledTimes(1);

    // The next burst gets its own notification.
    arrivalStore.notify();
    frame();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('still notifies, once, where there is no requestAnimationFrame', async () => {
    vi.stubGlobal('requestAnimationFrame', undefined);
    const listener = vi.fn();
    const unsubscribe = arrivalStore.subscribe(listener);

    arrivalStore.notify();
    arrivalStore.notify();
    arrivalStore.notify();
    await new Promise((r) => setTimeout(r, 0));

    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});
