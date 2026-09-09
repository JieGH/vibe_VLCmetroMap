import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import WelcomeScreen, {
  WELCOME_HOLD_DURATION_MS,
  WELCOME_FADE_DURATION_MS,
  WELCOME_TOTAL_DURATION_MS,
} from './WelcomeScreen';

describe('WelcomeScreen component', () => {

  it('exports 700ms hold duration and 1000ms total duration for splash screen', () => {
    expect(WELCOME_HOLD_DURATION_MS).toBe(700);
    expect(WELCOME_FADE_DURATION_MS).toBe(300);
    expect(WELCOME_TOTAL_DURATION_MS).toBe(1000);
  });

  it('renders initial welcome screen with Alameda-inspired hub fan-in art', () => {
    const html = renderToStaticMarkup(<WelcomeScreen onComplete={() => {}} />);

    // Container with accessibility role and test id
    expect(html).toContain('welcome-screen');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-label="Xarxa"');
    expect(html).toContain('data-testid="welcome-screen"');

    // Title and subtitle
    expect(html).toContain('Xarxa');
    expect(html).toContain('Real-time train tracking for the Valencia Metro');
    expect(html).not.toContain('Metro Valencia');
    expect(html).not.toContain('Live Map &amp; Real-time Arrivals');

    // Brand mark SVG colors (L3 red, L5 green, L7 orange, L9 brown)
    expect(html).toContain('#E2001A');
    expect(html).toContain('#00994D');
    expect(html).toContain('#F57C00');
    expect(html).toContain('#8B5A2B');

    // Four curved Lines fanning inward towards the central hub
    expect(html).toContain('welcome-hub-lines');
    expect(html).toContain('welcome-line');
    expect(html).toContain('welcome-line--l3');
    expect(html).toContain('welcome-line--l5');
    expect(html).toContain('welcome-line--l7');
    expect(html).toContain('welcome-line--l9');
    // Curved (quadratic) paths, not straight spokes
    expect(html).toMatch(/d="M [\d.]+ [\d.]+ Q /);

    // No icon box bounding rectangle (floating directly on welcome screen background)
    expect(html).not.toContain('<rect');

    // Static hub ring, unclipped SVG overflow — no spotlight glow, no orbiting dots
    expect(html).toContain('overflow:visible');
    expect(html).toContain('welcome-hub-ring');
    expect(html).not.toContain('welcome-station-spotlight');
    expect(html).not.toContain('welcomeSpotlightGlow');
    expect(html).not.toContain('welcome-station-core');
  });
});
