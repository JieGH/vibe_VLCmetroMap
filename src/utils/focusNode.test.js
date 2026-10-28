import { describe, it, expect } from 'vitest';
import {
  shortenStopName,
  renderStationHighlight,
  renderBusStopHighlight,
  chipGridLayout,
  highlightChips,
} from './focusNode';

describe('shortenStopName', () => {
  it('strips common street prefixes', () => {
    expect(shortenStopName("Carrer de Russafa")).toBe('Russa…');
    expect(shortenStopName("C/ Xàtiva")).toBe('Xàtiva');
    expect(shortenStopName("Pl. de l'Ajuntament")).toBe('Ajunt…');
    expect(shortenStopName("Plaça de l'Ajuntament")).toBe('Ajunt…');
    expect(shortenStopName("Avinguda del Port")).toBe('Port');
    expect(shortenStopName("Av. de França")).toBe('França');
  });

  it('keeps short names intact within maxChars limit', () => {
    expect(shortenStopName('Xàtiva')).toBe('Xàtiva');
    expect(shortenStopName('Colón')).toBe('Colón');
    expect(shortenStopName('Bailén')).toBe('Bailén');
  });

  it('extracts primary word when it fits', () => {
    expect(shortenStopName('Àngel Guimerà')).toBe('Àngel');
  });

  it('strips secondary subtitles after hyphen or slash', () => {
    expect(shortenStopName('Facultats - Manuel Broseta')).toBe('Facul…');
    expect(shortenStopName('Marítim - Serrería')).toBe('Marít…');
  });

  it('handles null, undefined, or empty names', () => {
    expect(shortenStopName(null)).toBe('');
    expect(shortenStopName('')).toBe('');
    expect(shortenStopName(undefined)).toBe('');
  });
});

describe('renderStationHighlight', () => {
  const properties = { name: 'Àngel Guimerà', lines: ['3', '5'] };

  it('renders the shortened station name', () => {
    const html = renderStationHighlight(properties, 'dark');
    expect(html).toContain('Àngel');
  });

  it('renders the line badges and omits redundant transport logo', () => {
    const html = renderStationHighlight(properties, 'dark');
    expect(html).toContain('3</span>');
    expect(html).toContain('5</span>');
    expect(html).not.toContain('>m</span>'); // omitted since map already has logo
  });

  it('escapes HTML in the station name', () => {
    const html = renderStationHighlight({ name: '<tag>', lines: [] }, 'dark');
    expect(html).not.toContain('<tag>');
    expect(html).toContain('&lt;tag&gt;');
  });

  it('shows no arrival, countdown, or leader line', () => {
    const html = renderStationHighlight(properties, 'dark');
    expect(html).not.toMatch(/\bmin\b/);
    expect(html).not.toContain('Live API');
    expect(html).not.toContain('height:22px'); // Leader line removed
  });
});

describe('renderBusStopHighlight', () => {
  const busStop = {
    stopCode: '1024',
    stopName: "Plaça de l'Ajuntament",
    lines: ['19', '35', 'C1'],
  };

  it('omits redundant transport logo and stop ID to save space in small bubble view', () => {
    const html = renderBusStopHighlight(busStop, 'dark');
    expect(html).not.toContain('>EMT</span>');
    expect(html).not.toContain('P-1024');
  });

  it('renders line badges in consistent EMT red without stop name text', () => {
    const html = renderBusStopHighlight(busStop, 'dark');
    // Stop name text removed
    expect(html).not.toContain('Ajunt…');
    expect(html).not.toContain("Plaça de l'Ajuntament");
    // Line badges in consistent EMT red, no blue background
    expect(html).toContain('19</span>');
    expect(html).toContain('35</span>');
    expect(html).toContain('C1</span>');
    expect(html).toContain('background:#D62828');
    expect(html).not.toContain('#1976D2');
  });

  it('falls back gracefully to Bus placeholder when lines are empty', () => {
    const html = renderBusStopHighlight({ stopCode: '1024', lines: [] }, 'light');
    expect(html).toContain('Bus</span>');
  });

  it('does not contain a leader line or target circle', () => {
    const html = renderBusStopHighlight(busStop, 'dark');
    expect(html).not.toContain('height:22px');
    expect(html).not.toContain('opacity:0.25');
  });

  it('lays line chips out by the one grid rule (see chipGridLayout)', () => {
    const one = renderBusStopHighlight({ stopCode: '1', lines: ['19'] }, 'dark', true);
    expect(one).toContain('--focus-cols:1');
    const two = renderBusStopHighlight({ stopCode: '2', lines: ['19', 'C1'] }, 'dark', true);
    expect(two).toContain('--focus-cols:2');
    expect(two).not.toContain('focus-chip-last-odd');
    const three = renderBusStopHighlight({ stopCode: '3', lines: ['19', 'C1', '92'] }, 'dark', true);
    expect(three).toContain('--focus-cols:2');
    expect(three.match(/focus-chip-last-odd/g)).toHaveLength(1);
  });

  it('draws the same box whether or not the stop is flagged selected (one layout)', () => {
    const selected = renderBusStopHighlight(busStop, 'dark', true);
    expect(selected).toContain('is-selected');
    expect(selected).toContain('border:1px solid rgba(255,255,255,0.7)');
    expect(selected).toContain('class="focus-chip-grid"');
  });
});

