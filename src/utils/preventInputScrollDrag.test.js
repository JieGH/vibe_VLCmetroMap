import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isTargetScrollable,
  shouldPreventTouchDrag,
  setupInputScrollDragPrevention,
} from './preventInputScrollDrag';

describe('preventInputScrollDrag', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('isTargetScrollable', () => {
    it('returns true if the target is an INPUT or TEXTAREA', () => {
      const input = { tagName: 'INPUT' };
      const textarea = { tagName: 'TEXTAREA' };
      expect(isTargetScrollable(input)).toBe(true);
      expect(isTargetScrollable(textarea)).toBe(true);
    });

    it('returns true if element has data-scrollable="true"', () => {
      const scrollableDiv = {
        dataset: { scrollable: 'true' },
        parentElement: null,
      };
      expect(isTargetScrollable(scrollableDiv)).toBe(true);

      const child = {
        dataset: {},
        parentElement: {
          dataset: { scrollable: 'true' },
          parentElement: null,
        },
      };
      expect(isTargetScrollable(child)).toBe(true);
    });

    it('returns true if element has overflow-y auto/scroll and scrollHeight > clientHeight', () => {
      const scrollableDiv = {
        scrollHeight: 300,
        clientHeight: 150,
        parentElement: null,
      };
      const mockWindow = {
        getComputedStyle: () => ({ overflowY: 'auto' }),
      };
      expect(isTargetScrollable(scrollableDiv, mockWindow)).toBe(true);
    });

    it('returns false for non-scrollable UI elements (e.g. map canvas, header, backdrop)', () => {
      const canvas = {
        scrollHeight: 100,
        clientHeight: 100,
        parentElement: null,
      };
      const mockWindow = {
        getComputedStyle: () => ({ overflowY: 'visible' }),
      };
      expect(isTargetScrollable(canvas, mockWindow)).toBe(false);
      expect(isTargetScrollable(null)).toBe(false);
    });
  });

  describe('shouldPreventTouchDrag', () => {
    it('returns false if activeElement is not an editable input or textarea', () => {
      const activeBody = { tagName: 'BODY' };
      const nonScrollable = {
        scrollHeight: 100,
        clientHeight: 100,
        parentElement: null,
      };
      expect(shouldPreventTouchDrag(nonScrollable, activeBody)).toBe(false);
    });

    it('returns true when activeElement is INPUT and user drags non-scrollable UI', () => {
      const activeInput = { tagName: 'INPUT' };
      const mapCanvas = {
        scrollHeight: 500,
        clientHeight: 500,
        parentElement: null,
      };
      const mockWindow = {
        getComputedStyle: () => ({ overflowY: 'hidden' }),
      };
      expect(shouldPreventTouchDrag(mapCanvas, activeInput, mockWindow)).toBe(true);
    });

    it('returns false when activeElement is INPUT but touch is on scrollable container', () => {
      const activeInput = { tagName: 'INPUT' };
      const searchItem = {
        scrollHeight: 400,
        clientHeight: 200,
        parentElement: null,
      };
      const mockWindow = {
        getComputedStyle: () => ({ overflowY: 'auto' }),
      };
      expect(shouldPreventTouchDrag(searchItem, activeInput, mockWindow)).toBe(false);
    });

    it('returns false when activeElement is TEXTAREA but touch is on textarea itself', () => {
      const activeTextarea = { tagName: 'TEXTAREA' };
      expect(shouldPreventTouchDrag(activeTextarea, activeTextarea)).toBe(false);
    });
  });

  describe('setupInputScrollDragPrevention', () => {
    it('dynamically registers touchmove on focusin of an input and cleans up on focusout', () => {
      const listeners = new Map();
      const mockWin = {
        addEventListener: vi.fn((event, fn) => listeners.set(event, fn)),
        removeEventListener: vi.fn((event) => listeners.delete(event)),
        document: { activeElement: null },
      };

      const cleanup = setupInputScrollDragPrevention(mockWin);

      // Initially, when no input is focused, no touchmove listener is attached (preserving compositor performance)
      expect(mockWin.addEventListener).toHaveBeenCalledWith('focusin', expect.any(Function));
      expect(mockWin.addEventListener).toHaveBeenCalledWith('focusout', expect.any(Function));
      expect(mockWin.addEventListener).not.toHaveBeenCalledWith('touchmove', expect.any(Function), expect.anything());

      // Focus an input element
      const focusinHandler = listeners.get('focusin');
      mockWin.document.activeElement = { tagName: 'INPUT' };
      focusinHandler({ target: mockWin.document.activeElement });

      expect(mockWin.addEventListener).toHaveBeenCalledWith(
        'touchmove',
        expect.any(Function),
        { passive: false }
      );

      // Unfocus (focusout)
      const focusoutHandler = listeners.get('focusout');
      mockWin.document.activeElement = { tagName: 'BODY' };
      focusoutHandler();
      vi.runAllTimers();

      expect(mockWin.removeEventListener).toHaveBeenCalledWith(
        'touchmove',
        expect.any(Function),
        { passive: false }
      );

      cleanup();
    });

    it('calls preventDefault when dragging non-scrollable UI while input is focused', () => {
      const listeners = new Map();
      const mockWin = {
        addEventListener: vi.fn((event, fn) => listeners.set(event, fn)),
        removeEventListener: vi.fn((event) => listeners.delete(event)),
        scrollTo: vi.fn(),
        document: {
          activeElement: { tagName: 'INPUT' },
        },
        getComputedStyle: () => ({ overflowY: 'hidden' }),
      };

      const cleanup = setupInputScrollDragPrevention(mockWin);
      // Since activeElement is already an input, touchmove was registered
      const touchMoveHandler = listeners.get('touchmove');
      expect(touchMoveHandler).toBeDefined();

      const nonScrollable = {
        scrollHeight: 100,
        clientHeight: 100,
        parentElement: null,
      };

      const mockEvent = {
        target: nonScrollable,
        preventDefault: vi.fn(),
      };

      touchMoveHandler(mockEvent);
      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(mockWin.scrollTo).toHaveBeenCalledWith(0, 0);

      cleanup();
    });

    it('does not call preventDefault when touching scrollable container while input is focused', () => {
      const listeners = new Map();
      const mockWin = {
        addEventListener: vi.fn((event, fn) => listeners.set(event, fn)),
        removeEventListener: vi.fn((event) => listeners.delete(event)),
        scrollTo: vi.fn(),
        document: {
          activeElement: { tagName: 'INPUT' },
        },
        getComputedStyle: () => ({ overflowY: 'auto' }),
      };

      const cleanup = setupInputScrollDragPrevention(mockWin);
      const touchMoveHandler = listeners.get('touchmove');

      const scrollableSearch = {
        scrollHeight: 300,
        clientHeight: 150,
        parentElement: null,
      };

      const mockEvent = {
        target: scrollableSearch,
        preventDefault: vi.fn(),
      };

      touchMoveHandler(mockEvent);
      expect(mockEvent.preventDefault).not.toHaveBeenCalled();

      cleanup();
    });
  });
});
