import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * Coalesces high-frequency updates (e.g. 120Hz/240Hz touch events)
 * to fire at most once per animation frame.
 *
 * @param {(val: any) => void} callback
 * @returns {{ schedule: (val: any) => void, cancel: () => void }}
 */
export const createRafCoalescer = (callback) => {
  let frameId = null;
  let lastValue = null;

  const schedule = (val) => {
    lastValue = val;
    if (frameId === null) {
      if (typeof requestAnimationFrame !== 'undefined') {
        frameId = requestAnimationFrame(() => {
          frameId = null;
          callback(lastValue);
        });
      } else {
        callback(lastValue);
      }
    }
  };

  const cancel = () => {
    if (frameId !== null) {
      if (typeof cancelAnimationFrame !== 'undefined') {
        cancelAnimationFrame(frameId);
      }
      frameId = null;
    }
  };

  return { schedule, cancel };
};

/**
 * Calculates the drag offset in pixels.
 * Upward movements are clamped to 0 unless allowUpward is enabled.
 * If already expanded, upward movements are clamped to 0.
 *
 * @param {number} startY
 * @param {number} currentY
 * @param {boolean|{ allowUpward?: boolean, isExpanded?: boolean }} [options=false]
 * @returns {number}
 */
export const calculateDragOffset = (startY, currentY, options = false) => {
  if (typeof startY !== 'number' || typeof currentY !== 'number') return 0;
  const allowUpward = typeof options === 'boolean' ? options : Boolean(options?.allowUpward);
  const isExpanded = typeof options === 'object' && Boolean(options?.isExpanded);

  const delta = currentY - startY;
  if (!allowUpward) {
    return Math.max(0, delta);
  }
  if (isExpanded && delta < 0) {
    return 0;
  }
  return delta;
};

/**
 * Checks if the drag offset meets or exceeds the dismissal threshold.
 *
 * @param {number} offset
 * @param {number} [threshold=70]
 * @returns {boolean}
 */
export const shouldDismissOnRelease = (offset, threshold = 70) => {
  return typeof offset === 'number' && offset >= threshold;
};

/**
 * Checks if the drag offset meets or exceeds the expansion threshold (upward drag).
 *
 * @param {number} offset
 * @param {number} [threshold=70]
 * @returns {boolean}
 */
export const shouldExpandOnRelease = (offset, threshold = 70) => {
  return typeof offset === 'number' && offset <= -threshold;
};

/**
 * Determines whether a DOM element is editable (input, textarea, or contenteditable).
 *
 * @param {any} el
 * @returns {boolean}
 */
export const isEditableElement = (el) => {
  if (!el || typeof el !== 'object') return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || Boolean(el.isContentEditable);
};

/**
 * Checks whether drag-to-dismiss should be suppressed because the user is
 * interacting with or actively focused inside a text editor.
 *
 * @param {any} target
 * @param {any} [activeElement]
 * @returns {boolean}
 */
export const shouldIgnoreDragStart = (target, activeElement) => {
  if (isEditableElement(activeElement)) return true;
  if (
    target?.isContentEditable ||
    target?.closest?.('input, textarea, select, [contenteditable]')
  ) {
    return true;
  }
  return false;
};

/** Keep gestures inside scroll regions independent when they actually overflow. */
export const isInsideScrollRegion = (
  target,
  card,
  readStyle = typeof getComputedStyle !== 'undefined' ? getComputedStyle : () => ({})
) => {
  if (target?.closest?.('[data-drag-surface="true"]')) return false;
  for (let node = target; node && node !== card; node = node.parentElement) {
    const style = readStyle(node);
    // Vertical lists own the gesture when they overflow vertically (or in synthetic unit tests where scrollHeight is undefined).
    // When a column fits without scrolling (scrollHeight <= clientHeight), its empty space remains draggable.
    if (/(auto|scroll)/.test(style.overflowY) && (node.scrollHeight === undefined || node.scrollHeight > node.clientHeight + 1)) return true;
    if (/(auto|scroll)/.test(style.overflowX) && node.scrollWidth > node.clientWidth) return true;
  }
  return false;
};

