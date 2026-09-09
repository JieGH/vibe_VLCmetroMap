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

  it('ensures sidebar toggle button has flex-shrink: 0 and fixed width on mobile', () => {
    const mobileSection = extractMediaSection(/@media\s*\(\s*max-width:\s*768px\s*\)\s*\{([\s\S]*?)\n\}/);
    expect(mobileSection).toContain('.sidebar-toggle-btn');
    expect(mobileSection).toContain('width: 42px');
    expect(mobileSection).toContain('height: 42px');
    expect(mobileSection).toContain('flex-shrink: 0');
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

  it('paces the hub Line fan-in and ring bloom gracefully within the hold dwell', () => {
    expect(css).toMatch(/animation:\s*welcomeLineFanIn\s+0\.45s/);
    expect(css).toMatch(/animation:\s*welcomeHubRingIn\s+0\.4s[^;]*0\.25s/);
  });

  it('collapses and fades the hub Lines and ring on exit, not a flat opacity fade', () => {
    expect(css).toMatch(/\.welcome-screen--fading \.welcome-line\s*\{[^}]*animation:\s*welcomeLineRetract\s+0\.3s/);
    expect(css).toMatch(/\.welcome-screen--fading \.welcome-hub-ring\s*\{[^}]*animation:\s*welcomeHubRingOut\s+0\.3s/);
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

describe('Map bottom-right info and attribution collapse', () => {
  it('positions bottom-right map controls with safe-area insets', () => {
    const ctrlMatch = css.match(/\.maplibregl-ctrl-bottom-right\s*\{([^}]*)\}/)?.[1] || '';
    expect(ctrlMatch).toContain('bottom: calc(8px + env(safe-area-inset-bottom, 0px))');
    expect(ctrlMatch).toContain('right: calc(8px + env(safe-area-inset-right, 0px))');
  });

  it('keeps bottom-right map info collapsed into compact button by default', () => {
    expect(css).toContain('.maplibregl-ctrl-bottom-right .maplibregl-ctrl-attrib:not(.maplibregl-compact-show) .maplibregl-ctrl-attrib-inner');
    expect(css).toContain('display: none !important');
    expect(css).toContain('.maplibregl-ctrl-bottom-right .maplibregl-ctrl-attrib:not(.maplibregl-compact-show) .maplibregl-ctrl-attrib-button');
    expect(css).toContain('display: block !important');
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
});



