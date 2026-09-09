import React, { useEffect, useState } from 'react';

export const WELCOME_HOLD_DURATION_MS = 1000;
export const WELCOME_FADE_DURATION_MS = 300;
export const WELCOME_TOTAL_DURATION_MS = WELCOME_HOLD_DURATION_MS + WELCOME_FADE_DURATION_MS;

/**
 * 1.0-Second Welcome / Splash Screen with Line-Draw & Central Station Spotlight
 *
 * Displays an animated brand mark showing metro lines drawing into the central station,
 * which then blooms open like a spotlight before smoothly fading into the live map.
 */
const WelcomeScreen = ({ onComplete }) => {
  const [fading, setFading] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    // Hold splash screen for 1000ms (1.0 second)
    const holdTimer = setTimeout(() => {
      setFading(true);
    }, WELCOME_HOLD_DURATION_MS);

    // After 300ms fade-out transition, completely unmount from DOM
    const dismissTimer = setTimeout(() => {
      setHidden(true);
      if (onComplete) onComplete();
    }, WELCOME_TOTAL_DURATION_MS);

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
            className="welcome-screen-logo"
            aria-hidden="true"
            style={{ overflow: 'visible' }}
          >
            <defs>
              {/* Radial spotlight glow radiating outward from the central station */}
              <radialGradient id="welcomeSpotlightGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
                <stop offset="35%" stopColor="#FFD100" stopOpacity="0.75" />
                <stop offset="70%" stopColor="#E2001A" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#16161f" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Expanding spotlight halo centered at the central station (32, 32) */}
            <circle
              cx="32"
              cy="32"
              r="28"
              fill="url(#welcomeSpotlightGlow)"
              className="welcome-station-spotlight"
            />

            {/* Inward transit line paths: drawn from outer edges to central station (32, 32) */}
            <g fill="none" strokeLinecap="round" strokeWidth="7.5" className="welcome-metro-lines">
              {/* Line 3 (Red) diagonal */}
              <path stroke="#E2001A" d="M8 56 L 32 32" className="welcome-line welcome-line--red" />
              <path stroke="#E2001A" d="M56 8 L 32 32" className="welcome-line welcome-line--red" />

              {/* Line 1 (Yellow) horizontal */}
              <path stroke="#FFD100" d="M6 32 L 32 32" className="welcome-line welcome-line--yellow" />
              <path stroke="#FFD100" d="M58 32 L 32 32" className="welcome-line welcome-line--yellow" />

              {/* Line 5 (Green) diagonal */}
              <path stroke="#00994D" d="M8 8 L 32 32" className="welcome-line welcome-line--green" />
              <path stroke="#00994D" d="M56 56 L 32 32" className="welcome-line welcome-line--green" />
            </g>

            {/* Central station outer ring & glowing core */}
            <circle cx="32" cy="32" r="10" fill="#16161f" className="welcome-station-ring" />
            <circle cx="32" cy="32" r="6.5" fill="#ffffff" className="welcome-station-core" />
          </svg>
        </div>
        <h1 className="welcome-screen-title">Metro Valencia</h1>
        <p className="welcome-screen-subtitle">Live Map & Real-time Arrivals</p>
      </div>
    </div>
  );
};

export default WelcomeScreen;