/**
 * Computes the inline style for the card during and after a drag interaction.
 *
 * @param {number} dragOffset
 * @param {boolean} isDragging
 * @param {Object} [options={}]
 * @param {number|null} [options.dragHeight]
 * @param {boolean} [options.isDraggingUp]
 * @param {boolean} [options.isReducing]
 * @param {boolean} [options.isDismissing]
 * @param {boolean} [options.landscape]
 * @returns {React.CSSProperties}
 */
export const getDragCardStyle = (dragOffset, isDragging, options = {}) => {
  const { dragHeight, isDraggingUp, isReducing, isDismissing, landscape, isExpanded } = options;

  if (isDismissing) {
    return {
      transform: landscape ? 'translateX(calc(100% + 48px))' : 'translateY(calc(100% + 48px))',
      opacity: 0,
      transition: 'transform 0.28s cubic-bezier(0.32, 0, 0.67, 0), opacity 0.24s cubic-bezier(0.32, 0, 0.67, 0)',
      pointerEvents: 'none',
    };
  }

  if ((isDraggingUp || isReducing) && typeof dragHeight === 'number') {
    return {
      height: `${dragHeight}px`,
      maxHeight: `${dragHeight}px`,
      transform: undefined,
      transition: isDragging
        ? 'none'
        : 'max-height 0.36s cubic-bezier(0.32, 0.72, 0, 1), height 0.36s cubic-bezier(0.32, 0.72, 0, 1)',
    };
  }

  if (isExpanded) {
    return {
      transform: undefined,
      transition: isDragging
        ? 'none'
        : 'max-height 0.36s cubic-bezier(0.32, 0.72, 0, 1), height 0.36s cubic-bezier(0.32, 0.72, 0, 1)',
    };
  }

  if (dragOffset !== 0) {
    return {
      transform: `translateY(${dragOffset}px)`,
      transition: isDragging ? 'none' : 'transform 0.36s cubic-bezier(0.32, 0.72, 0, 1)',
    };
  }

  return {
    transform: undefined,
    transition: isDragging ? 'none' : 'transform 0.36s cubic-bezier(0.32, 0.72, 0, 1)',
  };
};

/**
 * Hook providing drag gesture handling for floating cards and bottom sheets.
 * Supports continuous swipe-down to dismiss (or collapse) and continuous swipe-up to expand.
 *
 * @param {Object} options
 * @param {() => void} [options.onDismiss] - Callback invoked when dragged down past threshold
 * @param {() => void} [options.onExpand] - Callback invoked when dragged up past threshold
 * @param {() => void} [options.onCollapse] - Callback invoked when dragged down past threshold while expanded
 * @param {boolean} [options.isExpanded=false] - Whether card is currently expanded
 * @param {boolean} [options.allowUpward] - Explicitly enable/disable upward dragging (defaults to Boolean(onExpand))
 * @param {boolean} [options.enabled=true] - Whether drag interaction is active (e.g. only in portrait/mobile)
 * @param {boolean} [options.landscape=false] - Whether app is in landscape layout
 * @param {number} [options.threshold=70] - Distance in px needed to trigger action
 * @returns {{
 *   dragOffset: number,
 *   dragHeight: number|null,
 *   isDragging: boolean,
 *   isDraggingUp: boolean,
 *   isReducing: boolean,
 *   isDismissing: boolean,
 *   triggerDismiss: () => void,
 *   handleProps: Object,
 *   cardStyle: React.CSSProperties
 * }}
 */
