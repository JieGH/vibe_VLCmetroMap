import { describe, it, expect } from 'vitest';
import { pinSvg, PIN_GREEN, PIN_WIDTH, PIN_HEIGHT } from './pinIcon';

describe('pinSvg', () => {
  it('is a green ball on a stick, not the red emoji', () => {
    const svg = pinSvg();
    expect(svg).toContain('<svg');
    expect(svg).toContain(PIN_GREEN);
    expect(svg).toContain('<circle');
    expect(svg).not.toContain('📍');
  });
  it('puts the stick tip on the bottom centre (the anchor)', () => {
    expect(pinSvg()).toContain(`L${PIN_WIDTH / 2} ${PIN_HEIGHT}`);
    expect(PIN_HEIGHT).toBeGreaterThan(PIN_WIDTH);
  });
});
