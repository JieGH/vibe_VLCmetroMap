import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import WelcomeScreen, {
  WELCOME_HOLD_DURATION_MS,
  WELCOME_FADE_DURATION_MS,
  WELCOME_TOTAL_DURATION_MS,
} from './WelcomeScreen';

describe('WelcomeScreen component', () => {

  it('exports 600ms hold duration for snappy startup', () => {
    expect(WELCOME_HOLD_DURATION_MS).toBe(600);
    expect(WELCOME_FADE_DURATION_MS).toBe(300);
    expect(WELCOME_TOTAL_DURATION_MS).toBe(900);
  });

  it('renders initial welcome screen with line-draw paths and central station spotlight', () => {
    const html = renderToStaticMarkup(<WelcomeScreen onComplete={() => {}} />);

    // Container with accessibility role and test id
    expect(html).toContain('welcome-screen');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-label="Metro Valencia"');
    expect(html).toContain('data-testid="welcome-screen"');

    // Title and subtitle
    expect(html).toContain('Metro Valencia');
    expect(html).toContain('Live Map &amp; Real-time Arrivals');

    // Brand mark SVG colors (Line 3 red, Line 1 yellow, Line 5 green)
    expect(html).toContain('#E2001A');
    expect(html).toContain('#FFD100');
    expect(html).toContain('#00994D');

    // Animated transit lines converging towards center (32, 32)
    expect(html).toContain('welcome-metro-lines');
    expect(html).toContain('welcome-line');
    expect(html).toContain('welcome-line--red');
    expect(html).toContain('welcome-line--yellow');
    expect(html).toContain('welcome-line--green');

    // Central station core, unclipped SVG overflow, and spotlight glow elements
    expect(html).toContain('overflow:visible');
    expect(html).toContain('welcome-station-spotlight');
    expect(html).toContain('welcomeSpotlightGlow');
    expect(html).toContain('welcome-station-ring');
    expect(html).toContain('welcome-station-core');
  });
});
