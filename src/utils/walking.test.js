import { describe, it, expect } from 'vitest';
import { walkingMinutes, formatDistance, walkCategory } from './walking';

describe('walking', () => {
  it('rounds minutes up with a floor of 1', () => {
    expect(walkingMinutes(0)).toBe(1);
    expect(walkingMinutes(75)).toBe(1);
    expect(walkingMinutes(76)).toBe(2);
    expect(walkingMinutes(375)).toBe(5);
  });
  it('formats distance', () => {
    expect(formatDistance(316.4)).toBe('316 m');
    expect(formatDistance(1234, 'en')).toBe('1.2 km');
    expect(formatDistance(1234, 'es')).toBe('1,2 km');
  });
  it('categorises', () => {
    expect(walkCategory(5)).toBe('short');
    expect(walkCategory(6)).toBe('medium');
    expect(walkCategory(15)).toBe('medium');
    expect(walkCategory(16)).toBe('long');
  });
});
