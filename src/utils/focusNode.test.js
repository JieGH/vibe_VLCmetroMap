import { describe, it, expect } from 'vitest';
import { renderFocusNode } from './focusNode';

describe('renderFocusNode', () => {
  const sampleFocus = {
    name: 'Àngel Guimerà',
    isFresh: true,
    directions: [
      {
        key: 'backward',
        destination: 'Aeroport',
        label: 'Aeroport',
        arrivals: [{ line: '3', destination: 'Aeroport', seconds: 120 }],
      },
      {
        key: 'forward',
        destination: 'Rafelbunyol',
        label: 'Rafelbunyol',
        arrivals: [{ line: '3', destination: 'Rafelbunyol', seconds: 300 }],
      },
    ],
  };

  it('renders station destination and line logo in each row', () => {
    const html = renderFocusNode(sampleFocus, 'dark');

    expect(html).toContain('Àngel Guimerà');
    expect(html).toContain('Aeroport');
    expect(html).toContain('Rafelbunyol');
    expect(html).toContain('L3');
    expect(html).toContain('2 min');
    expect(html).toContain('5 min');
  });

  it('strictly excludes the directional triangle glyph and bearing rotation', () => {
    const html = renderFocusNode(sampleFocus, 'dark');

    // Does not include triangle symbol or rotation style
    expect(html).not.toContain('&#9650;');
    expect(html).not.toContain('\u25B2');
    expect(html).not.toContain('transform:rotate');
  });

  it('displays the soonest arriving train in the first row', () => {
    const html = renderFocusNode(sampleFocus, 'dark');

    const aeroportIndex = html.indexOf('Aeroport');
    const rafelbunyolIndex = html.indexOf('Rafelbunyol');

    expect(aeroportIndex).toBeGreaterThan(-1);
    expect(rafelbunyolIndex).toBeGreaterThan(-1);
    // Aeroport (120s) appears before Rafelbunyol (300s)
    expect(aeroportIndex).toBeLessThan(rafelbunyolIndex);
  });
});
