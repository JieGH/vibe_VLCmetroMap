import React, { useEffect, useState } from 'react';

export const WELCOME_HOLD_DURATION_MS = 700;
export const WELCOME_FADE_DURATION_MS = 300;
export const WELCOME_TOTAL_DURATION_MS = WELCOME_HOLD_DURATION_MS + WELCOME_FADE_DURATION_MS;

// Alameda — Metrovalencia's real four-Line interchange — inspires the fan of
// curved Lines into a central hub. Angles/colors are stylized, not a
// geometrically accurate track diagram.
const HUB_LINES = [
  { color: '#E2001A', angle: 25, key: 'l3' }, // L3
  { color: '#00994D', angle: 130, key: 'l5' }, // L5
  { color: '#F57C00', angle: 220, key: 'l7' }, // L7
  { color: '#8B5A2B', angle: 310, key: 'l9' }, // L9
];
const HUB_CX = 80;
const HUB_CY = 80;
const toXY = (deg, r) => {
  const rad = (deg - 90) * (Math.PI / 180);
  return [HUB_CX + r * Math.cos(rad), HUB_CY + r * Math.sin(rad)];
};

/**
 * "Xarxa" Alameda-inspired welcome / splash screen.
 *
 * Displays an animated brand mark of four curved Lines fanning inward into a
 * static hub ring, then collapses and fades as the live map takes over.
 */
const WelcomeScreen = ({ onComplete }) => {
  const [fading, setFading] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    // Hold splash screen for 700ms; +300ms fade = 1.0s total
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
      aria-label="Xarxa"
      data-testid="welcome-screen"
    >
      <div className="welcome-screen-content">
        <div className="welcome-screen-logo-wrap">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 160 160"
            className="welcome-screen-logo"
            aria-hidden="true"
            style={{ overflow: 'visible' }}
          >
            {/* Four Lines fanning inward from the edge to the hub, curved via a quadratic control point */}
            <g fill="none" strokeLinecap="round" strokeWidth="5" className="welcome-hub-lines">
              {HUB_LINES.map(({ color, angle, key }, i) => {
                const [x0, y0] = toXY(angle, 78);
                const [mx, my] = toXY(angle, 40);
                return (
                  <path
                    key={key}
                    stroke={color}
                    pathLength="100"
                    d={`M ${x0} ${y0} Q ${mx} ${my} ${HUB_CX} ${HUB_CY}`}
                    className={`welcome-line welcome-line--${key}`}
                    style={{ animationDelay: `${i * 0.05}s` }}
                  />
                );
              })}
            </g>

            {/* Static hub ring once the Lines have drawn in — no orbiting dots */}
            <circle
              cx={HUB_CX}
              cy={HUB_CY}
              r="16"
              fill="#16161f"
              stroke="#ffffff"
              strokeWidth="2.5"
              className="welcome-hub-ring"
            />
          </svg>
        </div>
        <h1 className="welcome-screen-title">Xarxa</h1>
        <p className="welcome-screen-subtitle">Real-time train tracking for the Valencia Metro</p>
      </div>
    </div>
  );
};

export default WelcomeScreen;
