const KEY = 'xarxa.unfinishedJourney.v1';
const MAX_SAVED_BYTES = 1024 * 1024;

const recoverable = snapshot => snapshot?.version === 1 && snapshot.status === 'active' &&
  typeof snapshot.sessionId === 'string' && snapshot.sessionId.length > 0 &&
  Number.isFinite(snapshot.startedAt) && Number.isFinite(snapshot.updatedAt) && Number.isFinite(snapshot.scheduleOffset) &&
  Array.isArray(snapshot.journey?.legs) && snapshot.journey.legs.length > 0 &&
  Number.isInteger(snapshot.legIndex) && snapshot.legIndex >= 0 && snapshot.legIndex < snapshot.journey.legs.length &&
  Number.isInteger(snapshot.callIndex) && snapshot.callIndex >= 0;

/** Saves selected instructions, never a history of GPS fixes. Storage may be unavailable. */
export function createJourneyRecovery({ storage } = {}) {
  if (!storage) {
    try { storage = globalThis.localStorage; } catch { /* Private browsing can deny storage. */ }
  }
  const clear = () => { try { storage?.removeItem(KEY); } catch { /* Guidance still works without persistence. */ } };
  return {
    clear,
    save(snapshot) {
      if (snapshot?.status === 'idle') return false;
      if (!recoverable(snapshot)) { clear(); return false; }
      try {
        const serialized = JSON.stringify(snapshot);
        if (serialized.length > MAX_SAVED_BYTES || !storage) { clear(); return false; }
        storage.setItem(KEY, serialized);
        return true;
      } catch { clear(); return false; }
    },
    load() {
      try {
        const serialized = storage?.getItem(KEY);
        if (!serialized) return null;
        if (serialized.length > MAX_SAVED_BYTES) { clear(); return null; }
        const saved = JSON.parse(serialized);
        if (!recoverable(saved)) { clear(); return null; }
        // Cached live predictions cannot claim to be fresh on reopening.
        for (const leg of saved.journey.legs) {
          if (leg.departureSource === 'live') leg.departureSource = 'stale';
        }
        return saved;
      } catch { clear(); return null; }
    },
  };
}
