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
const validJourney = journey => Boolean(journey?.id && Array.isArray(journey.legs) && journey.legs.length &&
  journey.legs.every(leg => leg.from && leg.to && Number.isFinite(leg.startTime) && Number.isFinite(leg.endTime) && leg.endTime >= leg.startTime));
const validIndices = session => Number.isInteger(session.legIndex) && Number.isInteger(session.callIndex) &&
  session.legIndex >= 0 && session.callIndex >= 0 && Boolean(session.journey?.legs?.[session.legIndex]) &&
  Boolean(journeyLegCalls(session.journey.legs[session.legIndex])[session.callIndex]);
const nativeStatus = result => result?.supported && result.status === 'active' ? 'active' :
  result?.status === 'denied' ? 'denied' : result?.platform === 'web' ? 'foreground-only' : 'unavailable';

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
  let lifecycle = 0;
  let startedAt = null;
  let sessionOptions = {};
  let nativeQueue = Promise.resolve();
  const alerted = new Set();

  const publish = () => {
    const leg = snapshot.journey?.legs[snapshot.legIndex];
    const calls = leg ? journeyLegCalls(leg) : [];
    snapshot = { ...snapshot, version: JOURNEY_SESSION_VERSION, updatedAt: now(), sessionId, startedAt, scheduleOffset, manualAt,
      soundEnabled: Boolean(sessionOptions.soundEnabled), labels: sessionOptions.labels || {},
      nextCall: calls[snapshot.callIndex + 1] || null,
      remainingCalls: Math.max(0, calls.length - snapshot.callIndex - 1) };
    if (snapshot.remainingCalls !== 1) snapshot = { ...snapshot, alightAlert: null };
    if (snapshot.status === 'active' && transit(leg) && snapshot.remainingCalls === 1 &&
      (snapshot.boardingConfirmed || now() >= leg.startTime + scheduleOffset)) {
      const eventId = `${sessionId}:${leg.id}:alight`;
      if (!alerted.has(eventId)) {
        alerted.add(eventId);
        snapshot = { ...snapshot, alightAlert: { eventId, legId: leg.id,
          estimated: snapshot.progressSource === 'estimated' || !snapshot.boardingConfirmed, destination: leg.to.name } };
        onAlert(snapshot.alightAlert);
      }
    }
    snapshot = { ...snapshot, alertedEventIds: [...alerted] };
    onChange(snapshot);
    listeners.forEach(fn => fn(snapshot));
    return snapshot;
  };
  const payload = () => ({ version: JOURNEY_SESSION_VERSION, id: sessionId,
    journey: snapshot.journey, legIndex: snapshot.legIndex, callIndex: snapshot.callIndex,
    boardingConfirmed: snapshot.boardingConfirmed, progressSource: snapshot.progressSource,
    startedAt, updatedAt: snapshot.updatedAt, scheduleOffset, soundEnabled: Boolean(sessionOptions.soundEnabled),
    labels: sessionOptions.labels || {}, alertedEventIds: [...alerted] });
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
      void nativeOperation('updateSession').then(result => {
        if (snapshot.status === 'active' && sessionId === id && nativeStatus(result) !== snapshot.nativeStatus) {
          snapshot = { ...snapshot, nativeStatus: nativeStatus(result) }; publish();
        }
      }).catch(() => {
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
    lifecycle += 1;
    if (!active()) return snapshot;
    if (timer !== null) clearIntervalFn(timer);
    timer = null;
    const stoppedPayload = payload();
    snapshot = { ...snapshot, status, nativeStatus: 'stopped', alightAlert: null };
    void nativeOperation('stopSession', stoppedPayload).catch(() => {});
    return publish();
  };
  const begin = (journey, options = {}, restored = null, adoptNative = false) => {
      if (!validJourney(journey)) {
        throw new Error('Invalid Journey');
      }
      if (active()) stop('cancelled');
      lifecycle += 1;
      startedAt = restored?.startedAt ?? now();
      sessionId = restored?.sessionId || `${journey.id}:${startedAt}:${++serial}`;
      sessionOptions = options;
      scheduleOffset = restored?.scheduleOffset ?? 0;
      manualAt = restored?.manualAt ?? 0;
      confirmedAt = 0;
      alerted.clear();
      (restored?.alertedEventIds || []).forEach(id => alerted.add(id));
      snapshot = { status: 'active', journey, legIndex: restored?.legIndex ?? 0, callIndex: restored?.callIndex ?? 0,
        boardingConfirmed: Boolean(restored?.boardingConfirmed), progressSource: 'estimated', updatedAt: now(),
        nativeStatus: adoptNative ? 'active' : nativeAdapter ? 'starting' : 'foreground-only', alightAlert: null };
      tick();
      const id = sessionId;
      if (adoptNative) syncNative();
      else if (nativeAdapter) {
        void nativeOperation('startSession').then(result => {
          if (!active() || sessionId !== id) return;
          snapshot = { ...snapshot, nativeStatus: nativeStatus(result) };
          publish();
        }).catch(() => {
          if (active() && sessionId === id) { snapshot = { ...snapshot, nativeStatus: 'unavailable' }; publish(); }
        });
      }
      timer = setIntervalFn(tick, 10_000);
      return snapshot;
  };
  const api = {
    start: begin,
    async resume(saved, options = {}) {
      if (saved?.version !== JOURNEY_SESSION_VERSION || saved.status !== 'active' ||
        typeof saved.sessionId !== 'string' || !saved.sessionId || !validJourney(saved.journey) || !validIndices(saved) ||
        !Number.isFinite(saved.startedAt) || !Number.isFinite(saved.updatedAt) || !Number.isFinite(saved.scheduleOffset)) {
        throw Object.assign(new Error('Saved Journey is invalid'), { code: 'invalid-session' });
      }
      if (active()) stop('cancelled');
      const operation = ++lifecycle;
      let restored = saved;
      let adoptNative = false;
      if (nativeAdapter?.getSession) {
        try {
          await nativeQueue.catch(() => {});
          const response = await nativeAdapter.getSession();
          const remote = response?.session;
          if (response?.supported && response.status === 'active' && remote?.version === JOURNEY_SESSION_VERSION &&
            remote.id === saved.sessionId && remote.journey?.id === saved.journey.id && validIndices(remote) &&
            Number.isFinite(remote.updatedAt) && remote.updatedAt >= saved.updatedAt && remote.updatedAt <= now() + 10_000 &&
            Number.isFinite(remote.scheduleOffset)) {
            restored = { ...saved, legIndex: remote.legIndex, callIndex: remote.callIndex,
              boardingConfirmed: Boolean(remote.boardingConfirmed), scheduleOffset: remote.scheduleOffset,
              alertedEventIds: [...(Array.isArray(saved.alertedEventIds) ? saved.alertedEventIds : []),
                ...(Array.isArray(remote.alertedEventIds) ? remote.alertedEventIds.filter(id => typeof id === 'string') : [])] };
            adoptNative = true;
          }
        } catch { /* An unavailable OS session can be explicitly restarted. */ }
      }
      if (operation !== lifecycle) return snapshot;
      return begin(saved.journey, { soundEnabled: saved.soundEnabled, labels: saved.labels, ...options }, restored, adoptNative);
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
        if (result?.supported && result.status === 'stopped' && snapshot.nativeStatus === 'active') {
          return stop('cancelled');
        }
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
        if (Array.isArray(session.alertedEventIds)) session.alertedEventIds.filter(id => typeof id === 'string').forEach(id => alerted.add(id));
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
