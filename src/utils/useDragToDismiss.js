import { useState, useRef, useCallback } from 'react';

/**
 * Calculates the downward drag offset in pixels.
 * Upward movements are clamped to 0.
 *
 * @param {number} startY
 * @param {number} currentY
 * @returns {number}
 */
export const calculateDragOffset = (startY, currentY) => {
  if (typeof startY !== 'number' || typeof currentY !== 'number') return 0;
  return Math.max(0, currentY - startY);
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
 * Computes the inline style for the card during and after a drag interaction.
 *
 * @param {number} dragOffset
 * @param {boolean} isDragging
 * @returns {React.CSSProperties}
 */
export const getDragCardStyle = (dragOffset, isDragging) => ({
  transform: dragOffset > 0 ? `translateY(${dragOffset}px)` : undefined,
  transition: isDragging ? 'none' : 'transform 0.25s cubic-bezier(0.2, 0.9, 0.3, 1)',
});

/**
 * Hook providing drag-down-to-dismiss gesture handling for floating cards and bottom sheets.
 *
 * @param {Object} options
 * @param {() => void} options.onDismiss - Callback invoked when dragged past threshold
 * @param {boolean} [options.enabled=true] - Whether drag-to-dismiss is active (e.g. only in portrait/mobile)
 * @param {number} [options.threshold=70] - Distance in px needed to trigger dismiss
 * @returns {{
 *   dragOffset: number,
 *   isDragging: boolean,
 *   handleProps: Object,
 *   cardStyle: React.CSSProperties
 * }}
 */
export const useDragToDismiss = ({
  onDismiss,
  enabled = true,
  threshold = 70,
} = {}) => {
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startYRef = useRef(0);
  const pointerIdRef = useRef(null);

  const handlePointerDown = useCallback((e) => {
    if (!enabled) return;
    // Only handle primary pointer (left mouse click or touch)
    if (e.button !== undefined && e.button !== 0) return;

    startYRef.current = e.clientY;
    pointerIdRef.current = e.pointerId;
    setIsDragging(true);

    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      // Ignore if pointer capture is unsupported
    }
  }, [enabled]);

  const handlePointerMove = useCallback((e) => {
    if (!isDragging) return;
    const offset = calculateDragOffset(startYRef.current, e.clientY);
    setDragOffset(offset);
  }, [isDragging]);

  const handlePointerUp = useCallback((e) => {
    if (!isDragging) return;
    const offset = calculateDragOffset(startYRef.current, e.clientY);

    try {
      if (pointerIdRef.current !== null && e.currentTarget.hasPointerCapture?.(pointerIdRef.current)) {
        e.currentTarget.releasePointerCapture(pointerIdRef.current);
      }
    } catch {
      // Ignore
    }

    setIsDragging(false);
    pointerIdRef.current = null;

    if (shouldDismissOnRelease(offset, threshold)) {
      setDragOffset(0);
      onDismiss?.();
    } else {
      setDragOffset(0);
    }
  }, [isDragging, threshold, onDismiss]);

  const handlePointerCancel = useCallback(() => {
    setIsDragging(false);
    setDragOffset(0);
    pointerIdRef.current = null;
  }, []);

  const cardStyle = enabled ? getDragCardStyle(dragOffset, isDragging) : {};

  const handleProps = {
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerUp,
    onPointerCancel: handlePointerCancel,
  };

  return {
    dragOffset,
    isDragging,
    handleProps,
    cardStyle,
  };
};

export default useDragToDismiss;
