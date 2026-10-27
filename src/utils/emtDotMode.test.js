import { describe, it, expect } from 'vitest';
import { emtStage, EMT_DOT_ENTER_ZOOM, EMT_DOT_EXIT_ZOOM, EMT_LINES_ENTER_ZOOM, EMT_LINES_EXIT_ZOOM } from './emtDotMode';

describe('emtStage', () => {
  it('picks the stage from zoom when nothing was shown before', () => {
    expect(emtStage(12.5, 'logo')).toBe('dot');
    expect(emtStage(15, 'logo')).toBe('logo');
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
    for (const z of [14.5, 14.41, 14.55]) {
      stage = emtStage(z, stage);
      expect(stage).toBe('logo');
    }
    stage = emtStage(14.39, stage);
    expect(stage).toBe('dot');
    for (const z of [14.45, 14.5, 14.59, 14.45]) {
      stage = emtStage(z, stage);
      expect(stage).toBe('dot');
    }
    stage = 'logo';
    for (const z of [16.4, 16.45, 16.49]) stage = emtStage(z, stage);
    expect(stage).toBe('logo');
    stage = emtStage(16.5, stage);
    for (const z of [16.4, 16.31, 16.45]) {
      stage = emtStage(z, stage);
      expect(stage).toBe('lines');
    }
  });

  it('handles jumps across several thresholds at once', () => {
    expect(emtStage(18, 'dot')).toBe('lines');
    expect(emtStage(13, 'lines')).toBe('dot');
    expect(emtStage(15.5, 'lines')).toBe('logo');
  });

  it('keeps a real gap between each pair of thresholds', () => {
    expect(EMT_DOT_EXIT_ZOOM).toBeGreaterThan(EMT_DOT_ENTER_ZOOM);
    expect(EMT_LINES_ENTER_ZOOM).toBeGreaterThan(EMT_LINES_EXIT_ZOOM);
    expect(EMT_LINES_EXIT_ZOOM).toBeGreaterThan(EMT_DOT_EXIT_ZOOM);
  });
});
