import { describe, it, expect, vi } from 'vitest';
import { initialTheme, watchSystemTheme } from './systemTheme';

const fakeMedia = (matches) => {
  const listeners = new Set();
  const mql = {
    matches,
    addEventListener: (_, fn) => listeners.add(fn),
    removeEventListener: (_, fn) => listeners.delete(fn),
  };
  return { mm: () => mql, emit: (m) => listeners.forEach((fn) => fn({ matches: m })), listeners };
};

describe('initialTheme', () => {
  it('stays dark off Android whatever the system says', () => {
    expect(initialTheme(false, fakeMedia(false).mm)).toBe('dark');
  });
  it('follows the system on Android', () => {
    expect(initialTheme(true, fakeMedia(false).mm)).toBe('light');
    expect(initialTheme(true, fakeMedia(true).mm)).toBe('dark');
  });
  it('falls back to dark without matchMedia', () => {
    expect(initialTheme(true, null)).toBe('dark');
  });
});

describe('watchSystemTheme', () => {
  it('reports changes and unsubscribes', () => {
    const m = fakeMedia(true);
    const cb = vi.fn();
    const off = watchSystemTheme(cb, m.mm);
    m.emit(false);
    expect(cb).toHaveBeenCalledWith('light');
    off();
    expect(m.listeners.size).toBe(0);
  });
});
