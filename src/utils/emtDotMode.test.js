import { describe, it, expect } from 'vitest';
import { emtDotMode, EMT_DOT_ENTER_ZOOM, EMT_DOT_EXIT_ZOOM } from './emtDotMode';

describe('emtDotMode', () => {
  it('stays full-badge above the enter threshold and turns to dots below it', () => {
    expect(emtDotMode(16, false)).toBe(false);
    expect(emtDotMode(EMT_DOT_ENTER_ZOOM, false)).toBe(false);
    expect(emtDotMode(EMT_DOT_ENTER_ZOOM - 0.01, false)).toBe(true);
    expect(emtDotMode(12.5, false)).toBe(true);
  });

  it('returns to badges only once past the exit threshold', () => {
    expect(emtDotMode(EMT_DOT_EXIT_ZOOM - 0.01, true)).toBe(true);
    expect(emtDotMode(EMT_DOT_EXIT_ZOOM, true)).toBe(false);
    expect(emtDotMode(18, true)).toBe(false);
  });

  it('does not flap inside the hysteresis band', () => {
    let dots = false;
    for (const z of [14.5, 14.45, 14.41, 14.5, 14.55]) {
      dots = emtDotMode(z, dots);
      expect(dots).toBe(false);
    }
    dots = emtDotMode(14.39, dots);
    expect(dots).toBe(true);
    for (const z of [14.45, 14.5, 14.59, 14.45]) {
      dots = emtDotMode(z, dots);
      expect(dots).toBe(true);
    }
    expect(emtDotMode(14.6, dots)).toBe(false);
  });

  it('keeps a real gap between the thresholds', () => {
    expect(EMT_DOT_EXIT_ZOOM).toBeGreaterThan(EMT_DOT_ENTER_ZOOM);
  });
});
