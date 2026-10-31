import { getDistance } from '../utils/geoUtils';

export const JOURNEY_SESSION_VERSION = 1;

/** Calls include boarding and alighting, so index zero is always the origin. */
export function journeyLegCalls(leg) {
  return [
    { ...leg.from, arrivalTime: leg.startTime, departureTime: leg.startTime },
    ...(leg.intermediateStops || []),
    { ...leg.to, arrivalTime: leg.endTime, departureTime: leg.endTime },
  ];
}

const transit = leg => leg && leg.mode !== 'WALK';
const callTime = call => call.arrivalTime ?? call.departureTime;

/** Public passenger Journey interface. Location is supplied by the existing app watch. */
export function createJourneySession({ now = Date.now,
  setIntervalFn = setInterval, clearIntervalFn = clearInterval,
  nativeAdapter = null, onChange = () => {}, onAlert = () => {},
} = {}) {
  let snapshot = { status: 'idle', journey: null, legIndex: 0, callIndex: 0,
    boardingConfirmed: false, progressSource: 'estimated', nativeStatus: 'foreground-only',
    updatedAt: now(), nextCall: null, remainingCalls: 0, alightAlert: null };
  const listeners = new Set();
  let timer = null;
  let scheduleOffset = 0;
  let manualAt = 0;
  let confirmedAt = 0;
  let sessionId = null;
  let serial = 0;
  let startedAt = null;
  let sessionOptions = {};
  let nativeQueue = Promise.resolve();
  const alerted = new Set();

  const publish = () => {
    const leg = snapshot.journey?.legs[snapshot.legIndex];
    const calls = leg ? journeyLegCalls(leg) : [];
    snapshot = { ...snapshot, updatedAt: now(), sessionId, startedAt, scheduleOffset,
      nextCall: calls[snapshot.callIndex + 1] || null,
      remainingCalls: Math.max(0, calls.length - snapshot.callIndex - 1) };
    if (snapshot.status === 'active' && transit(leg) && snapshot.remainingCalls === 1 &&
      (snapshot.boardingConfirmed || now() >= leg.startTime + scheduleOffset)) {
      const eventId = `${sessionId}:${leg.id}:alight`;
      if (!alerted.has(eventId)) {
        alerted.add(eventId);
        snapshot = { ...snapshot, alightAlert: { eventId, legId: leg.id,
          estimated: snapshot.progressSource === 'estimated', destination: leg.to.name } };
        onAlert(snapshot.alightAlert);
      }
    }
    onChange(snapshot);
    listeners.forEach(fn => fn(snapshot));
    return snapshot;
  };
  const payload = () => ({ version: JOURNEY_SESSION_VERSION, id: sessionId,
    journey: snapshot.journey, legIndex: snapshot.legIndex, callIndex: snapshot.callIndex,
    boardingConfirmed: snapshot.boardingConfirmed, progressSource: snapshot.progressSource,
    startedAt, updatedAt: snapshot.updatedAt, scheduleOffset, soundEnabled: Boolean(sessionOptions.soundEnabled),
    labels: sessionOptions.labels || {} });
  const nativeOperation = (operation, session = payload()) => {
    if (!nativeAdapter?.[operation]) return Promise.resolve(null);
    nativeQueue = nativeQueue.catch(() => {}).then(() => nativeAdapter[operation](
      operation === 'stopSession' ? { sessionId: session.id } : { session },
    ));
    return nativeQueue;
  };
  const syncNative = () => {
    if (snapshot.status === 'active' && nativeAdapter && ['starting', 'active'].includes(snapshot.nativeStatus)) {
      const id = sessionId;
      void nativeOperation('updateSession').catch(() => {
        if (snapshot.status === 'active' && sessionId === id) { snapshot = { ...snapshot, nativeStatus: 'unavailable' }; publish(); }
      });
    }
  };
  const active = () => snapshot.status === 'active';
  const tick = () => {
    if (!active()) return snapshot;
    const at = now() - scheduleOffset;
    const legs = snapshot.journey.legs;
    let legIndex = legs.findIndex(leg => at < leg.endTime);
    if (legIndex < 0) legIndex = legs.length - 1;
    legIndex = Math.max(snapshot.legIndex, legIndex);
    const calls = journeyLegCalls(legs[legIndex]);
    let callIndex = 0;
    calls.forEach((call, index) => { if (callTime(call) <= at) callIndex = index; });
    if (legIndex === snapshot.legIndex) callIndex = Math.max(snapshot.callIndex, callIndex);
    const changedLeg = legIndex !== snapshot.legIndex;
    const sameCall = legIndex === snapshot.legIndex && callIndex === snapshot.callIndex;
    snapshot = { ...snapshot, legIndex, callIndex,
      boardingConfirmed: changedLeg ? false : snapshot.boardingConfirmed,
      progressSource: sameCall && now() - confirmedAt < 60_000 ? snapshot.progressSource : 'estimated',
      alightAlert: changedLeg ? null : snapshot.alightAlert };
    return publish();
  };
  const stop = status => {
    if (!active()) return snapshot;
    if (timer !== null) clearIntervalFn(timer);
    timer = null;
    const stoppedPayload = payload();
    snapshot = { ...snapshot, status, nativeStatus: 'stopped', alightAlert: null };
    void nativeOperation('stopSession', stoppedPayload).catch(() => {});
    return publish();
  };
  const api = {
    start(journey, options = {}) {
      if (!journey?.id || !Array.isArray(journey.legs) || !journey.legs.length ||
        journey.legs.some(leg => !leg.from || !leg.to || !Number.isFinite(leg.startTime) || !Number.isFinite(leg.endTime))) {
        throw new Error('Invalid Journey');
      }
      if (active()) stop('cancelled');
      startedAt = now();
      sessionId = `${journey.id}:${startedAt}:${++serial}`;
      sessionOptions = options;
      scheduleOffset = 0;
      manualAt = 0;
      confirmedAt = 0;
      alerted.clear();
      snapshot = { status: 'active', journey, legIndex: 0, callIndex: 0,
        boardingConfirmed: false, progressSource: 'estimated', updatedAt: now(),
        nativeStatus: nativeAdapter ? 'starting' : 'foreground-only', alightAlert: null };
      tick();
      const id = sessionId;
      if (nativeAdapter) {
        void nativeOperation('startSession').then(result => {
          if (!active() || sessionId !== id) return;
          snapshot = { ...snapshot, nativeStatus: result?.supported && result.status === 'active' ? 'active' :
            result?.status === 'denied' ? 'denied' : result?.platform === 'web' ? 'foreground-only' : 'unavailable' };
          publish();
        }).catch(() => {
          if (active() && sessionId === id) { snapshot = { ...snapshot, nativeStatus: 'unavailable' }; publish(); }
        });
      }
      timer = setIntervalFn(tick, 10_000);
      return snapshot;
    },
    tick,
    updateLocation(fix) {
      const coordinates = fix?.coordinates;
      const timestamp = fix?.updatedAt ?? fix?.fetchedAt;
      if (!active() || !Array.isArray(coordinates) || coordinates.length !== 2 || !coordinates.every(Number.isFinite) ||
        !Number.isFinite(fix.accuracy) || fix.accuracy < 0 || fix.accuracy > 100 ||
        !Number.isFinite(timestamp) || now() - timestamp > 60_000 || timestamp > now() + 10_000) return snapshot;
      const calls = journeyLegCalls(snapshot.journey.legs[snapshot.legIndex]);
      const candidates = calls.map((call, index) => ({ call, index,
        distance: Array.isArray(call.coordinates) ? getDistance(coordinates, call.coordinates) : Infinity,
      })).filter(candidate => candidate.distance <= Math.max(45, fix.accuracy)).sort((a, b) => a.distance - b.distance);
      if (!candidates.length || (candidates[1] && candidates[1].distance - candidates[0].distance <= fix.accuracy * 2)) return snapshot;
      const match = candidates[0];
      confirmedAt = now();
      scheduleOffset = now() - callTime(match.call);
      snapshot = { ...snapshot, callIndex: match.index, progressSource: 'location', alightAlert: null };
      publish(); syncNative(); return snapshot;
    },
    confirmBoarding() {
      if (!active() || !transit(snapshot.journey.legs[snapshot.legIndex])) return snapshot;
      snapshot = { ...snapshot, boardingConfirmed: true };
      publish(); syncNative(); return snapshot;
    },
    correctCall(legIndex, callIndex) {
      if (!active() || !Number.isInteger(legIndex) || !Number.isInteger(callIndex)) return snapshot;
      const leg = snapshot.journey.legs[legIndex];
      if (!leg) return snapshot;
      const calls = journeyLegCalls(leg);
      if (!calls[callIndex]) return snapshot;
      scheduleOffset = now() - callTime(calls[callIndex]);
      manualAt = now();
      confirmedAt = now();
      snapshot = { ...snapshot, legIndex, callIndex, progressSource: 'manual',
        boardingConfirmed: legIndex === snapshot.legIndex ? snapshot.boardingConfirmed : false,
        alightAlert: null };
      publish(); syncNative(); return snapshot;
    },
    advanceLeg() {
      if (!active() || snapshot.legIndex >= snapshot.journey.legs.length - 1) return snapshot;
      return api.correctCall(snapshot.legIndex + 1, 0);
    },
    async reconcileNative() {
      if (!active() || !nativeAdapter?.getSession) return snapshot;
      const id = sessionId;
      try {
        await nativeQueue.catch(() => {});
        const result = await nativeAdapter.getSession();
        const session = result?.session;
        if (!active() || sessionId !== id) return snapshot;
        if (!result?.supported || result.status !== 'active') {
          snapshot = { ...snapshot, nativeStatus: result?.status === 'denied' ? 'denied' : 'unavailable' };
          return publish();
        }
        if (
          session?.version !== JOURNEY_SESSION_VERSION || session.id !== id || session.journey?.id !== snapshot.journey.id ||
          !Number.isInteger(session.legIndex) || !Number.isInteger(session.callIndex) ||
          !Number.isFinite(session.updatedAt) || session.updatedAt <= manualAt || session.updatedAt > now() + 10_000 ||
          !['estimated', 'location', 'manual'].includes(session.progressSource)) return snapshot;
        const leg = snapshot.journey.legs[session.legIndex];
        if (!leg || !journeyLegCalls(leg)[session.callIndex]) return snapshot;
        const calls = journeyLegCalls(leg);
        scheduleOffset = Number.isFinite(session.scheduleOffset) ? session.scheduleOffset : now() - callTime(calls[session.callIndex]);
        snapshot = { ...snapshot, legIndex: session.legIndex, callIndex: session.callIndex,
          boardingConfirmed: Boolean(session.boardingConfirmed), progressSource: session.progressSource,
          nativeStatus: 'active', alightAlert: null };
        confirmedAt = session.progressSource === 'estimated' ? 0 : now();
        return publish();
      } catch {
        if (active() && sessionId === id) { snapshot = { ...snapshot, nativeStatus: 'unavailable' }; publish(); }
        return snapshot;
      }
    },
    cancel: () => stop('cancelled'),
    complete: () => stop('completed'),
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    getSnapshot: () => snapshot,
    dispose() { stop('cancelled'); listeners.clear(); },
  };
  return api;
}
