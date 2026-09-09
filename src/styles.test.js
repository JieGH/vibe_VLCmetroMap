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

  it('paces transit line draw and spotlight bloom gracefully within 1.0s dwell', () => {
    expect(css).toMatch(/animation:\s*welcomeLineDrawIn\s+0\.36s/);
    expect(css).toMatch(/animation:\s*welcomeStationSpotlight\s+0\.48s[^;]*0\.36s/);
    expect(css).toMatch(/animation:\s*welcomeStationCoreBloom\s+0\.44s[^;]*0\.36s/);
  });
});

describe('Station dismiss backdrop', () => {
  it('defines fixed full-screen backdrop under station-panel and above map canvas', () => {
    const backdropMatch = css.match(/\.station-backdrop\s*\{([^}]*)\}/)?.[1] || '';
    expect(backdropMatch).toContain('position: fixed');
    expect(backdropMatch).toContain('inset: 0');
    expect(backdropMatch).toContain('z-index: 25');
    expect(backdropMatch).toContain('background: transparent');
    expect(backdropMatch).toContain('pointer-events: auto');
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



