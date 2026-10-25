import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import PrototypeSwitcher, { VARIANTS } from './PrototypeSwitcher';

describe('PrototypeSwitcher component', () => {
  it('renders the floating docked switcher at bottom center', () => {
    const html = renderToStaticMarkup(
      <PrototypeSwitcher currentVariant="A" onSelectVariant={() => {}} />
    );
    expect(html).toContain('prototype-switcher-dock');
    expect(html).toContain('A: Multimodal Hub Feeder');
    expect(html).toContain('PROTOTYPE');
  });

  it('renders with Variant B active', () => {
    const html = renderToStaticMarkup(
      <PrototypeSwitcher currentVariant="B" onSelectVariant={() => {}} />
    );
    expect(html).toContain('B: Line-on-Demand Canvas');
  });

  it('renders with Variant C active', () => {
    const html = renderToStaticMarkup(
      <PrototypeSwitcher currentVariant="C" onSelectVariant={() => {}} />
    );
    expect(html).toContain('C: Dual-Lens Mode Switcher');
  });

  it('has 3 defined prototype variants matching spec', () => {
    expect(VARIANTS).toHaveLength(3);
    expect(VARIANTS.map(v => v.key)).toEqual(['A', 'B', 'C']);
  });
});
