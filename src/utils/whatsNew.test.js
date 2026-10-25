import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  WHATS_NEW_STORAGE_KEY,
  hasSeenWhatsNew,
  markWhatsNewSeen,
} from './whatsNew';

describe('whatsNew storage utility', () => {
  let mockStore;
  let mockStorage;

  beforeEach(() => {
    mockStore = {};
    mockStorage = {
      getItem: vi.fn((key) => mockStore[key] ?? null),
      setItem: vi.fn((key, value) => {
        mockStore[key] = String(value);
      }),
    };
  });

  it('returns false when storage is empty', () => {
    expect(hasSeenWhatsNew(mockStorage)).toBe(false);
  });

  it('marks whats new as seen and returns true on subsequent checks', () => {
    markWhatsNewSeen(mockStorage);
    expect(mockStorage.setItem).toHaveBeenCalledWith(WHATS_NEW_STORAGE_KEY, '1');
    expect(hasSeenWhatsNew(mockStorage)).toBe(true);
  });

  it('handles null or throwing storage gracefully', () => {
    expect(hasSeenWhatsNew(null)).toBe(false);
    expect(() => markWhatsNewSeen(null)).not.toThrow();

    const throwingStorage = {
      getItem: () => {
        throw new Error('Access denied');
      },
      setItem: () => {
        throw new Error('Quota exceeded');
      },
    };
    expect(hasSeenWhatsNew(throwingStorage)).toBe(false);
    expect(() => markWhatsNewSeen(throwingStorage)).not.toThrow();
  });
});
