import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, afterEach, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));
vi.mock('../utils/platform', () => ({ isAndroid: () => true }));

import AppDownloadButton from './AppDownloadBanner';

afterEach(() => vi.unstubAllGlobals());

describe('AppDownloadButton inside the Android app', () => {
  it('never offers the Android app to someone already using it', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)', maxTouchPoints: 5 });
    const html = renderToStaticMarkup(<AppDownloadButton />);
    expect(html).toBe('');
    expect(html).not.toContain('Get the Android app');
  });
});
