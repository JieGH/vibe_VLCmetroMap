import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, afterEach, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));

import AppDownloadBanner, { AppDownloadSheet } from './AppDownloadBanner';
import { APK_URL } from '../utils/appDownload';

const asUserAgent = (userAgent, maxTouchPoints = 0) =>
  vi.stubGlobal('navigator', { userAgent, maxTouchPoints });

afterEach(() => vi.unstubAllGlobals());

describe('AppDownloadBanner', () => {
  it('invites an Android visitor to get the app, with the explanation still closed', () => {
    asUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8)');
    const html = renderToStaticMarkup(<AppDownloadBanner />);
    expect(html).toContain('app-banner');
    expect(html).toContain('Get the Android app for faster live trains');
    expect(html).not.toContain('app-banner-sheet');
  });

  it('says nothing to an iPhone, which has no download', () => {
    asUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');
    expect(renderToStaticMarkup(<AppDownloadBanner />)).toBe('');
  });

  it('steps aside while a panel owns the bottom of the screen', () => {
    asUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8)');
    expect(renderToStaticMarkup(<AppDownloadBanner hidden />)).toBe('');
  });
});

describe('AppDownloadSheet', () => {
  it('explains why the website cannot reach FGV and links the APK', () => {
    const html = renderToStaticMarkup(<AppDownloadSheet onClose={() => {}} />);
    expect(html).toContain('role="dialog"');
    expect(html).toContain('FGV refuses connections');
    expect(html).toContain('relay');
    expect(html).toContain(`href="${APK_URL}"`);
    expect(html).toContain('no download yet');
  });
});
