import { describe, it, expect } from 'vitest';
import { capStopLines, stopLinesMarkup, MAX_STOP_LINE_CHIPS } from './emtStopLines';

describe('capStopLines', () => {
  it('orders lines numerically, not as text', () => {
    expect(capStopLines(['81', '9', '31']).shown).toEqual(['9', '31', '81']);
  });

  it('puts lettered lines after numbered ones', () => {
    expect(capStopLines(['C1', '63', 'N2']).shown).toEqual(['63', 'C1', 'N2']);
  });

  it('shows everything up to the cap with no overflow', () => {
    const lines = ['1', '2', '3', '4', '5', '6'];
    expect(MAX_STOP_LINE_CHIPS).toBe(6);
    expect(capStopLines(lines)).toEqual({ shown: lines, extra: 0 });
  });

  it('beyond the cap keeps the chip count at the cap, the last chip being +N', () => {
    const r = capStopLines(['1', '2', '3', '4', '5', '6', '7', '8']);
    expect(r.shown).toEqual(['1', '2', '3', '4', '5']);
    expect(r.extra).toBe(3);
  });

  it('copes with missing, duplicate and blank lines', () => {
    expect(capStopLines(undefined)).toEqual({ shown: [], extra: 0 });
    expect(capStopLines(['31', '31', ' ', '']).shown).toEqual(['31']);
  });
});

describe('stopLinesMarkup', () => {
  it('is empty when the stop has no lines', () => {
    expect(stopLinesMarkup([])).toBe('');
  });

  it('renders one chip per line plus a +N chip', () => {
    const html = stopLinesMarkup(['1', '2', '3', '4', '5', '6', '7']);
    expect(html.match(/class="emt-stop-chip/g)).toHaveLength(6);
    expect(html).toContain('+2');
    expect(html).toContain('emt-stop-lines');
  });
});
