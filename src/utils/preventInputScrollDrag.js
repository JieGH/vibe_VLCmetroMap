import { isEditableElement } from './useDragToDismiss';

/**
 * Checks if a DOM target or any of its ancestors is an actively scrollable container
 * or an editable text element.
 *
 * @param {any} target
 * @param {any} [win]
 * @returns {boolean}
 */
export const isTargetScrollable = (target, win = typeof window !== 'undefined' ? window : null) => {
  if (!target || typeof target !== 'object') return false;

  // An input or textarea itself can be scrolled or navigated with cursor
  if (isEditableElement(target)) {
    return true;
  }

  const doc = win?.document || (typeof document !== 'undefined' ? document : null);
  const body = doc?.body || null;
  const docEl = doc?.documentElement || null;

  let el = target;
  while (el && el !== body && el !== docEl) {
    if (el.dataset?.scrollable === 'true') {
      return true;
    }

    if (win && typeof win.getComputedStyle === 'function') {
      try {
        const style = win.getComputedStyle(el);
        const overflowY = style?.overflowY;
        if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
          return true;
        }
      } catch {
        // Fallback for non-element objects or mock environments
      }
    }

    el = el.parentElement;
  }

  return false;
};

/**
 * Determines whether a touchmove gesture should be prevented to stop the browser User Agent
 * from dragging or panning the UI viewport while the user is actively editing text.
 *
 * @param {any} target
 * @param {any} activeElement
 * @param {any} [win]
 * @returns {boolean}
 */
export const shouldPreventTouchDrag = (
  target,
  activeElement = (typeof document !== 'undefined' ? document.activeElement : null),
  win = (typeof window !== 'undefined' ? window : null)
) => {
  if (!isEditableElement(activeElement)) {
    return false;
  }

  // If the touch target is inside a scrollable container (e.g. search suggestions or feedback body), allow scrolling.
  if (isTargetScrollable(target, win)) {
    return false;
  }

  // Any drag on non-scrollable UI while editing text should be prevented.
  return true;
};

/**
 * Dynamically binds a { passive: false } touchmove listener on the window only when an input or
 * textarea has active focus, preserving threaded compositor scrolling when editing is inactive.
 *
 * @param {any} [targetWindow]
 * @returns {() => void} Cleanup function
 */
export const setupInputScrollDragPrevention = (targetWindow = typeof window !== 'undefined' ? window : null) => {
  const win = targetWindow;
  if (!win || typeof win.addEventListener !== 'function') return () => {};

  let isTouchMoveBound = false;

  const handleTouchMove = (e) => {
    const activeEl = win.document?.activeElement || (typeof document !== 'undefined' ? document.activeElement : null);
    if (shouldPreventTouchDrag(e?.target, activeEl, win)) {
      if (typeof e?.preventDefault === 'function') {
        e.preventDefault();
      }
      if (typeof win.scrollTo === 'function') {
        win.scrollTo(0, 0);
      }
    }
  };

  const bindTouchMove = () => {
    if (!isTouchMoveBound) {
      win.addEventListener('touchmove', handleTouchMove, { passive: false });
      isTouchMoveBound = true;
    }
  };

  const unbindTouchMove = () => {
    if (isTouchMoveBound) {
      win.removeEventListener('touchmove', handleTouchMove, { passive: false });
      isTouchMoveBound = false;
    }
  };

  const handleFocusIn = (e) => {
    if (isEditableElement(e?.target)) {
      bindTouchMove();
    }
  };

  const handleFocusOut = () => {
    // Check if new active element is also editable after tick
    setTimeout(() => {
      const active = win.document?.activeElement || (typeof document !== 'undefined' ? document.activeElement : null);
      if (!isEditableElement(active)) {
        unbindTouchMove();
      }
    }, 0);
  };

  win.addEventListener('focusin', handleFocusIn);
  win.addEventListener('focusout', handleFocusOut);

  // If mounted while an input is already focused
  const initialActive = win.document?.activeElement || (typeof document !== 'undefined' ? document.activeElement : null);
  if (isEditableElement(initialActive)) {
    bindTouchMove();
  }

  return () => {
    win.removeEventListener('focusin', handleFocusIn);
    win.removeEventListener('focusout', handleFocusOut);
    unbindTouchMove();
  };
};

export default setupInputScrollDragPrevention;