describe('highlightChips and chipGridLayout (one layout for 1..8 lines)', () => {
  const lines = (n) => Array.from({ length: n }, (_, i) => String(i + 1));

  it('caps at 6 chips with the +N rule of emtStopLines', () => {
    expect(highlightChips(lines(6)).map((c) => c.label)).toEqual(['1', '2', '3', '4', '5', '6']);
    expect(highlightChips(lines(7)).map((c) => c.label)).toEqual(['1', '2', '3', '4', '5', '+2']);
    expect(highlightChips(lines(8)).map((c) => c.label)).toEqual(['1', '2', '3', '4', '5', '+3']);
    expect(highlightChips(lines(8))[5].isMore).toBe(true);
  });

  it('accepts line objects and sorts numerically', () => {
    expect(highlightChips([{ line: '31' }, { id: '9' }]).map((c) => c.label)).toEqual(['9', '31']);
  });

  it.each([
    [0, 1, 0, -1],
    [1, 1, 1, -1],
    [2, 2, 1, -1],
    [3, 2, 2, 2],
    [4, 2, 2, -1],
    [5, 2, 3, 4],
    [6, 2, 3, -1],
  ])('%i chips: %i column(s), %i row(s), centred last index %i', (count, columns, rows, lastOddIndex) => {
    expect(chipGridLayout(count)).toEqual({ columns, rows, lastOddIndex });
  });

  it('never leaves an empty grid cell for 1..8 lines', () => {
    for (let n = 1; n <= 8; n += 1) {
      const count = highlightChips(lines(n)).length;
      const { columns, rows, lastOddIndex } = chipGridLayout(count);
      // Either every row is full, or the single odd chip is the last one and spans both columns.
      if (columns === 1) expect(lastOddIndex).toBe(-1);
      else if (count % 2 === 1) expect(lastOddIndex).toBe(count - 1);
      else expect(lastOddIndex).toBe(-1);
      expect(rows).toBe(Math.ceil(count / columns));
    }
  });

  it('renders at most 6 chips for 8 lines, the last one the +N chip', () => {
    const html = renderBusStopHighlight({ lines: lines(8) }, 'dark', true);
    expect(html.match(/class="focus-chip[" ]/g)).toHaveLength(6);
    expect(html).toContain('+3</span>');
  });
});

describe('renderStationHighlight uses the same chip grid', () => {
  it('draws metro line chips as focus-chips in the same grid', () => {
    const html = renderStationHighlight({ name: 'Xàtiva', lines: ['3', '5', '9'] }, 'dark', true);
    expect(html).toContain('class="focus-chip-grid"');
    expect(html).toContain('--focus-cols:2');
    expect(html.match(/focus-chip-last-odd/g)).toHaveLength(1);
  });
});

describe('chosen-stop highlight has no caret (anchored on the stop, no offset)', () => {
  it('renders no pointing caret for a station or a bus stop', () => {
    const station = renderStationHighlight({ name: 'Xàtiva', lines: ['3'] }, 'light', true);
    const bus = renderBusStopHighlight({ stopCode: '1', lines: ['9'] }, 'light', true);
    expect(station).not.toContain('border-top');
    expect(bus).not.toContain('border-top');
  });
});
