import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import {
  isInsideScrollRegion,
  calculateDragOffset,
  shouldDismissOnRelease,
  shouldExpandOnRelease,
  getDragCardStyle,
  isEditableElement,
  shouldIgnoreDragStart,
  useDragToDismiss,
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

    it('clamps upward dragging to 0 when allowUpward is not enabled', () => {
      expect(calculateDragOffset(100, 80)).toBe(0);
      expect(calculateDragOffset(200, 50)).toBe(0);
    });

    it('calculates upward drag distance (negative offset) when allowUpward is true', () => {
      expect(calculateDragOffset(100, 80, true)).toBe(-20);
      expect(calculateDragOffset(100, 30, { allowUpward: true })).toBe(-70);
    });

    it('clamps upward dragging to 0 when already expanded', () => {
      expect(calculateDragOffset(100, 80, { allowUpward: true, isExpanded: true })).toBe(0);
      expect(calculateDragOffset(100, 160, { allowUpward: true, isExpanded: true })).toBe(60);
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

  describe('shouldExpandOnRelease', () => {
    it('returns true when negative offset meets or exceeds threshold', () => {
      expect(shouldExpandOnRelease(-70, 70)).toBe(true);
      expect(shouldExpandOnRelease(-71, 70)).toBe(true);
      expect(shouldExpandOnRelease(-120, 70)).toBe(true);
    });

    it('returns false when negative offset is below threshold', () => {
      expect(shouldExpandOnRelease(-69, 70)).toBe(false);
      expect(shouldExpandOnRelease(0, 70)).toBe(false);
      expect(shouldExpandOnRelease(10, 70)).toBe(false);
    });

    it('uses default threshold of 70px if unspecified', () => {
      expect(shouldExpandOnRelease(-70)).toBe(true);
      expect(shouldExpandOnRelease(-69)).toBe(false);
    });
  });

  describe('getDragCardStyle', () => {
    it('returns undefined transform when offset is 0', () => {
      const style = getDragCardStyle(0, false);
      expect(style.transform).toBeUndefined();
      expect(style.transition).toBe('transform 0.36s cubic-bezier(0.32, 0.72, 0, 1)');
    });

    it('returns translateY transform when offset is positive', () => {
      const style = getDragCardStyle(45, true);
      expect(style.transform).toBe('translateY(45px)');
      expect(style.transition).toBe('none');
    });

    it('returns negative translateY transform when offset is negative (upward drag)', () => {
      const style = getDragCardStyle(-50, true);
      expect(style.transform).toBe('translateY(-50px)');
      expect(style.transition).toBe('none');
    });

    it('returns height and maxHeight when isDraggingUp with dragHeight', () => {
      const style = getDragCardStyle(-50, true, { dragHeight: 370, isDraggingUp: true });
      expect(style.height).toBe('370px');
      expect(style.maxHeight).toBe('370px');
      expect(style.transform).toBeUndefined();
      expect(style.transition).toBe('none');
    });

    it('returns height and maxHeight when isReducing with dragHeight', () => {
      const style = getDragCardStyle(60, true, { dragHeight: 480, isReducing: true });
      expect(style.height).toBe('480px');
      expect(style.maxHeight).toBe('480px');
      expect(style.transform).toBeUndefined();
      expect(style.transition).toBe('none');
    });

    it('never returns translateY when isExpanded is true to prevent layout shaking', () => {
      const styleDragging = getDragCardStyle(40, true, { isExpanded: true });
      expect(styleDragging.transform).toBeUndefined();
      expect(styleDragging.transition).toBe('none');

      const styleResting = getDragCardStyle(0, false, { isExpanded: true });
      expect(styleResting.transform).toBeUndefined();
      expect(styleResting.transition).toContain('max-height');
    });

    it('returns accelerating downward transform when isDismissing in portrait', () => {
      const style = getDragCardStyle(0, false, { isDismissing: true });
      expect(style.transform).toContain('translateY');
      expect(style.transition).toContain('0.28s cubic-bezier(0.32, 0, 0.67, 0)');
      expect(style.opacity).toBe(0);
      expect(style.pointerEvents).toBe('none');
    });

    it('returns accelerating rightward transform when isDismissing in landscape', () => {
      const style = getDragCardStyle(0, false, { isDismissing: true, landscape: true });
      expect(style.transform).toContain('translateX');
      expect(style.transition).toContain('0.28s cubic-bezier(0.32, 0, 0.67, 0)');
    });

    it('applies smooth transition when not dragging', () => {
      const style = getDragCardStyle(0, false);
      expect(style.transition).toContain('0.36s');
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

 describe('card drag scroll boundaries', () => {
  const readStyle = (node) => node.style || {};
  it('excludes both independent lists and horizontal scrolling even at their edges', () => {
    const card = {};
    for (const style of [{ overflowY: 'auto' }, { overflowX: 'auto' }, { overflowY: 'scroll' }]) {
      const list = { parentElement: card, style, scrollWidth: 200, clientWidth: 100 };
      const row = { parentElement: list };
      expect(isInsideScrollRegion(row, card, readStyle)).toBe(true);
    }
  });
  it('allows blank card padding and non-scrollable wrappers', () => {
    const card = { style: { overflowY: 'auto' } };
    const wrapper = { parentElement: card, style: { overflowY: 'hidden' } };
    expect(isInsideScrollRegion(wrapper, card, readStyle)).toBe(false);
    expect(isInsideScrollRegion(card, card, readStyle)).toBe(false);
  });
  it('allows dragging in vertical scroll containers when content fits without scrolling', () => {
    const card = {};
    const nonOverflowingList = { parentElement: card, style: { overflowY: 'auto' }, scrollHeight: 200, clientHeight: 400 };
    const row = { parentElement: nonOverflowingList };
    expect(isInsideScrollRegion(row, card, readStyle)).toBe(false);
  });
  it('allows dragging on explicit data-drag-surface elements inside scroll containers', () => {
    const card = {};
    const list = { parentElement: card, style: { overflowY: 'auto' }, scrollHeight: 800, clientHeight: 400 };
    const header = { parentElement: list, closest: (sel) => sel === '[data-drag-surface="true"]' ? {} : null };
    expect(isInsideScrollRegion(header, card, readStyle)).toBe(false);
  });
});

it('allows header strip gaps when horizontal chips fit without scrolling', () => {
  const card = {};
  const strip = { parentElement: card, scrollWidth: 200, clientWidth: 200 };
  expect(isInsideScrollRegion(strip, card, () => ({ overflowX: 'auto', overflowY: 'hidden' }))).toBe(false);
});

describe('useDragToDismiss gesture lifecycle', () => {
  const mountHook = (options) => {
    let hookResult;
    function Component({ onMount }) {
      const res = useDragToDismiss(options);
      onMount(res);
      return React.createElement('div', res.handleProps);
    }
    renderToStaticMarkup(React.createElement(Component, { onMount: (res) => { hookResult = res; } }));
    return hookResult;
  };

  it('handles tap (pointerDown followed by pointerUp or pointerCancel without pointerMove) without throwing or wedging future drags', () => {
    const onExpand = vi.fn();
    const hook = mountHook({ onExpand, threshold: 70 });

    // Tap without moving
    expect(() => {
      hook.handleProps.onPointerDown({ clientY: 200, target: {}, currentTarget: {} });
      hook.handleProps.onPointerUp({ clientY: 200, currentTarget: {} });
    }).not.toThrow();

    // PointerCancel without moving
    expect(() => {
      hook.handleProps.onPointerDown({ clientY: 200, target: {}, currentTarget: {} });
      hook.handleProps.onPointerCancel();
    }).not.toThrow();

    // Subsequent drag still works cleanly
    hook.handleProps.onPointerDown({ clientY: 200, target: {}, currentTarget: {} });
    hook.handleProps.onPointerMove({ clientY: 120 });
    hook.handleProps.onPointerUp({ clientY: 120, currentTarget: {} });
    expect(onExpand).toHaveBeenCalledTimes(1);
  });

  it('triggers onExpand when dragged up past threshold', () => {
    const onExpand = vi.fn();
    const onDismiss = vi.fn();
    const hook = mountHook({ onExpand, onDismiss, threshold: 70 });

    hook.handleProps.onPointerDown({ clientY: 200, target: {}, currentTarget: {} });
    hook.handleProps.onPointerMove({ clientY: 120 });
    hook.handleProps.onPointerUp({ clientY: 120, currentTarget: {} });

    expect(onExpand).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('does not trigger onExpand when drag distance is less than threshold', () => {
    const onExpand = vi.fn();
    const onDismiss = vi.fn();
    const hook = mountHook({ onExpand, onDismiss, threshold: 70 });

    hook.handleProps.onPointerDown({ clientY: 200, target: {}, currentTarget: {} });
    hook.handleProps.onPointerMove({ clientY: 160 });
    hook.handleProps.onPointerUp({ clientY: 160, currentTarget: {} });

    expect(onExpand).not.toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('triggers onDismiss after dismissal animation when dragged down past threshold (unexpanded)', () => {
    vi.useFakeTimers();
    try {
      const onExpand = vi.fn();
      const onDismiss = vi.fn();
      const hook = mountHook({ onExpand, onDismiss, threshold: 70 });

      hook.handleProps.onPointerDown({ clientY: 200, target: {}, currentTarget: {} });
      hook.handleProps.onPointerMove({ clientY: 280 });
      hook.handleProps.onPointerUp({ clientY: 280, currentTarget: {} });

      // Exit animation is playing (280ms delay)
      expect(onDismiss).not.toHaveBeenCalled();
      vi.advanceTimersByTime(300);
      expect(onDismiss).toHaveBeenCalledTimes(1);
      expect(onExpand).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('triggers onCollapse when dragged down while isExpanded', () => {
    const onCollapse = vi.fn();
    const onDismiss = vi.fn();
    const hook = mountHook({ onCollapse, onDismiss, isExpanded: true, threshold: 70 });

    hook.handleProps.onPointerDown({ clientY: 200, target: {}, currentTarget: {} });
    hook.handleProps.onPointerMove({ clientY: 280 });
    hook.handleProps.onPointerUp({ clientY: 280, currentTarget: {} });

    expect(onCollapse).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('does not drag up or trigger onExpand when already isExpanded', () => {
    const onExpand = vi.fn();
    const hook = mountHook({ onExpand, isExpanded: true, threshold: 70 });

    hook.handleProps.onPointerDown({ clientY: 200, target: {}, currentTarget: {} });
    hook.handleProps.onPointerMove({ clientY: 100 });
    hook.handleProps.onPointerUp({ clientY: 100, currentTarget: {} });

    expect(onExpand).not.toHaveBeenCalled();
  });

  it('does not trigger onExpand mid-drag and commits onExpand on release', () => {
    const onExpand = vi.fn();
    const hook = mountHook({ onExpand, threshold: 70 });

    hook.handleProps.onPointerDown({ clientY: 300, target: {}, currentTarget: {} });
    // Drag slowly past threshold without releasing - should NOT fire mid-drag to avoid flash
    hook.handleProps.onPointerMove({ clientY: 250 }); // -50px
    expect(onExpand).not.toHaveBeenCalled();

    hook.handleProps.onPointerMove({ clientY: 220 }); // -80px (crosses threshold)
    expect(onExpand).not.toHaveBeenCalled();

    // Continue dragging all the way up continuously
    hook.handleProps.onPointerMove({ clientY: 100 }); // -200px
    expect(onExpand).not.toHaveBeenCalled();

    // Release hand: commits expansion cleanly
    hook.handleProps.onPointerUp({ clientY: 100, currentTarget: {} });
    expect(onExpand).toHaveBeenCalledTimes(1);
  });
});
