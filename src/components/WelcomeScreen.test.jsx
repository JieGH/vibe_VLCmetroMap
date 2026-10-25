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

  it('renders initial welcome screen with static Xarxa brand mark', () => {
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

    // Rounded icon box bounding rectangle
    expect(html).toContain('<rect');

    // Central station ring and core
    expect(html).toContain('r="10"');
    expect(html).toContain('r="6.5"');
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

  it('starts a delayed fade at once when ready from the start, completing at 500 + 200 ms', () => {
    const { onFade, onComplete } = start(true);
    expect(onFade).toHaveBeenCalledTimes(1);
    expect(onFade).toHaveBeenCalledWith(500);
    vi.advanceTimersByTime(699);
    expect(onComplete).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('fades with no delay at 1000 ms when ready never arrives', () => {
    const { onFade, onComplete } = start(false);
    vi.advanceTimersByTime(999);
    expect(onFade).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onFade).toHaveBeenCalledTimes(1);
    expect(onFade).toHaveBeenCalledWith(0);
    vi.advanceTimersByTime(199);
    expect(onComplete).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('fades at once with no delay when ready turns true at 700 ms', () => {
    const { schedule, onFade, onComplete } = start(false);
    vi.advanceTimersByTime(700);
    expect(onFade).not.toHaveBeenCalled();
    schedule.setReady(true);
    expect(onFade).toHaveBeenCalledTimes(1);
    expect(onFade).toHaveBeenCalledWith(0);
    vi.advanceTimersByTime(199);
    expect(onComplete).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('ready at 200 ms: onFade(300) at 200 ms, onComplete at 700 ms', () => {
    const { schedule, onFade, onComplete } = start(false);
    vi.advanceTimersByTime(200);
    expect(onFade).not.toHaveBeenCalled();
    schedule.setReady(true);
    expect(onFade).toHaveBeenCalledTimes(1);
    expect(onFade).toHaveBeenCalledWith(300);
    vi.advanceTimersByTime(499);
    expect(onComplete).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('measures elapsed time with an injectable clock', () => {
    vi.useFakeTimers();
    let t = 0;
    const onFade = vi.fn();
    const schedule = createWelcomeSchedule({ ready: false, onFade, onComplete: () => {}, now: () => t });
    t = 120;
    schedule.setReady(true);
    expect(onFade).toHaveBeenCalledWith(380);
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
    const { schedule, onFade, onComplete } = start(false);
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
