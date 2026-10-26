import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

const css = readFileSync(resolve(__dirname, 'index.css'), 'utf-8');

describe('Top bar CSS layout stability', () => {

  const extractMediaSection = (queryRegex) => {
    const match = css.match(queryRegex);
    expect(match).toBeTruthy();
    return match[1];
  };

  it('scopes desktop top-bar left positioning inside min-width media query', () => {
    const desktopSection = extractMediaSection(/@media\s*\(\s*min-width:\s*769px\s*\)\s*\{([\s\S]*?)\n\}/);
    expect(desktopSection).toContain('left: 360px');
    expect(desktopSection).toContain('.top-bar-container.sidebar-collapsed');
    expect(desktopSection).toContain('left: 20px');
  });

  it('locks top-bar-container geometry identically on mobile without leaking desktop constraints', () => {
    // Root level must not impose desktop-specific left or max-width that leaks into mobile
    const rootTopBar = css.match(/\.top-bar-container\s*\{([^}]*)\}/)?.[1] || '';
    expect(rootTopBar).not.toContain('left: 360px');
    expect(rootTopBar).not.toContain('transition: left');

    const mobileSection = extractMediaSection(/@media\s*\(\s*max-width:\s*768px\s*\)\s*\{([\s\S]*?)\n\}/);
    expect(mobileSection).toContain('.top-bar-container');
    expect(mobileSection).toContain('max-width: none');
    expect(mobileSection).toContain('left: 12px');
    expect(mobileSection).toContain('right: 12px');
    expect(mobileSection).toContain('transition: none');
  });

  it('keeps the menu button a 52px-wide square stretched to the search bar\'s height on mobile', () => {
    const mobileSection = extractMediaSection(/@media\s*\(\s*max-width:\s*768px\s*\)\s*\{([\s\S]*?)\n\}/);
    const rule = mobileSection.match(/\.sidebar-toggle-btn\s*\{([^}]*)\}/)?.[1] || '';
    expect(rule).toContain('width: 52px');
    expect(rule).toContain('align-self: stretch');
    expect(rule).toContain('flex-shrink: 0');
    expect(css).toMatch(/\.search-bar-container\s*\{[^}]*min-height: 52px/);
  });

  it('styles magnifier search button with matching 52px dimensions and glass overlay', () => {
    expect(css).toMatch(/\.search-toggle-btn/);
    expect(css).toMatch(/\.search-overlay\s*\{[^}]*position:\s*fixed/);
    expect(css).toMatch(/\.search-backdrop\s*\{[^}]*position:\s*absolute/);
  });
});

describe('Global text selection prevention', () => {
  it('disables text selection and touch callout globally on html and body', () => {
    const htmlBodyMatch = css.match(/html,\s*body\s*\{([^}]*)\}/)?.[1] || '';
    expect(htmlBodyMatch).toContain('user-select: none');
    expect(htmlBodyMatch).toContain('-webkit-user-select: none');
    expect(htmlBodyMatch).toContain('-webkit-touch-callout: none');
  });

  it('disables text selection on root container and buttons', () => {
    const rootMatch = css.match(/#root\s*\{([^}]*)\}/)?.[1] || '';
    expect(rootMatch).toContain('user-select: none');
    expect(rootMatch).toContain('-webkit-user-select: none');

    const buttonMatch = css.match(/(?:^|\n)button\s*\{([^}]*)\}/)?.[1] || '';
    expect(buttonMatch).toContain('user-select: none');
    expect(buttonMatch).toContain('-webkit-user-select: none');
    expect(buttonMatch).toContain('-webkit-touch-callout: none');
  });

  it('preserves text selection and editing callouts for editable inputs and textareas', () => {
    const inputMatch = css.match(/input,\s*textarea\s*\{([^}]*)\}/)?.[1] || '';
    expect(inputMatch).toContain('user-select: text');
    expect(inputMatch).toContain('-webkit-user-select: text');
    expect(inputMatch).toContain('-webkit-touch-callout: default');
  });
});

describe('Sidebar dismiss backdrop', () => {
  it('defines fixed full-screen backdrop under sidebar and top bar', () => {
    const backdropMatch = css.match(/\.sidebar-backdrop\s*\{([^}]*)\}/)?.[1] || '';
    expect(backdropMatch).toContain('position: fixed');
    expect(backdropMatch).toContain('inset: 0');
    expect(backdropMatch).toContain('z-index: 35');
    expect(backdropMatch).toContain('pointer-events: none');
    expect(backdropMatch).toContain('opacity: 0');
  });

  it('enables pointer events when active', () => {
    const activeMatch = css.match(/\.sidebar-backdrop\.active\s*\{([^}]*)\}/)?.[1] || '';
    expect(activeMatch).toContain('pointer-events: auto');
    expect(activeMatch).toContain('opacity: 1');
  });
});

