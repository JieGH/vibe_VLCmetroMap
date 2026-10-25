import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import SearchBar from './SearchBar';

describe('SearchBar component', () => {
  it('renders search input with accessible placeholder and search icon', () => {
    const html = renderToStaticMarkup(
      <SearchBar
        onSelectStation={() => {}}
        onSelectLine={() => {}}
        activeLineFilter={[]}
        selectedStation={null}
      />
    );

    expect(html).toContain('class="search-bar"');
    expect(html).toContain('class="search-bar-input"');
    expect(html).toContain('search-bar-icon');
  });

  it('renders search bar structure with combobox role and listbox controls', () => {
    const html = renderToStaticMarkup(
      <SearchBar
        onSelectStation={() => {}}
        onSelectLine={() => {}}
        activeLineFilter={[]}
        selectedStation={null}
      />
    );

    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-controls="search-bar-listbox"');
  });
});
