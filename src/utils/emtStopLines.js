// Line-number chips drawn on EMT stop markers at street zoom (#116).
// Data comes from emt_stops.json `lines`: no network, no arrival fetch (ADR-0011).

/** Most chips on one marker, the +N overflow chip included. */
export const MAX_STOP_LINE_CHIPS = 6;

/**
 * Sorts a stop's lines numerically (9 before 31, numbered before lettered) and caps them.
 * @param {string[]} [lines]
 * @returns {{ shown: string[], extra: number }} extra is how many lines the +N chip stands for
 */
export const capStopLines = (lines) => {
  const clean = [...new Set((lines || []).map((l) => String(l).trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  if (clean.length <= MAX_STOP_LINE_CHIPS) return { shown: clean, extra: 0 };
  const shown = clean.slice(0, MAX_STOP_LINE_CHIPS - 1);
  return { shown, extra: clean.length - shown.length };
};

/** Chip group markup for a stop marker; empty when the stop has no lines. Hidden by CSS until the lines stage. */
export const stopLinesMarkup = (lines) => {
  const { shown, extra } = capStopLines(lines);
  if (shown.length === 0) return '';
  const chips = shown.map((l) => `<span class="emt-stop-chip">${l}</span>`);
  if (extra > 0) chips.push(`<span class="emt-stop-chip emt-stop-chip-more">+${extra}</span>`);
  return `<div class="emt-stop-lines">${chips.join('')}</div>`;
};
