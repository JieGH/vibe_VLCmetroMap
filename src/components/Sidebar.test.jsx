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
    expect(at('xxlarge')).toMatch(/disabled=""[^>]*aria-label="Larger text"/);
    expect(at('xlarge')).not.toContain('disabled=""');
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
  it('puts text size, appearance, and language in one row', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const SidebarMod = (await import('./Sidebar')).default;
    const html = renderToStaticMarkup(<SidebarMod isOpen onToggleSidebar={() => {}} themeMode="dark" fontSize="default" />);
    expect(html).toContain('sidebar-settings-row');
    expect(html).toContain('size-stepper');
    expect(html).toContain('theme-icon-group');
    expect(html).toContain('lang-icon-group');
    expect(html).toContain('>EN<');
    expect(html).toContain('>ES<');
    expect(html).toContain('>VAL<');
  });
});

describe('Sidebar contact and signature', () => {
  it('renders Contact Author button, author first name only, and excludes raw email from first layer', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const SidebarMod = (await import('./Sidebar')).default;
    const html = renderToStaticMarkup(
      <SidebarMod isOpen onToggleSidebar={() => {}} onOpenWhatsNew={() => {}} />
    );
    expect(html).toContain('sidebar-contact-btn');
    expect(html).toContain('Contact Author');
    expect(html).toContain('sidebar-whats-new-btn');
    expect(html).toContain("What&#x27;s New");
    expect(html).toContain('Made in Valencia by');
    expect(html).toContain('Jie');
    expect(html).not.toContain('Jie Lei');
    // Raw email is not exposed in the first-layer menu
    expect(html).not.toContain('contact@xarxa.net');
    expect(html).not.toContain('mailto:');
    // Network train stats were moved to About/Legal modal
    expect(html).not.toContain('sidebar.liveNetwork');
    expect(html).not.toContain('Live Network');
  });
});
