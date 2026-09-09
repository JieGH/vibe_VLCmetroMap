import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

describe('Top bar CSS layout stability', () => {
  const css = readFileSync(resolve(__dirname, 'index.css'), 'utf-8');

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
  const css = readFileSync(resolve(__dirname, 'index.css'), 'utf-8');

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

    const buttonMatch = css.match(/button\s*\{([^}]*)\}/)?.[1] || '';
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
