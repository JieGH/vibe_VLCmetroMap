import { describe, it, expect } from 'vitest';
import { pinSvg, pinMarkup, PIN_GREEN, PIN_WIDTH, PIN_HEIGHT } from './pinIcon';

describe('pinSvg', () => {
  it('is a green ball on a stick, not the red emoji', () => {
    const svg = pinSvg();
    expect(svg).toContain('<svg');
    expect(svg).toContain(PIN_GREEN);
    expect(svg).toContain('<circle');
    expect(svg).not.toContain('📍');
  });
  it('puts the stick tip on the bottom centre (the anchor)', () => {
    expect(pinSvg()).toContain(`L${PIN_WIDTH / 2} ${PIN_HEIGHT}"`);
    expect(PIN_HEIGHT).toBeGreaterThan(PIN_WIDTH);
  });
  it('is flat: no gradient, gloss, halo, filter or triangle/teardrop path', () => {
    const svg = pinSvg();
    expect(svg).not.toMatch(/gradient|filter|ellipse|opacity|#fff/i);
    expect(svg.match(/<path/g)).toHaveLength(1);
    expect(svg.match(/ d="([^"]*)"/)[1]).toMatch(/^M[\d.]+ [\d.]+ L[\d.]+ [\d.]+$/);
    expect(svg).toContain('fill="none"');
  });
  it('wraps in a drop span so animation never fights the positioning transform', () => {
    expect(pinMarkup()).toContain('class="map-pin-drop"');
    expect(pinMarkup()).toContain('<svg');
  });
});
