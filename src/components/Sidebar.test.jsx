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
});
