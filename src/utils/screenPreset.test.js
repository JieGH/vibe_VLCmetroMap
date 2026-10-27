import { describe, it, expect } from 'vitest';
import {
  SCREEN_PRESET_THRESHOLDS,
  getScreenPreset,
  getInitialSidebarOpen,
  getPresetFontSize,
} from './screenPreset';

describe('getScreenPreset', () => {
  it('classifies a phone', () => {
    expect(getScreenPreset(390, 844)).toBe('phone');
    expect(getScreenPreset(844, 390)).toBe('phone');
  });
  it('classifies a tablet', () => {
    expect(getScreenPreset(820, 1180)).toBe('tablet');
    expect(getScreenPreset(1180, 820)).toBe('tablet');
  });
  it('classifies a 1920x1080 landscape screen as desktop', () => {
    expect(getScreenPreset(1920, 1080)).toBe('desktop');
  });
  it('does not treat a portrait wide-enough screen as desktop', () => {
    expect(getScreenPreset(1080, 1920)).toBe('tablet');
    expect(getScreenPreset(1600, 1700)).toBe('tablet');
  });
  it('switches exactly at the desktop width threshold', () => {
    const w = SCREEN_PRESET_THRESHOLDS.desktopMinWidth;
    expect(getScreenPreset(w, 900)).toBe('desktop');
    expect(getScreenPreset(w - 1, 900)).toBe('tablet');
  });
  it('switches exactly at the tablet width threshold', () => {
    const w = SCREEN_PRESET_THRESHOLDS.tabletMinShortSide;
    expect(getScreenPreset(1000, w)).toBe('tablet');
    expect(getScreenPreset(1000, w - 1)).toBe('phone');
  });
  it('falls back to phone for missing or invalid sizes', () => {
    expect(getScreenPreset()).toBe('phone');
    expect(getScreenPreset(NaN, NaN)).toBe('phone');
  });
});

describe('getInitialSidebarOpen', () => {
  it('opens only on desktop', () => {
    expect(getInitialSidebarOpen('desktop')).toBe(true);
    expect(getInitialSidebarOpen('tablet')).toBe(false);
    expect(getInitialSidebarOpen('phone')).toBe(false);
  });
  it('stays closed on native apps', () => {
    expect(getInitialSidebarOpen('desktop', { isNative: true })).toBe(false);
  });
});

describe('getPresetFontSize', () => {
  it('is large on desktop, default elsewhere', () => {
    expect(getPresetFontSize('desktop')).toBe('large');
    expect(getPresetFontSize('tablet')).toBe('default');
    expect(getPresetFontSize('phone')).toBe('default');
  });
  it('is unchanged on native apps', () => {
    expect(getPresetFontSize('desktop', { isNative: true })).toBe('default');
  });
});
