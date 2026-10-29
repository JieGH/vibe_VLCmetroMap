// Which Bus Line is "in focus" decides whether the live Bus GPS Stream is polled (ADR-0011: on demand
// only, ADR-0014: line 19). Pure.

export const LIVE_BUS_LINE = '19';

/**
 * True when the line 19 chip/inspector is open (the line was chosen on its own), or a selected stop is
 * served by line 19 alone (the stop's own `lines`, or a lookup by code when the selection came from the
 * line inspector and carries none). A stop shared with other lines never picks a line: tapping it must
 * not highlight one of several routes.
 * @param {{selectedBusStop?: object|null, activeBusLine?: object|null}} focus
 * @param {Map<string, {lines?: string[]}>} stopsByCode
 */
export function isLine19Focused({ selectedBusStop = null, activeBusLine = null } = {}, stopsByCode = new Map()) {
  if (activeBusLine && String(activeBusLine.id) === LIVE_BUS_LINE) return true;
  if (!selectedBusStop) return false;
  const code = String(selectedBusStop.stopCode ?? selectedBusStop.code ?? '');
  const lines = Array.isArray(selectedBusStop.lines) ? selectedBusStop.lines : stopsByCode.get(code)?.lines;
  if (!Array.isArray(lines)) return false;
  const distinct = new Set(lines.map(String));
  return distinct.size === 1 && distinct.has(LIVE_BUS_LINE);
}
