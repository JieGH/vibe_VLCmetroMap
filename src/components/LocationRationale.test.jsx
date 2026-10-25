import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import LocationRationale from './LocationRationale';

describe('LocationRationale', () => {
  it('renders an accessible dialog saying location stays on the device', () => {
    const html = renderToStaticMarkup(<LocationRationale onAllow={() => {}} onDecline={() => {}} />);
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('md-dialog');
    expect(html).toContain('only on this device');
    expect(html).toContain('Continue');
    expect(html).toContain('Not now');
  });
});
