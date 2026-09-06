import { describe, it, expect } from 'vitest';
import { countdownHeat, HEAT_BANDS, HEAT_BACKDROP } from './countdownHeat';

// WCAG 2.2 SC 1.4.3 (Contrast Minimum), the 4.5:1 text threshold.
const relativeLuminance = (hex) => {
  const c = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4]
    .map((i) => parseInt(c.substr(i, 2), 16) / 255)
    .map((x) => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrastRatio = (a, b) => {
  const [l1, l2] = [relativeLuminance(a), relativeLuminance(b)];
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};

describe('countdown heat', () => {
  // The reason there are two ramps rather than one. A single palette cannot
  // clear 4.5:1 on both themes — the amber this ramp is built around measures
  // 1.80:1 on white — so re-tuning either ramp by eye has to fail here.
  it.each(['dark', 'light'])('keeps every band readable on the %s theme', (theme) => {
    for (const band of HEAT_BANDS) {
      const colour = countdownHeat(band.maxSeconds === Infinity ? 9999 : band.maxSeconds, theme);
      expect(
        contrastRatio(colour, HEAT_BACKDROP[theme]),
        `${theme} ${band.key} (${colour})`
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('runs hot when a train is due and cool when it is far off', () => {
    expect(countdownHeat(0, 'dark')).toBe(countdownHeat(-30, 'dark'));
    expect(countdownHeat(0, 'dark')).not.toBe(countdownHeat(9999, 'dark'));
  });

  it('places a countdown in the band its seconds fall in', () => {
    // Boundaries are inclusive at the top of each band.
    expect(countdownHeat(120, 'dark')).toBe(countdownHeat(60, 'dark'));
    expect(countdownHeat(121, 'dark')).not.toBe(countdownHeat(120, 'dark'));
    expect(countdownHeat(600, 'dark')).not.toBe(countdownHeat(601, 'dark'));
  });

  it('gives every band a distinct colour, so the ramp is readable as a ramp', () => {
    for (const theme of ['dark', 'light']) {
      const colours = HEAT_BANDS.map((b) =>
        countdownHeat(b.maxSeconds === Infinity ? 9999 : b.maxSeconds, theme)
      );
      expect(new Set(colours).size, theme).toBe(HEAT_BANDS.length);
    }
  });

  it('falls back to the dark ramp rather than returning nothing', () => {
    expect(countdownHeat(60, undefined)).toBe(countdownHeat(60, 'dark'));
    expect(countdownHeat(60, 'sepia')).toBe(countdownHeat(60, 'dark'));
  });
});
