import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi, afterEach } from 'vitest';
import WelcomeScreen, {
  WELCOME_MIN_HOLD_MS,
  WELCOME_MAX_HOLD_MS,
  WELCOME_FADE_DURATION_MS,
} from './WelcomeScreen';
import {
  WELCOME_SEEN_KEY,
  createWelcomeSchedule,
  hasSeenWelcome,
  markWelcomeSeen,
} from '../utils/welcomeSchedule';

describe('WelcomeScreen component', () => {

  it('exports a 500ms minimum hold, 1000ms maximum hold and 200ms fade for the splash screen', () => {
    expect(WELCOME_MIN_HOLD_MS).toBe(500);
    expect(WELCOME_MAX_HOLD_MS).toBe(1000);
    expect(WELCOME_FADE_DURATION_MS).toBe(200);
  });

  it('renders initial welcome screen with line-draw paths and central station spotlight', () => {
    const html = renderToStaticMarkup(<WelcomeScreen onComplete={() => {}} />);

    // Container with accessibility role and test id
    expect(html).toContain('welcome-screen');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-label="Xarxa"');
    expect(html).toContain('data-testid="welcome-screen"');

    // Title and subtitle
    expect(html).toContain('Xarxa');
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

    // No icon box bounding rectangle (floating directly on welcome screen background)
    expect(html).not.toContain('<rect');

    // Central station core, unclipped SVG overflow, and spotlight glow elements
    expect(html).toContain('overflow:visible');
    expect(html).toContain('welcome-station-spotlight');
    expect(html).toContain('welcomeSpotlightGlow');
    expect(html).toContain('welcome-station-ring');
    expect(html).toContain('welcome-station-core');
  });
});

// The repo has no DOM test environment, so the dismissal timing is tested at
// its pure seam: the schedule the component starts on mount and feeds `ready`.
describe('WelcomeScreen dismissal schedule', () => {
  afterEach(() => vi.useRealTimers());

  const start = (ready) => {
    vi.useFakeTimers();
    const onFade = vi.fn();
    const onComplete = vi.fn();
    const schedule = createWelcomeSchedule({ ready, onFade, onComplete });
    return { schedule, onFade, onComplete };
  };

  it('dismisses at 500 + 200 ms when ready from the start', () => {
    const { onFade, onComplete } = start(true);
    vi.advanceTimersByTime(499);
    expect(onFade).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onFade).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(199);
    expect(onComplete).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('dismisses at 1000 + 200 ms when ready never arrives', () => {
    const { onFade, onComplete } = start(false);
    vi.advanceTimersByTime(999);
    expect(onFade).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onFade).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(199);
    expect(onComplete).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('dismisses at 700 + 200 ms when ready turns true at 700 ms', () => {
    const { schedule, onFade, onComplete } = start(false);
    vi.advanceTimersByTime(700);
    expect(onFade).not.toHaveBeenCalled();
    schedule.setReady(true);
    expect(onFade).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(199);
    expect(onComplete).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('waits out the minimum hold when ready turns true early', () => {
    const { schedule, onFade } = start(false);
    vi.advanceTimersByTime(100);
    schedule.setReady(true);
    vi.advanceTimersByTime(399);
    expect(onFade).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onFade).toHaveBeenCalledTimes(1);
  });

  it('calls onComplete exactly once however long it runs', () => {
    const { schedule, onFade, onComplete } = start(true);
    vi.advanceTimersByTime(600);
    schedule.setReady(true);
    schedule.setReady(false);
    vi.advanceTimersByTime(5000);
    expect(onFade).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('fires nothing after cancel', () => {
    const { schedule, onFade, onComplete } = start(true);
    schedule.cancel();
    vi.advanceTimersByTime(5000);
    expect(onFade).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });
});

describe('WelcomeScreen session flag', () => {
  const fakeStorage = () => {
    const data = new Map();
    return {
      getItem: (k) => (data.has(k) ? data.get(k) : null),
      setItem: (k, v) => data.set(k, String(v)),
    };
  };

  it('is unseen in a fresh session and seen once marked', () => {
    const storage = fakeStorage();
    expect(hasSeenWelcome(storage)).toBe(false);
    markWelcomeSeen(storage);
    expect(storage.getItem('xarxa_welcome_seen')).toBe('1');
    expect(WELCOME_SEEN_KEY).toBe('xarxa_welcome_seen');
    expect(hasSeenWelcome(storage)).toBe(true);
  });

  it('treats unavailable storage as unseen and never throws', () => {
    const broken = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
    };
    expect(hasSeenWelcome(broken)).toBe(false);
    expect(() => markWelcomeSeen(broken)).not.toThrow();
  });
});
