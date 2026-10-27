import { describe, it, expect } from 'vitest';
import { DEFAULT_MAP_ZOOM } from './mapCamera';
import { emtStage, EMT_MARKER_MIN_ZOOM, EMT_DOT_ENTER_ZOOM, EMT_DOT_EXIT_ZOOM, EMT_LINES_ENTER_ZOOM, EMT_LINES_EXIT_ZOOM } from './emtDotMode';

describe('emtStage', () => {
  it('builds EMT markers from below the opening zoom, and shows them as dots there', () => {
    expect(EMT_MARKER_MIN_ZOOM).toBeLessThanOrEqual(DEFAULT_MAP_ZOOM);
    expect(emtStage(DEFAULT_MAP_ZOOM, 'logo')).toBe('dot');
  });

  it('picks the stage from zoom when nothing was shown before', () => {
    expect(emtStage(12.5, 'logo')).toBe('dot');
    expect(emtStage(14.5, 'logo')).toBe('logo');
    expect(emtStage(17.5, 'logo')).toBe('lines');
  });

  it('turns to dots only below the dot enter threshold, back only past the exit threshold', () => {
    expect(emtStage(EMT_DOT_ENTER_ZOOM, 'logo')).toBe('logo');
    expect(emtStage(EMT_DOT_ENTER_ZOOM - 0.01, 'logo')).toBe('dot');
    expect(emtStage(EMT_DOT_EXIT_ZOOM - 0.01, 'dot')).toBe('dot');
    expect(emtStage(EMT_DOT_EXIT_ZOOM, 'dot')).toBe('logo');
  });

  it('switches logo to lines only at the lines enter threshold, back below the exit threshold', () => {
    expect(emtStage(EMT_LINES_ENTER_ZOOM - 0.01, 'logo')).toBe('logo');
    expect(emtStage(EMT_LINES_ENTER_ZOOM, 'logo')).toBe('lines');
    expect(emtStage(EMT_LINES_EXIT_ZOOM, 'lines')).toBe('lines');
    expect(emtStage(EMT_LINES_EXIT_ZOOM - 0.01, 'lines')).toBe('logo');
  });

  it('does not flap inside either hysteresis band', () => {
    let stage = 'logo';
    for (const z of [14.0, 13.91, 14.05]) {
      stage = emtStage(z, stage);
      expect(stage).toBe('logo');
    }
    stage = emtStage(13.89, stage);
    expect(stage).toBe('dot');
    for (const z of [13.95, 14.0, 14.09, 13.95]) {
      stage = emtStage(z, stage);
      expect(stage).toBe('dot');
    }
    stage = 'logo';
    for (const z of [14.9, 14.95, 14.99]) stage = emtStage(z, stage);
    expect(stage).toBe('logo');
    stage = emtStage(15.0, stage);
    for (const z of [14.9, 14.81, 14.95]) {
      stage = emtStage(z, stage);
      expect(stage).toBe('lines');
    }
  });

  it('handles jumps across several thresholds at once', () => {
    expect(emtStage(18, 'dot')).toBe('lines');
    expect(emtStage(13, 'lines')).toBe('dot');
    expect(emtStage(14.7, 'lines')).toBe('logo');
  });

  it('keeps a real gap between each pair of thresholds', () => {
    expect(EMT_DOT_EXIT_ZOOM).toBeGreaterThan(EMT_DOT_ENTER_ZOOM);
    expect(EMT_LINES_ENTER_ZOOM).toBeGreaterThan(EMT_LINES_EXIT_ZOOM);
    expect(EMT_LINES_EXIT_ZOOM).toBeGreaterThan(EMT_DOT_EXIT_ZOOM);
  });
});
