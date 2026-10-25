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
        trainStats={{ live: 4, confirmed: 4 }}
        onOpenAbout={() => {}}
      />
    );

    expect(html).toContain('sidebar-backdrop active');
    expect(html).toContain('sidebar glass-panel ');
    expect(html).not.toContain('collapsed');
  });

  it('renders branding title and no line list', () => {
    const html = renderToStaticMarkup(
      <Sidebar
        isOpen={true}
        onToggleSidebar={() => {}}
        trainStats={{ live: 4, confirmed: 4 }}
        onOpenAbout={() => {}}
      />
    );

    expect(html).toContain('Xarxa');
    expect(html).not.toContain('Metro Valencia');
    expect(html).not.toContain('Lines &amp; Services');
  });

  it('renders text size as a compact stepper showing S / M / L / XL', () => {
    const html = renderToStaticMarkup(
      <Sidebar
        isOpen={true}
        onToggleSidebar={() => {}}
        trainStats={{ live: 4, confirmed: 4 }}
        onOpenAbout={() => {}}
        fontSize="large"
        onSelectFontSize={() => {}}
      />
    );

    expect(html).toContain('size-stepper');
    expect(html).toContain('aria-label="Text Size Selection"');
    expect(html).toContain('>L<');
    expect(html).toContain('aria-label="Smaller text"');
    expect(html).toContain('aria-label="Larger text"');
    // The old four-button row is gone.
    expect(html).not.toContain('font-size-option-btn');
  });

  it('disables the stepper at either end', () => {
    const at = (fontSize) => renderToStaticMarkup(
      <Sidebar isOpen onToggleSidebar={() => {}} fontSize={fontSize} onSelectFontSize={() => {}} />
    );
    expect(at('small')).toMatch(/disabled=""[^>]*aria-label="Smaller text"/);
    expect(at('xlarge')).toMatch(/disabled=""[^>]*aria-label="Larger text"/);
    expect(at('default')).not.toContain('disabled=""');
  });

  it('renders mobile drag handle with sheet-drag-handle and mobile-only-drag-handle classes', () => {
    const html = renderToStaticMarkup(
      <Sidebar
        isOpen={true}
        onToggleSidebar={() => {}}
        trainStats={{ live: 4, confirmed: 4 }}
        onOpenAbout={() => {}}
      />
    );

    expect(html).toContain('data-testid="sidebar-drag-handle"');
    expect(html).toContain('sheet-drag-handle-wrap mobile-only-drag-handle');
    expect(html).toContain('sheet-drag-handle');
  });
});


describe('Sidebar appearance', () => {
  it('renders Auto/Light/Dark with the selected mode pressed and no lines list', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const React = (await import('react')).default;
    const SidebarMod = (await import('./Sidebar')).default;
    const html = renderToStaticMarkup(
      <SidebarMod isOpen onToggleSidebar={() => {}} themeMode="dark" />
    );
    expect(html).toContain('aria-label="Appearance selection"');
    // Icons, with the words kept as labels for screen readers and tooltips.
    expect(html).toContain('aria-label="Light"');
    expect(html).toContain('aria-label="Auto"');
    expect(html).toMatch(/theme-icon-btn active"[^>]*aria-pressed="true"[^>]*aria-label="Dark"/);
    expect(html).not.toContain('theme-option-btn');
    expect(html).not.toContain('sidebar-line-btn');
    expect(html).not.toContain('Show only line');
  });
});

describe('Sidebar settings row', () => {
  it('puts text size and appearance in one row', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const SidebarMod = (await import('./Sidebar')).default;
    const html = renderToStaticMarkup(<SidebarMod isOpen onToggleSidebar={() => {}} themeMode="dark" fontSize="default" />);
    const row = html.match(/sidebar-settings-row[\s\S]*?(?=sidebar-language-section)/)?.[0] || '';
    expect(row).toContain('size-stepper');
    expect(row).toContain('theme-icon-group');
  });
});
