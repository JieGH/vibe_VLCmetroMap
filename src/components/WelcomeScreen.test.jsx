import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import WelcomeScreen from './WelcomeScreen';

describe('WelcomeScreen component', () => {
  it('renders initial welcome screen with brand mark and title', () => {
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
  });
});
