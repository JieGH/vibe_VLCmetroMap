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

  it('renders the metro logo and line badges', () => {
    const html = renderStationHighlight(properties, 'dark');
    expect(html).toContain('>m</span>');
    expect(html).toContain('3</span>');
    expect(html).toContain('5</span>');
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

  it('renders small EMT logo without bottom dash', () => {
    const html = renderBusStopHighlight(busStop, 'dark');
    expect(html).toContain('>EMT</span>');
    expect(html).not.toContain('border-bottom');
  });

  it('renders shortened stop name and bus line badges', () => {
    const html = renderBusStopHighlight(busStop, 'dark');
    expect(html).toContain('Ajunt…');
    expect(html).toContain('19</span>');
    expect(html).toContain('35</span>');
    expect(html).toContain('C1</span>');
  });

  it('escapes HTML in stop name', () => {
    const html = renderBusStopHighlight({ stopName: '<tag>', lines: [] }, 'light');
    expect(html).not.toContain('<tag>');
    expect(html).toContain('&lt;tag&gt;');
  });

  it('does not contain a leader line or target circle', () => {
    const html = renderBusStopHighlight(busStop, 'dark');
    expect(html).not.toContain('height:22px');
    expect(html).not.toContain('opacity:0.25');
  });
});
