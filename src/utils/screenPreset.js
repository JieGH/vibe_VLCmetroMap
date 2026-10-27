import { DEFAULT_FONT_SIZE } from './fontSize';

// Viewport thresholds in one place. Desktop needs a wide LANDSCAPE screen
// (1080p-class is 1920x1080); a tall, narrow window of the same width is not.
// Tablet vs phone uses the short side so a landscape phone stays a phone.
export const SCREEN_PRESET_THRESHOLDS = {
  desktopMinWidth: 1600,
  tabletMinShortSide: 600,
};

/** Maps viewport size to 'phone' | 'tablet' | 'desktop'. */
export const getScreenPreset = (width, height) => {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return 'phone';
  if (width >= SCREEN_PRESET_THRESHOLDS.desktopMinWidth && width > height) return 'desktop';
  if (Math.min(width, height) >= SCREEN_PRESET_THRESHOLDS.tabletMinShortSide) return 'tablet';
  return 'phone';
};

/** Sidebar starts open on desktop web only; native apps are unchanged. */
export const getInitialSidebarOpen = (preset, { isNative = false } = {}) =>
  !isNative && preset === 'desktop';

/** First-launch text size for a preset (used only when none is saved). */
export const getPresetFontSize = (preset, { isNative = false } = {}) =>
  !isNative && preset === 'desktop' ? 'large' : DEFAULT_FONT_SIZE;

/** Current window's preset; 'phone' when there is no window. */
export const getWindowScreenPreset = () =>
  typeof window === 'undefined' ? 'phone' : getScreenPreset(window.innerWidth, window.innerHeight);
