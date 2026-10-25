import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from '../i18n';
import { isAndroid } from '../utils/platform';
import AppBadge from './AppBadge';
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
          <AppBadge size={88} className="welcome-screen-logo" />
        </div>
        <h1 className="welcome-screen-title">Xarxa</h1>
        <p className="welcome-screen-subtitle">{t('welcomeScreen.subtitle')}</p>
      </div>
    </div>
  );
};

export default WelcomeScreen;
