import { describe, it, expect } from 'vitest';
import { zoomCurve, dotScale, trainScale } from './zoomCurve';

describe('zoomCurve', () => {
  it('is linear below the knee and hidden at 7.5', () => {
    expect(zoomCurve(7.5)).toBe(0);
    expect(zoomCurve(5)).toBe(0);
    expect(zoomCurve(9.5)).toBeCloseTo(0.5);
  });
  it('is continuous at 12.3 and keeps growing slowly', () => {
    expect(zoomCurve(12.3)).toBeCloseTo(1.2);
    expect(zoomCurve(12.3001)).toBeCloseTo(1.2, 3);
    expect(zoomCurve(14.3)).toBeCloseTo(1.44);
  });
  it('scales dots and trains by 0.85 with trains at 1.1/1.2', () => {
    expect(dotScale(12.3)).toBeCloseTo(1.02);
    expect(trainScale(12.3)).toBeCloseTo(0.935);
  });
});
