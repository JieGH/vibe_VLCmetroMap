import { describe, it, expect } from 'vitest';
import {
  shortenStopName,
  renderStationHighlight,
  renderBusStopHighlight,
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

  it('stacks bus line badges in a 2-column grid layout when more than 2 lines are present', () => {
    const multiLineStop = { stopCode: '1024', lines: ['19', 'C1', '92'] };
    const html = renderBusStopHighlight(multiLineStop, 'dark');
    expect(html).toContain('grid-template-columns:repeat(2, auto)');

    const twoLineStop = { stopCode: '1025', lines: ['19', 'C1'] };
    const twoLineHtml = renderBusStopHighlight(twoLineStop, 'dark');
    expect(twoLineHtml).toContain('display:flex');
    expect(twoLineHtml).not.toContain('grid-template-columns');
  });
});
