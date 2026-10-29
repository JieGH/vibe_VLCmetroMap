import { describe, it, expect } from 'vitest';
import { isLine19Focused } from './busFocus';

const stops = new Map([['9', { stopCode: '9', lines: ['19', '4'] }], ['8', { stopCode: '8', lines: ['4'] }]]);

describe('isLine19Focused', () => {
  it('is false with nothing selected', () => {
    expect(isLine19Focused({}, stops)).toBe(false);
  });
  it('is true for a selected stop that carries line 19', () => {
    expect(isLine19Focused({ selectedBusStop: { stopCode: '9', lines: ['19'] } }, stops)).toBe(true);
  });
  it('looks the stop up by code when the selection has no lines (line inspector stops)', () => {
    expect(isLine19Focused({ selectedBusStop: { stopCode: '9' } }, stops)).toBe(true);
    expect(isLine19Focused({ selectedBusStop: { code: '9' } }, stops)).toBe(true);
  });
  it('is false for a stop on other lines', () => {
    expect(isLine19Focused({ selectedBusStop: { stopCode: '8', lines: ['4'] } }, stops)).toBe(false);
  });
  it('is true when the line 19 chip was tapped', () => {
    expect(isLine19Focused({ activeBusLine: { id: '19' } }, stops)).toBe(true);
    expect(isLine19Focused({ activeBusLine: { id: '4' } }, stops)).toBe(false);
  });
});