export const useDragToDismiss = ({
  cardRef,
  onDismiss,
  onExpand,
  onCollapse,
  isExpanded = false,
  allowUpward,
  enabled = true,
  landscape = false,
  threshold = 70,
} = {}) => {
  const [dragState, setDragState] = useState({
    offset: 0,
    height: null,
    isDraggingUp: false,
    isReducing: false,
  });
  const [isDragging, setIsDragging] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);
  const startYRef = useRef(0);
  const startXRef = useRef(0);
  const startHeightRef = useRef(0);
  const pointerIdRef = useRef(null);
  const pendingInteractiveRef = useRef(false);
  const didDragRef = useRef(false);
  const coalescerRef = useRef(null);
  const dismissTimerRef = useRef(null);

  const canDragUp = allowUpward !== undefined ? Boolean(allowUpward) : Boolean(onExpand);

  const getCoalescer = useCallback(() => {
    if (!coalescerRef.current) {
      coalescerRef.current = createRafCoalescer(setDragState);
    }
    return coalescerRef.current;
  }, []);

  const triggerDismiss = useCallback(() => {
    if (isDismissing) return;
    setIsDismissing(true);
    setIsDragging(false);
    pointerIdRef.current = null;
    pendingInteractiveRef.current = false;
    didDragRef.current = false;
    coalescerRef.current?.cancel();
    setDragState({
      offset: 0,
      height: null,
      isDraggingUp: false,
      isReducing: false,
    });

    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    dismissTimerRef.current = setTimeout(() => {
      setIsDismissing(false);
      onDismiss?.();
    }, 280);
  }, [isDismissing, onDismiss]);

  useEffect(() => {
    if (!enabled) {
      setIsDismissing(false);
      setIsDragging(false);
      pointerIdRef.current = null;
      pendingInteractiveRef.current = false;
      didDragRef.current = false;
      coalescerRef.current?.cancel();
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = null;
      }
      setDragState({
        offset: 0,
        height: null,
        isDraggingUp: false,
        isReducing: false,
      });
    }
  }, [enabled]);

  useEffect(() => {
    // Prevent browser panning only after a gesture starts on an eligible surface.
    // Using a native non-passive listener leaves scroll regions fully native.
    const preventPan = (event) => {
      if (pointerIdRef.current !== null && !pendingInteractiveRef.current && event.cancelable) {
        event.preventDefault();
      }
    };
    document.addEventListener('touchmove', preventPan, { passive: false });
    return () => {
      document.removeEventListener('touchmove', preventPan);
      coalescerRef.current?.cancel();
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, []);

  const handlePointerDown = useCallback((e) => {
    if (!enabled || isDismissing) return;
    // Only handle primary pointer (left mouse click or touch)
    if (e.button !== undefined && e.button !== 0) return;

    // Do not initiate drag if user is actively editing text or clicked an editable element
    const active = typeof document !== 'undefined' ? document.activeElement : null;
    if (pointerIdRef.current !== null || e.isPrimary === false ||
        shouldIgnoreDragStart(e.target, active) ||
        isInsideScrollRegion(e.target, e.currentTarget)) {
      return;
    }

    startYRef.current = e.clientY;
    startXRef.current = e.clientX ?? 0;
    pointerIdRef.current = e.pointerId ?? 1;
    didDragRef.current = false;

    const targetCard = cardRef?.current ||
      e.currentTarget?.closest?.('aside, [role="dialog"], .glass-panel') ||
      e.target?.closest?.('aside, [role="dialog"], .glass-panel') ||
      e.currentTarget;
    const rect = targetCard?.getBoundingClientRect?.();
    if (rect && rect.height > 120) {
      startHeightRef.current = rect.height;
    } else {
      const viewportH = typeof window !== 'undefined' ? window.innerHeight : 800;
      startHeightRef.current = Math.min(viewportH * 0.5, 400) + 60;
    }

    const isInteractive = Boolean(
      e.target?.closest?.('button, a, [role="button"], [role="tab"], [data-testid="metro-card"], [data-testid="bus-feeder-card"]')
    );
    if (isInteractive) {
      // Wait for 6px vertical drag slop before capturing pointer so taps/clicks still fire cleanly
      pendingInteractiveRef.current = true;
      return;
    }

    pendingInteractiveRef.current = false;
    setIsDragging(true);

    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      // Ignore if pointer capture is unsupported
    }
  }, [enabled, isDismissing, cardRef]);

  const handlePointerMove = useCallback((e) => {
    if (pointerIdRef.current === null || (e.pointerId !== undefined && e.pointerId !== pointerIdRef.current)) return;

    if (pendingInteractiveRef.current) {
      const dy = Math.abs(e.clientY - startYRef.current);
      const dx = Math.abs((e.clientX ?? startXRef.current) - startXRef.current);
      if (dy < 6 && dx < 6) return;
      if (dx > dy) {
        pendingInteractiveRef.current = false;
        pointerIdRef.current = null;
        return;
      }
      pendingInteractiveRef.current = false;
      didDragRef.current = true;
      startYRef.current = e.clientY;
      setIsDragging(true);
      try {
        e.currentTarget?.setPointerCapture?.(e.pointerId);
      } catch {
        // Ignore
      }
    }

    const offset = calculateDragOffset(startYRef.current, e.clientY, {
      allowUpward: canDragUp,
      isExpanded,
    });
    if (Math.abs(offset) >= 6) {
      didDragRef.current = true;
    }

    const canReduce = isExpanded && Boolean(onCollapse);
    let newHeight = null;
    let draggingUp = false;
    let reducing = false;

    if (canDragUp && !isExpanded && offset < 0) {
      // Expanding upward: height increases from startHeight towards maxH
      const upwardDist = Math.abs(offset);
      const viewportH = typeof window !== 'undefined' ? window.innerHeight : 800;
      const maxH = Math.min(viewportH * 0.82, viewportH - 84);
      newHeight = Math.min(maxH, startHeightRef.current + upwardDist);
      draggingUp = true;
    } else if (canReduce && offset > 0) {
      // Reducing downward: height decreases from startHeight towards exact collapsed height
      const downwardDist = offset;
      const viewportH = typeof window !== 'undefined' ? window.innerHeight : 800;
      const minH = Math.min(viewportH * 0.5, 400) + 60;
      newHeight = Math.max(minH, startHeightRef.current - downwardDist);
      reducing = true;
    }

    getCoalescer().schedule({
      offset,
      height: newHeight,
      isDraggingUp: draggingUp,
      isReducing: reducing,
    });
  }, [canDragUp, isExpanded, onCollapse, getCoalescer]);

  const handlePointerUp = useCallback((e) => {
    if (pointerIdRef.current === null || (e.pointerId !== undefined && e.pointerId !== pointerIdRef.current)) return;

    if (pendingInteractiveRef.current) {
      pendingInteractiveRef.current = false;
      pointerIdRef.current = null;
      return;
    }

    coalescerRef.current?.cancel();
    const offset = calculateDragOffset(startYRef.current, e.clientY, {
      allowUpward: canDragUp,
      isExpanded,
    });

    try {
      if (pointerIdRef.current !== null && e.currentTarget?.hasPointerCapture?.(pointerIdRef.current)) {
        e.currentTarget.releasePointerCapture(pointerIdRef.current);
      }
    } catch {
      // Ignore
    }

    if (didDragRef.current && typeof window !== 'undefined') {
      const suppressClick = (ev) => {
        ev.stopPropagation();
        ev.preventDefault();
        window.removeEventListener('click', suppressClick, true);
      };
      window.addEventListener('click', suppressClick, true);
      setTimeout(() => window.removeEventListener('click', suppressClick, true), 80);
    }

    didDragRef.current = false;
    setIsDragging(false);
    pointerIdRef.current = null;
    setDragState({
      offset: 0,
      height: null,
      isDraggingUp: false,
      isReducing: false,
    });

    if (shouldDismissOnRelease(offset, threshold)) {
      if (isExpanded && onCollapse) {
        onCollapse();
      } else {
        triggerDismiss();
      }
    } else if (shouldExpandOnRelease(offset, threshold)) {
      if (!isExpanded && onExpand) {
        onExpand();
      }
    }
  }, [canDragUp, isExpanded, threshold, triggerDismiss, onExpand, onCollapse]);

  const handlePointerCancel = useCallback(() => {
    if (pointerIdRef.current === null) return;
    coalescerRef.current?.cancel();
    pendingInteractiveRef.current = false;
    didDragRef.current = false;
    setIsDragging(false);
    setIsDismissing(false);
    setDragState({
      offset: 0,
      height: null,
      isDraggingUp: false,
      isReducing: false,
    });
    pointerIdRef.current = null;
  }, []);

  const cardStyle = enabled
    ? getDragCardStyle(dragState.offset, isDragging, {
        dragHeight: dragState.height,
        isDraggingUp: dragState.isDraggingUp,
        isReducing: dragState.isReducing,
        isDismissing,
        landscape,
        isExpanded,
      })
    : {};

  const handleProps = {
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerUp,
    onPointerCancel: handlePointerCancel,
  };

  return {
    dragOffset: dragState.offset,
    dragHeight: dragState.height,
    isDragging,
    isDraggingUp: dragState.isDraggingUp,
    isReducing: dragState.isReducing,
    isDismissing,
    triggerDismiss,
    handleProps,
    cardStyle,
  };
};

export default useDragToDismiss;
