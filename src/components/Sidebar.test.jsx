import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import Sidebar from './Sidebar';

describe('Sidebar component', () => {
  it('renders collapsed sidebar and inactive backdrop when isOpen is false', () => {
    const html = renderToStaticMarkup(
      <Sidebar
        isOpen={false}
        onToggleSidebar={() => {}}
        activeLineFilter={null}
        onSelectLine={() => {}}
        onHoverLine={() => {}}
        trainStats={{ live: 4, confirmed: 4 }}
        onOpenAbout={() => {}}
      />
    );

    expect(html).toContain('sidebar-backdrop');
    expect(html).not.toContain('sidebar-backdrop active');
    expect(html).toContain('sidebar glass-panel collapsed');
  });

  it('renders active backdrop and expanded sidebar when isOpen is true', () => {
    const html = renderToStaticMarkup(
      <Sidebar
        isOpen={true}
        onToggleSidebar={() => {}}
        activeLineFilter={null}
        onSelectLine={() => {}}
        onHoverLine={() => {}}
        trainStats={{ live: 4, confirmed: 4 }}
        onOpenAbout={() => {}}
      />
    );

    expect(html).toContain('sidebar-backdrop active');
    expect(html).toContain('sidebar glass-panel ');
    expect(html).not.toContain('collapsed');
  });

  it('renders branding title and line list', () => {
    const html = renderToStaticMarkup(
      <Sidebar
        isOpen={true}
        onToggleSidebar={() => {}}
        activeLineFilter={null}
        onSelectLine={() => {}}
        onHoverLine={() => {}}
        trainStats={{ live: 4, confirmed: 4 }}
        onOpenAbout={() => {}}
      />
    );

    expect(html).toContain('Metro Valencia');
    expect(html).toContain('Lines &amp; Services');
  });

  it('renders font size adjustment section with all options and active state', () => {
    const html = renderToStaticMarkup(
      <Sidebar
        isOpen={true}
        onToggleSidebar={() => {}}
        activeLineFilter={null}
        onSelectLine={() => {}}
        onHoverLine={() => {}}
        trainStats={{ live: 4, confirmed: 4 }}
        onOpenAbout={() => {}}
        fontSize="large"
        onSelectFontSize={() => {}}
      />
    );

    expect(html).toContain('Text Size');
    expect(html).toContain('Large');
    expect(html).toContain('font-size-control-group');

    // S, M, L, XL options
    expect(html).toContain('Small text size');
    expect(html).toContain('Default text size');
    expect(html).toContain('Large text size');
    expect(html).toContain('X-Large text size');

    // Active state on 'large'
    expect(html).toContain('class="font-size-option-btn active"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('title="Large text size"');
  });

  it('renders mobile drag handle with sheet-drag-handle and mobile-only-drag-handle classes', () => {
    const html = renderToStaticMarkup(
      <Sidebar
        isOpen={true}
        onToggleSidebar={() => {}}
        activeLineFilter={null}
        onSelectLine={() => {}}
        onHoverLine={() => {}}
        trainStats={{ live: 4, confirmed: 4 }}
        onOpenAbout={() => {}}
      />
    );

    expect(html).toContain('data-testid="sidebar-drag-handle"');
    expect(html).toContain('sheet-drag-handle-wrap mobile-only-drag-handle');
    expect(html).toContain('sheet-drag-handle');
  });
});

