// What the bus sheet says about one tracked line 19 bus (issue #152). Pure.
import { directionById, findStop, nextStop, stopsAway } from './busRoute';

/** "Est.del Nord - La Malva-rosa" -> "La Malva-rosa" (the part after the origin; hyphens inside names stay). */
export function headsignDestination(trayecto) {
  const parts = String(trayecto || '').split(' - ');
  return (parts[parts.length - 1] || '').trim();
}

/**
 * @returns {{ destination: string, stopsAway: number|null, nextStopName: string|null }}
 * stopsAway is set when `stopCode` is still ahead of the bus on its direction (0 = the next stop);
 * otherwise nextStopName names the bus's next stop (no stop selected, stop passed, or not on its route).
 */
export function describeLiveBus(bus, stopCode) {
  const destination = headsignDestination(bus?.trayecto);
  const result = { destination, stopsAway: null, nextStopName: null };
  const direction = directionById(bus?.directionKey);
  if (!direction || !Number.isFinite(bus?.alongM)) return result;
  if (stopCode && findStop(direction, stopCode)) {
    const r = stopsAway(direction, bus.snappedLonLat, stopCode, { hintAlongM: bus.alongM });
    if (r && !r.passed) return { ...result, stopsAway: r.stopsAway };
  }
  const next = nextStop(direction, bus.alongM);
  return { ...result, nextStopName: next ? next.stop.stopName : null };
}

/** "Next stop" / "1 stop away" / "3 stops away" in the active language. `t` is the i18n function. */
export function stopsAwayLabel(t, stopsAway) {
  if (stopsAway === 0) return t('bus.stopsAwayNext');
  if (stopsAway === 1) return t('bus.stopsAwayOne');
  return t('bus.stopsAwayOther', { count: stopsAway });
}

/**
 * Placement of the live bus sheet. In landscape the stop board sits at the right (top 84, right 16, 34vw wide),
 * so the sheet stays left of it instead of spanning the width.
 */
export function liveBusSheetBox(landscape) {
  return landscape
    ? { left: 12, right: 'auto', width: 'min(380px, calc(66vw - 40px))' }
    : { left: 12, right: 12, maxWidth: 380 };
}