describe('Font size scaling and menu controls', () => {
  it('defines --font-scale on :root and per data-font-size attribute', () => {
    expect(css).toContain('--font-scale: 1;');
    expect(css).toContain("[data-font-size='small']");
    expect(css).toContain('--font-scale: 0.9;');
    expect(css).toContain("[data-font-size='default']");
    expect(css).toContain('--font-scale: 1;');
    expect(css).toContain("[data-font-size='large']");
    expect(css).toContain('--font-scale: 1.15;');
    expect(css).toContain("[data-font-size='xlarge']");
    expect(css).toContain('--font-scale: 1.3;');
  });

  it('scales html font-size dynamically using --font-scale', () => {
    expect(css).toContain('html {\n  font-size: calc(16px * var(--font-scale, 1));\n}');
  });

  it('styles font size segmented control in sidebar', () => {
    expect(css).toContain('.font-size-control-group');
    expect(css).toContain('.font-size-option-btn');
    expect(css).toContain('.font-size-option-btn.active');
    expect(css).toContain('.font-size-option-preview');
    expect(css).toContain('.font-size-option-label');
  });
});

describe('Map markers follow the Text Size setting (#103)', () => {
  const ruleFor = (selector) => {
    const re = /([^{}]+)\{([^}]*)\}/g;
    let m;
    const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
    while ((m = re.exec(bare))) {
      const sels = m[1].split(',').map((x) => x.trim());
      if (sels.includes(selector) && m[2].includes('zoom')) return m[2];
    }
    return '';
  };

  it.each([
    '.metro-station-badge',
    '.emt-stop-badge',
    '.live-bus-pill',
    '.station-floating-chart',
    '.bus-floating-chart',
  ])('scales %s by --font-scale (1 at default, so default is unchanged)', (selector) => {
    expect(ruleFor(selector)).toContain('zoom: var(--font-scale, 1)');
  });
});

describe('Welcome screen splash styles and animation timings', () => {
  it('defines fixed full-screen splash overlay at z-index 10000', () => {
    const splashMatch = css.match(/\.welcome-screen\s*\{([^}]*)\}/)?.[1] || '';
    expect(splashMatch).toContain('position: fixed');
    expect(splashMatch).toContain('inset: 0');
    expect(splashMatch).toContain('z-index: 10000');
    expect(splashMatch).toContain('background-color: #16161f');
  });

  it('fades out smoothly with transition to hidden', () => {
    const fadeMatch = css.match(/\.welcome-screen--fading\s*\{([^}]*)\}/)?.[1] || '';
    expect(fadeMatch).toContain('opacity: 0');
    expect(fadeMatch).toContain('visibility: hidden');
    expect(fadeMatch).toContain('pointer-events: none');
  });

  it('styles the static Xarxa splash logo and content without line-draw animations', () => {
    expect(css).toContain('.welcome-screen-logo-wrap');
    expect(css).toContain('.welcome-screen-logo');
    expect(css).not.toMatch(/animation:\s*welcomeLineDrawIn/);
  });
});

