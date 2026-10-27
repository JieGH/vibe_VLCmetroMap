// Regression tests for #93 (streamlined top bar) and #88 (BusStopBoard live polling).
// The repo has no DOM environment, so these assert on source and CSS text.
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';
import { EMT_CACHE_TTL_MS } from './services/emtArrivalService';

const read = (p) => readFileSync(resolve(__dirname, p), 'utf-8');
const app = read('App.jsx');
const css = read('index.css');
const board = read('components/BusStopBoard.jsx');

const topBar = app.slice(
  app.indexOf('className={`top-bar-container'),
  app.indexOf('{/* Search Overlay Modal */}')
);

describe('top navigation bar (#93)', () => {
  it('holds only the hamburger toggle and the magnifier search button', () => {
    expect(topBar).toContain('sidebar-toggle-btn');
    expect(topBar).toContain('search-toggle-btn');
    expect((topBar.match(/<button/g) || []).length).toBe(2);
    expect(topBar.indexOf('sidebar-toggle-btn')).toBeLessThan(topBar.indexOf('search-toggle-btn'));
  });

  it('no longer carries the language toggle or the theme switch', () => {
    expect(topBar).not.toMatch(/LanguageToggle|<Sun|<Moon|SunMoon|MessageSquare|SearchBar/);
    expect(app).not.toMatch(/import LanguageToggle/);
  });

  it('keeps language and theme reachable from the sidebar menu', () => {
    const sidebar = read('components/Sidebar.jsx');
    expect(sidebar).toMatch(/setLanguage/);
    expect(sidebar).toMatch(/onSelectTheme/);
  });

  it('the magnifier toggles the search overlay and exposes aria state', () => {
    expect(topBar).toMatch(/setIsSearchOpen\(\(prev\) => !prev\)/);
    expect(topBar).toContain('aria-expanded={isSearchOpen}');
    expect(topBar).toContain('aria-label={t(\'searchBar.ariaLabel\')}');
    expect(app).toMatch(/\{isSearchOpen && \(/);
  });

  it('search and hamburger buttons share one 52px square glass style', () => {
    const shared = css.match(/\.sidebar-toggle-btn,\s*\.search-toggle-btn\s*\{([^}]*)\}/)?.[1] || '';
    expect(shared).toContain('width: 52px');
    expect(shared).toContain('height: 52px');
  });

  it('feedback stays reachable and opens the feedback modal (now via the sidebar)', () => {
    expect(app).toContain('onOpenFeedback={() => setIsFeedbackOpen(true)}');
    expect(app).toMatch(/<FeedbackModal[\s\S]*isOpen=\{isFeedbackOpen\}/);
  });
});

describe('BusStopBoard live refresh wiring (#88)', () => {
  it('polls on the cache TTL (20 s) with a forced refresh', () => {
    expect(EMT_CACHE_TTL_MS).toBe(20000);
    expect(board).toMatch(/setInterval\(\(\) => \{\s*loadArrivals\(true\);\s*\}, EMT_CACHE_TTL_MS\)/);
    expect(board).toContain('fetchStopArrivals(cleanCode, { forceRefresh: force })');
  });

  it('fetches on mount and clears the interval and ignores late results on close', () => {
    expect(board).toMatch(/loadArrivals\(\);\s*\n\s*\/\/ Auto-refresh/);
    expect(board).toMatch(/isMounted = false;\s*clearInterval\(intervalId\)/);
    expect(board).toContain('if (isMounted)');
  });

  it('does not start polling without a stop code', () => {
    expect(board).toMatch(/if \(!stop \|\| !cleanCode\) return undefined;/);
  });

  it('derives the numeric code from stopCode, code or id, tolerating P- prefixes', () => {
    expect(board).toContain('stop.stopCode || stop.code || stop.id');
    expect(board).toContain('normalizeStopCode(rawCode)');
  });
});
