import { describe, it, expect } from 'vitest';
import { renderStationHighlight } from './focusNode';

describe('renderStationHighlight', () => {
  const properties = { name: 'Àngel Guimerà', lines: ['3', '5'] };

  it('renders the station name', () => {
    const html = renderStationHighlight(properties, 'dark');

    expect(html).toContain('Àngel Guimerà');
  });

  it('escapes HTML in the station name', () => {
    const html = renderStationHighlight({ name: '<b>Evil</b>', lines: [] }, 'dark');

    expect(html).not.toContain('<b>Evil</b>');
    expect(html).toContain('&lt;b&gt;Evil&lt;/b&gt;');
  });

  it('shows no arrival, countdown, or freshness data', () => {
    const html = renderStationHighlight(properties, 'dark');

    expect(html).not.toMatch(/\bmin\b/);
    expect(html).not.toContain('Live API');
    expect(html).not.toContain('From memory');
    expect(html).not.toContain('none');
  });

  it('falls back to a neutral color when the station serves no lines', () => {
    const html = renderStationHighlight({ name: 'Isolated', lines: [] }, 'dark');

    expect(html).toContain('#8a8a8a');
  });
});
