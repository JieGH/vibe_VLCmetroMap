import { describe, it, expect } from 'vitest';
import {
  calculateDragOffset,
  shouldDismissOnRelease,
  getDragCardStyle,
} from './useDragToDismiss';

describe('useDragToDismiss helpers', () => {
  describe('calculateDragOffset', () => {
    it('returns 0 when startY and currentY are equal', () => {
      expect(calculateDragOffset(100, 100)).toBe(0);
    });

    it('calculates downward drag distance in pixels', () => {
      expect(calculateDragOffset(100, 160)).toBe(60);
      expect(calculateDragOffset(50, 125)).toBe(75);
    });

    it('clamps upward dragging to 0', () => {
      expect(calculateDragOffset(100, 80)).toBe(0);
      expect(calculateDragOffset(200, 50)).toBe(0);
    });

    it('handles non-numeric inputs gracefully', () => {
      expect(calculateDragOffset(null, 100)).toBe(0);
      expect(calculateDragOffset(100, undefined)).toBe(0);
    });
  });

  describe('shouldDismissOnRelease', () => {
    it('returns true when offset meets or exceeds threshold', () => {
      expect(shouldDismissOnRelease(70, 70)).toBe(true);
      expect(shouldDismissOnRelease(71, 70)).toBe(true);
      expect(shouldDismissOnRelease(120, 70)).toBe(true);
    });

    it('returns false when offset is below threshold', () => {
      expect(shouldDismissOnRelease(69, 70)).toBe(false);
      expect(shouldDismissOnRelease(0, 70)).toBe(false);
      expect(shouldDismissOnRelease(-10, 70)).toBe(false);
    });

    it('uses default threshold of 70px if unspecified', () => {
      expect(shouldDismissOnRelease(70)).toBe(true);
      expect(shouldDismissOnRelease(69)).toBe(false);
    });
  });

  describe('getDragCardStyle', () => {
    it('returns undefined transform when offset is 0', () => {
      const style = getDragCardStyle(0, false);
      expect(style.transform).toBeUndefined();
      expect(style.transition).toBe('transform 0.25s cubic-bezier(0.2, 0.9, 0.3, 1)');
    });

    it('returns translateY transform when offset is positive', () => {
      const style = getDragCardStyle(45, true);
      expect(style.transform).toBe('translateY(45px)');
      expect(style.transition).toBe('none');
    });

    it('applies smooth transition when not dragging', () => {
      const style = getDragCardStyle(0, false);
      expect(style.transition).toContain('0.25s');
    });
  });
});
