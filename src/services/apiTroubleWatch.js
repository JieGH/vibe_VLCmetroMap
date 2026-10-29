// Tells the owner when a live-data API starts refusing or failing, so it is visible whether EMT or FGV
// really block frequent access (#144). Reads the diagnostics the services already keep; sends nothing itself.
import { getApiHealth, getRecentRequestCount, subscribeApiStatus } from '../utils/diagnostics';

/** Blocked and rate-limited answers are alerted at once; anything else only after this many failures in a row. */
export const TROUBLE_STREAK = 5;
/** The same alert is not sent again within this long. */
export const TROUBLE_REPEAT_MS = 10 * 60_000;

/**
 * @param {object} args
 * @param {(alert: object) => void} args.report - sends one alert (see reportApiTrouble)
 * @param {() => number} [args.now]
 * @returns {() => void} stop watching
 */
export function watchApiTrouble({ report, now = () => Date.now() }) {
  const troubleSince = {}; // api -> time of the first alert of the current trouble
  const lastSent = {}; // `${api}:${kind}` -> time

  const check = () => {
    const health = getApiHealth();
    for (const api of Object.keys(health)) {
      const { lastFailure, failuresInARow } = health[api];
      const t = now();
      if (failuresInARow === 0) {
        if (troubleSince[api] !== undefined) {
          report({ api, recovered: true, downForMs: t - troubleSince[api] });
          delete troubleSince[api];
        }
        continue;
      }
      if (!lastFailure) continue;
      const hard = lastFailure.kind === 'blocked' || lastFailure.kind === 'rate-limited';
      if (!hard && failuresInARow < TROUBLE_STREAK) continue;
      const key = `${api}:${lastFailure.kind}`;
      if (lastSent[key] !== undefined && t - lastSent[key] < TROUBLE_REPEAT_MS) continue;
      lastSent[key] = t;
      if (troubleSince[api] === undefined) troubleSince[api] = t;
      report({
        api,
        kind: lastFailure.kind,
        status: lastFailure.status,
        failuresInARow,
        requestsLast10s: getRecentRequestCount(api, 10_000),
        requestsLast60s: getRecentRequestCount(api, 60_000),
      });
    }
  };

  return subscribeApiStatus(check);
}
