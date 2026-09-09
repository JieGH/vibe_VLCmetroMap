import React, { useEffect, useState } from 'react';

export const WELCOME_HOLD_DURATION_MS = 600;
export const WELCOME_FADE_DURATION_MS = 300;
export const WELCOME_TOTAL_DURATION_MS = WELCOME_HOLD_DURATION_MS + WELCOME_FADE_DURATION_MS;

/**
 * 0.6-Second Welcome / Splash Screen with Line-Draw & Central Station Spotlight
 *
 * Displays an animated brand mark showing metro lines drawing into the central interchange
 * station, which then blooms open like a spotlight before smoothly fading into the live map.
 */
const WelcomeScreen = ({ onComplete }) => {
  const [fading, setFading] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    // Hold splash screen for 600ms (0.6 second)
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
            width="88"
            height="88"
            className="welcome-screen-logo"
            aria-hidden="true"
          >
            <defs>
              {/* Radial spotlight glow radiating outward from the central station */}
              <radialGradient id="welcomeSpotlightGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
                <stop offset="35%" stopColor="#FFD100" stopOpacity="0.7" />
                <stop offset="70%" stopColor="#E2001A" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#1e1e2a" stopOpacity="0" />
              </radialGradient>
            </defs>

            <rect width="64" height="64" rx="16" fill="#1e1e2a" />

            {/* Expanding spotlight halo centered at the interchange station (32, 32) */}
            <circle
              cx="32"
              cy="32"
              r="22"
              fill="url(#welcomeSpotlightGlow)"
              className="welcome-station-spotlight"
            />

            {/* Inward transit line paths: drawn from outer edges to central station (32, 32) */}
            <g fill="none" strokeLinecap="round" strokeWidth="7.5" className="welcome-metro-lines">
              {/* Line 3 (Red) diagonal */}
              <path stroke="#E2001A" d="M11 53 L 32 32" className="welcome-line welcome-line--red-1" />
              <path stroke="#E2001A" d="M53 11 L 32 32" className="welcome-line welcome-line--red-2" />

              {/* Line 1 (Yellow) horizontal */}
              <path stroke="#FFD100" d="M9 32 L 32 32" className="welcome-line welcome-line--yellow-1" />
              <path stroke="#FFD100" d="M55 32 L 32 32" className="welcome-line welcome-line--yellow-2" />

              {/* Line 5 (Green) diagonal */}
              <path stroke="#00994D" d="M11 11 L 32 32" className="welcome-line welcome-line--green-1" />
              <path stroke="#00994D" d="M53 53 L 32 32" className="welcome-line welcome-line--green-2" />
            </g>

            {/* Central interchange station outer ring & glowing core */}
            <circle cx="32" cy="32" r="10" fill="#1e1e2a" className="welcome-station-ring" />
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
