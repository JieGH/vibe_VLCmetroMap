import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  isIosDevice, wasBannerDismissed, rememberBannerDismissed, APP_BANNER_DISMISSED_KEY, APK_URL,
} from './appDownload';

afterEach(() => vi.unstubAllGlobals());

describe('isIosDevice', () => {
  it('recognises iPhones and iPads, including iPadOS posing as a Mac', () => {
    expect(isIosDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe(true);
    expect(isIosDevice('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')).toBe(true);
    expect(isIosDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe(true);
  });

  it('does not take Android phones or desktops for iOS', () => {
    expect(isIosDevice('Mozilla/5.0 (Linux; Android 14; Pixel 8)')).toBe(false);
    expect(isIosDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe(false);
  });
});

describe('banner dismissal', () => {
  const stubStorage = (store) => vi.stubGlobal('window', {
    localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } },
  });

  it('is remembered once dismissed', () => {
    stubStorage({});
    expect(wasBannerDismissed()).toBe(false);
    rememberBannerDismissed();
    expect(wasBannerDismissed()).toBe(true);
  });

  it('reads storage under its own key', () => {
    stubStorage({ [APP_BANNER_DISMISSED_KEY]: '1' });
    expect(wasBannerDismissed()).toBe(true);
  });

  it('still works when storage throws', () => {
    vi.stubGlobal('window', { localStorage: { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } } });
    expect(wasBannerDismissed()).toBe(false);
    expect(() => rememberBannerDismissed()).not.toThrow();
  });
});

describe('download link', () => {
  it('points at the APK attached to a GitHub release', () => {
    expect(APK_URL).toMatch(/^https:\/\/github\.com\/JieGH\/vibe_VLCmetroMap\/releases\/download\/.+\.apk$/);
  });
});