describe('Station dismiss backdrop', () => {
  // A full-screen, pointer-capturing backdrop over the map blocked drag and
  // scroll-zoom while a Station was selected. Removed in favour of MapView's
  // own click handler, which already dismisses on an outside tap.
  it('no longer defines a full-screen backdrop over the map canvas', () => {
    expect(css).not.toMatch(/\.station-backdrop\s*\{/);
  });
});

describe('Map attribution control', () => {
  const mapView = readFileSync(resolve(__dirname, 'components/MapView.jsx'), 'utf8');

  it('is switched off: the credits live in About & Legal, not in an (i) button on the map', () => {
    expect(mapView).toContain('attributionControl: false');
    expect(css).not.toContain('maplibregl-ctrl-attrib');
  });

  it('still credits OpenStreetMap, Protomaps and MapLibre in the legal info', async () => {
    const { APP_LEGAL_INFO } = await import('./utils/legalInfo');
    const text = JSON.stringify(APP_LEGAL_INFO.attributions);
    expect(text).toContain('OpenStreetMap');
    expect(text).toContain('Protomaps');
    expect(text).toContain('MapLibre');
  });
});

describe('Bottom sheet drag handle styles', () => {
  it('configures sheet drag handle wrap with touch-action none and grab cursor', () => {
    const wrapMatch = css.match(/\.sheet-drag-handle-wrap\s*\{([^}]*)\}/)?.[1] || '';
    expect(wrapMatch).toContain('touch-action: none');
    expect(wrapMatch).toContain('cursor: grab');
    expect(wrapMatch).toContain('display: flex');
    expect(wrapMatch).toContain('justify-content: center');
  });

  it('defines centered pill geometry for sheet drag handle', () => {
    const pillMatch = css.match(/\.sheet-drag-handle\s*\{([^}]*)\}/)?.[1] || '';
    expect(pillMatch).toContain('width: 36px');
    expect(pillMatch).toContain('height: 4px');
    expect(pillMatch).toContain('border-radius: 999px');
  });

  it('hides mobile-only drag handle on desktop and displays it on mobile viewports', () => {
    const mobileOnlyRoot = css.match(/\.mobile-only-drag-handle\s*\{([^}]*)\}/)?.[1] || '';
    expect(mobileOnlyRoot).toContain('display: none');

    const mobileSection = css.match(/@media\s*\(\s*max-width:\s*768px\s*\)\s*\{([\s\S]*?)\n\}/)?.[1] || '';
    expect(mobileSection).toContain('.mobile-only-drag-handle');
    expect(mobileSection).toContain('display: flex');
  });

  it('contains overscroll on feedback modal and search results to prevent viewport dragging', () => {
    const feedbackContent = css.match(/\.feedback-modal-content\s*\{([^}]*)\}/)?.[1] || '';
    expect(feedbackContent).toContain('overscroll-behavior: contain');

    const feedbackBody = css.match(/\.feedback-modal-body\s*\{([^}]*)\}/)?.[1] || '';
    expect(feedbackBody).toContain('overscroll-behavior: contain');

    const searchResults = css.match(/\.search-bar-results\s*\{([^}]*)\}/)?.[1] || '';
    expect(searchResults).toContain('overscroll-behavior: contain');
  });

  it('applies touch-action constraints on top bar and feedback modal backdrop', () => {
    const topBar = css.match(/\.top-bar-container\s*\{([^}]*)\}/)?.[1] || '';
    expect(topBar).toContain('touch-action: none');

    const feedbackBackdrop = css.match(/\.feedback-modal-backdrop\s*\{([^}]*)\}/)?.[1] || '';
    expect(feedbackBackdrop).toContain('touch-action: none');

    const searchBarContainer = css.match(/\.search-bar-container\s*\{([^}]*)\}/)?.[1] || '';
    expect(searchBarContainer).toContain('touch-action: pan-y');
  });
});

describe('EMT zoomed-out dots and tight label (#108)', () => {
  const rule = (selector) => {
    const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return css.match(new RegExp(esc + '\\s*\\{([^}]*)\\}'))?.[1] || '';
  };

  it('turns non-selected EMT badges into 8px round dots under data-emt-dots', () => {
    const dot = rule('.map-container[data-emt-dots="true"] .emt-stop-badge:not(.is-selected)');
    expect(dot).toContain('width: 8px');
    expect(dot).toContain('height: 8px');
    expect(dot).toContain('border-radius: 50%');
    expect(dot).toContain('font-size: 0');
  });

  it('hides the EMT text and the spawned line chips in dot mode', () => {
    expect(rule('.map-container[data-emt-dots="true"] .emt-stop-badge:not(.is-selected) > span')).toContain('display: none');
    expect(rule('.map-container[data-emt-dots="true"] .bus-floating-chart:not(.is-selected) > *')).toContain('display: none');
  });

  it('keeps a 24px invisible hit area on dots', () => {
    const hit = css.match(/\.emt-stop-badge:not\(\.is-selected\)::after,[^{]*\{([^}]*)\}/)?.[1] || '';
    expect(hit).toContain('width: 24px');
    expect(hit).toContain('height: 24px');
  });

  it('never targets the selected stop or metro stations with dot rules', () => {
    const dotSection = css.slice(css.indexOf('Zoomed-out dots (#108)'), css.indexOf('A station or stop is selected'));
    expect(dotSection).not.toContain('metro-station');
    expect(dotSection).not.toMatch(/\.emt-stop-badge\s*[{,]/);
  });
});
