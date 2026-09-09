import React, { useEffect, useState } from 'react';

/**
 * 1-Second Welcome / Splash Screen
 *
 * Displays a clean, native-feeling splash overlay showing the app icon and name
 * for exactly 1000ms upon initial app launch, then smoothly fades out over 350ms
 * to reveal the live interactive map.
 */
const WelcomeScreen = ({ onComplete }) => {
  const [fading, setFading] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    // Hold splash screen for 1000ms (1 second)
    const holdTimer = setTimeout(() => {
      setFading(true);
    }, 1000);

    // After 350ms fade-out transition, completely unmount from DOM
    const dismissTimer = setTimeout(() => {
      setHidden(true);
      if (onComplete) onComplete();
    }, 1350);

    return () => {
      clearTimeout(holdTimer);
      clearTimeout(dismissTimer);
    };
  }, [onComplete]);

  if (hidden) return null;

  return (
    <div
      className={`welcome-screen ${fading ? 'welcome-screen--fading' : ''}`}
      role="status"
      aria-label="Metro Valencia"
      data-testid="welcome-screen"
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
        <h1 className="welcome-screen-title">Metro Valencia</h1>
        <p className="welcome-screen-subtitle">Live Map & Real-time Arrivals</p>
      </div>
    </div>
  );
};

export default WelcomeScreen;
