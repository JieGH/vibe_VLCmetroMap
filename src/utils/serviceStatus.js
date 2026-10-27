// The header's service status: is each live feed working, not answering, or refusing this network.
// Pure logic; the hook in components/ServiceStatusButton.jsx feeds it from the stores.

/** Failures in a row before a feed counts as not answering. About 6% of FGV requests hang on their own (ADR-0005). */
export const DEGRADED_AFTER_FAILURES = 2;

function feedStatus({ lastFailure, failuresInARow }, refused) {
  if (refused) return { state: 'blocked', httpStatus: lastFailure?.status ?? null, at: lastFailure?.at ?? null };
  if (failuresInARow >= DEGRADED_AFTER_FAILURES) {
    return { state: 'degraded', httpStatus: lastFailure?.status ?? null, at: lastFailure?.at ?? null };
  }
  return { state: 'ok', httpStatus: null, at: null };
}

/**
 * @param {{ health: { train: object, bus: object }, trainRefused: boolean, busRefused: boolean }} input
 * @returns {{ level: 'ok'|'degraded'|'blocked', train: object, bus: object }}
 */
export function computeServiceStatus({ health, trainRefused, busRefused }) {
  const train = feedStatus(health.train, trainRefused);
  const bus = feedStatus(health.bus, busRefused);
  const states = [train.state, bus.state];
  const level = states.includes('blocked') ? 'blocked' : states.includes('degraded') ? 'degraded' : 'ok';
  return { level, train, bus };
}
