import { describe, it, expect } from 'vitest';
import { BUS_ARRIVING_MAX_SECONDS, isBusArriving, busCountdownLabel, busCountdownUnit } from './busCountdown';

describe('bus countdown: Arriving only at 20 s or less', () => {
  it('uses 20 seconds', () => {
    expect(BUS_ARRIVING_MAX_SECONDS).toBe(20);
  });
  it('is arriving at 0 to 20 s and not at 21 s or more', () => {
    expect(isBusArriving(0)).toBe(true);
    expect(isBusArriving(20)).toBe(true);
    expect(isBusArriving(21)).toBe(false);
    expect(isBusArriving(30)).toBe(false);
    expect(isBusArriving(null)).toBe(false);
  });
  it('labels Arriving up to 20 s, then seconds, then minutes', () => {
    expect(busCountdownLabel(20, 'Due')).toBe('Due');
    expect(busCountdownLabel(30, 'Due')).toBe('30');
    expect(busCountdownLabel(59, 'Due')).toBe('59');
    expect(busCountdownLabel(60, 'Due')).toBe('1');
    expect(busCountdownLabel(300, 'Due')).toBe('5');
  });
  it('has a unit only once it reads as a number', () => {
    expect(busCountdownUnit(20)).toBeNull();
    expect(busCountdownUnit(30)).toBe('sec');
    expect(busCountdownUnit(60)).toBe('min');
  });
});
