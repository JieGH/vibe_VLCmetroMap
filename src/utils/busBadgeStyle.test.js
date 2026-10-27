import { describe, it, expect } from 'vitest';
import { busBadgeBox, busBadgePadX } from './busBadgeStyle';

describe('busBadgeBox (#121: bus line badges are squarer, no line is above 99)', () => {
  it('is never wider than tall for a 1-digit line, so the minimum box is a square', () => {
    for (const h of [14, 18, 20, 24, 28, 30]) {
      expect(busBadgeBox(h).minWidth).toBe(h);
      expect(busBadgeBox(h).height).toBe(h);
    }
  });

  it('keeps only a hairline of horizontal padding (well under the old 4.5-8px)', () => {
    for (const h of [14, 18, 20, 24, 28, 30]) {
      expect(busBadgePadX(h)).toBeGreaterThanOrEqual(2);
      expect(busBadgePadX(h)).toBeLessThanOrEqual(4);
    }
    expect(busBadgeBox(24).padding).toBe('0 3px');
  });

  it('uses min-width, never a fixed width, so a 2-digit line (99) grows instead of clipping', () => {
    expect(busBadgeBox(18)).not.toHaveProperty('width');
  });
});
