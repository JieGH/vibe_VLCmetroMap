// Timing and same-session memory for the splash screen (see WelcomeScreen).

export const WELCOME_MIN_HOLD_MS = 500;
export const WELCOME_MAX_HOLD_MS = 1000;
export const WELCOME_FADE_DURATION_MS = 200;
export const WELCOME_SEEN_KEY = 'xarxa_welcome_seen';

const defaultStorage = () => {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
};

/** True when the splash already completed in this tab's session. */
export const hasSeenWelcome = (storage = defaultStorage()) => {
  try {
    return storage?.getItem(WELCOME_SEEN_KEY) === '1';
  } catch {
    return false;
  }
};

export const markWelcomeSeen = (storage = defaultStorage()) => {
  try {
    storage?.setItem(WELCOME_SEEN_KEY, '1');
  } catch {
    // Ignore storage exceptions in sandboxed environments
  }
};

const defaultNow = () => (
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
);

/**
 * Starts the splash clock. As soon as the map is ready the fade is requested
 * with `onFade(delayMs)`, where delayMs is the remainder of the minimum hold
 * (0 once it has passed), so a compositor-driven CSS transition can wait it out
 * without needing the main thread at that moment. The maximum hold fades with no
 * delay regardless. onComplete follows delay + one fade later; both fire once.
 */
export const createWelcomeSchedule = ({ ready, onFade, onComplete, now = defaultNow }) => {
  let fadeStarted = false;
  const timers = [];
  const startedAt = now();

  const startFade = (delayMs) => {
    if (fadeStarted) return;
    fadeStarted = true;
    onFade(delayMs);
    timers.push(setTimeout(onComplete, delayMs + WELCOME_FADE_DURATION_MS));
  };
  const fadeWhenReady = () => {
    const elapsed = now() - startedAt;
    startFade(Math.max(0, Math.round(WELCOME_MIN_HOLD_MS - elapsed)));
  };

  timers.push(setTimeout(() => startFade(0), WELCOME_MAX_HOLD_MS));
  if (ready) fadeWhenReady();

  return {
    setReady(value) {
      if (value) fadeWhenReady();
    },
    cancel() {
      timers.forEach(clearTimeout);
    },
  };
};
