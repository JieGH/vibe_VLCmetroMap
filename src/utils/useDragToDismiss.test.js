import { describe, it, expect } from 'vitest';
import {
  calculateDragOffset,
  shouldDismissOnRelease,
  getDragCardStyle,
  isEditableElement,
  shouldIgnoreDragStart,
} from './useDragToDismiss';

describe('useDragToDismiss helpers', () => {
  describe('isEditableElement & shouldIgnoreDragStart', () => {
    it('identifies input, textarea, and contenteditable elements as editable', () => {
      expect(isEditableElement({ tagName: 'INPUT' })).toBe(true);
      expect(isEditableElement({ tagName: 'TEXTAREA' })).toBe(true);
      expect(isEditableElement({ tagName: 'DIV', isContentEditable: true })).toBe(true);
      expect(isEditableElement({ tagName: 'DIV', isContentEditable: false })).toBe(false);
      expect(isEditableElement(null)).toBe(false);
      expect(isEditableElement(undefined)).toBe(false);
    });

    it('ignores drag start when activeElement is an editable input or textarea', () => {
      const activeInput = { tagName: 'INPUT' };
      const nonEditableTarget = { tagName: 'DIV', closest: () => null };
      expect(shouldIgnoreDragStart(nonEditableTarget, activeInput)).toBe(true);

      const activeTextarea = { tagName: 'TEXTAREA' };
      expect(shouldIgnoreDragStart(nonEditableTarget, activeTextarea)).toBe(true);
    });

    it('ignores drag start when target is inside an input or textarea', () => {
      const activeNonInput = { tagName: 'BODY' };
      const targetInInput = {
        tagName: 'SPAN',
        closest: (sel) => sel.includes('input') ? { tagName: 'INPUT' } : null,
      };
      expect(shouldIgnoreDragStart(targetInInput, activeNonInput)).toBe(true);
    });

    it('permits drag start when neither target nor active element is editable', () => {
      const activeBody = { tagName: 'BODY' };
      const targetHandle = { tagName: 'DIV', closest: () => null };
      expect(shouldIgnoreDragStart(targetHandle, activeBody)).toBe(false);
    });
  });

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

  describe('createRafCoalescer', () => {
    it('coalesces multiple rapid updates into a single animation frame tick', async () => {
      let rAfCallback = null;
      globalThis.requestAnimationFrame = (cb) => {
        rAfCallback = cb;
        return 123;
      };
      globalThis.cancelAnimationFrame = () => {
        rAfCallback = null;
      };

      const { createRafCoalescer } = await import('./useDragToDismiss');
      const calls = [];
      const coalescer = createRafCoalescer((val) => calls.push(val));

      coalescer.schedule(10);
      coalescer.schedule(20);
      coalescer.schedule(30);

      expect(calls).toEqual([]);
      rAfCallback?.();
      expect(calls).toEqual([30]);

      delete globalThis.requestAnimationFrame;
      delete globalThis.cancelAnimationFrame;
    });

    it('cancels pending frame cleanly', async () => {
      let rAfCallback = null;
      globalThis.requestAnimationFrame = (cb) => {
        rAfCallback = cb;
        return 123;
      };
      globalThis.cancelAnimationFrame = () => {
        rAfCallback = null;
      };

      const { createRafCoalescer } = await import('./useDragToDismiss');
      const calls = [];
      const coalescer = createRafCoalescer((val) => calls.push(val));

      coalescer.schedule(50);
      coalescer.cancel();

      rAfCallback?.();
      expect(calls).toEqual([]);

      delete globalThis.requestAnimationFrame;
      delete globalThis.cancelAnimationFrame;
    });
  });
});
