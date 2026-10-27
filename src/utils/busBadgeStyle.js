// One shared bus line badge box (#121). No EMT line is above 99, so the text is at most two digits:
// the minimum box is a square (min-width equals height) with a hairline of side padding, and a
// 2-digit line grows past the square instead of clipping. Height, font and radius stay per caller.
// The map chip in index.css (.emt-stop-chip) mirrors this at 14px: min-width 14px, padding 0 2px.

/** Horizontal padding in px for a badge of the given height (about 12% of it, 2px minimum). */
export const busBadgePadX = (height) => Math.max(2, Math.round(height * 0.12));

/** Inline style box (height, min-width, padding) for a bus line badge of the given height in px. */
export const busBadgeBox = (height) => ({
  height,
  minWidth: height,
  padding: `0 ${busBadgePadX(height)}px`,
});
