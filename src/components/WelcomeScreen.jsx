import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from '../i18n';
import { isAndroid } from '../utils/platform';
import {
  WELCOME_MIN_HOLD_MS,
  WELCOME_MAX_HOLD_MS,
  WELCOME_FADE_DURATION_MS,
  createWelcomeSchedule,
  markWelcomeSeen,
} from '../utils/welcomeSchedule';

export { WELCOME_MIN_HOLD_MS, WELCOME_MAX_HOLD_MS, WELCOME_FADE_DURATION_MS };

/**
 * Brief Welcome / Splash Screen with static Xarxa brand mark
 *
 * Displays the clean, native-feeling Xarxa app icon and name upon initial app launch.
 * It holds at least 0.5 s, then fades into the live map as soon as the map reports `ready`
 * (or at 1.0 s at the latest).
 */
const WelcomeScreen = ({ ready = false, onComplete }) => {
  const { t } = useTranslation();
  const [fading, setFading] = useState(false);
  const [fadeDelay, setFadeDelay] = useState(0);
  const [hidden, setHidden] = useState(false);
  const scheduleRef = useRef(null);
  const initialReadyRef = useRef(ready);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  useEffect(() => {
    const schedule = createWelcomeSchedule({
      ready: initialReadyRef.current,
      onFade: (delayMs) => { setFadeDelay(delayMs); setFading(true); },
      onComplete: () => {
        setHidden(true);
        markWelcomeSeen();
        if (onCompleteRef.current) onCompleteRef.current();
      },
    });
    scheduleRef.current = schedule;
    return () => schedule.cancel();
    // The clock starts once on mount; later `ready` changes are fed below.
  }, []);

  useEffect(() => { scheduleRef.current?.setReady(ready); }, [ready]);

  // Android: a tap anywhere skips the splash straight to the map.
  const skip = () => {
    scheduleRef.current?.cancel();
    setHidden(true);
    markWelcomeSeen();
    if (onCompleteRef.current) onCompleteRef.current();
  };
  const skippable = isAndroid();

  if (hidden) return null;

  return (
    <div
      className={`welcome-screen ${fading ? 'welcome-screen--fading' : ''}`}
      role="status"
      aria-label="Xarxa"
      data-testid="welcome-screen"
      onClick={skippable ? skip : undefined}
      style={fading ? { transitionDelay: `${fadeDelay}ms` } : undefined}
    >
      <div className="welcome-screen-content">
        <div className="welcome-screen-logo-wrap">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 64 64"
            width="88"
            height="88"
            className="welcome-screen-logo"
            aria-hidden="true"
          >
            <rect width="64" height="64" rx="16" fill="#1e1e2a" />
            <g fill="none" strokeLinecap="round" strokeWidth="7.5">
              <path stroke="#E2001A" d="M11 53 L 53 11" />
              <path stroke="#FFD100" d="M9 32 H 55" />
              <path stroke="#00994D" d="M11 11 L 53 53" />
            </g>
            <circle cx="32" cy="32" r="10" fill="#1e1e2a" />
            <circle cx="32" cy="32" r="6.5" fill="#fff" />
          </svg>
        </div>
        <h1 className="welcome-screen-title">Xarxa</h1>
        <p className="welcome-screen-subtitle">{t('welcomeScreen.subtitle')}</p>
      </div>
    </div>
  );
};

export default WelcomeScreen;
