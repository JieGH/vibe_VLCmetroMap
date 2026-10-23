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

/**
 * Starts the splash clock. The fade begins once the minimum hold has passed and
 * the map is ready, or at the maximum hold regardless; onComplete follows one
 * fade later, exactly once.
 */
export const createWelcomeSchedule = ({ ready, onFade, onComplete }) => {
  let isReady = Boolean(ready);
  let minHoldPassed = false;
  let fadeStarted = false;
  const timers = [];

  const startFade = () => {
    if (fadeStarted) return;
    fadeStarted = true;
    onFade();
    timers.push(setTimeout(onComplete, WELCOME_FADE_DURATION_MS));
  };
  const maybeFade = () => {
    if (minHoldPassed && isReady) startFade();
  };

  timers.push(setTimeout(() => { minHoldPassed = true; maybeFade(); }, WELCOME_MIN_HOLD_MS));
  timers.push(setTimeout(startFade, WELCOME_MAX_HOLD_MS));

  return {
    setReady(value) {
      isReady = Boolean(value);
      maybeFade();
    },
    cancel() {
      timers.forEach(clearTimeout);
    },
  };
};
