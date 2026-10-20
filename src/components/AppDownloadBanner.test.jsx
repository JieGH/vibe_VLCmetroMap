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
    expect(html).toContain('Get the Android app');
    expect(html).toContain('Faster live trains, straight from FGV');
    expect(html).not.toContain('app-banner-sheet');
  });

  it('shows the same banner to an iPhone and to a desktop browser', () => {
    asUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');
    expect(renderToStaticMarkup(<AppDownloadBanner />)).toContain('Get the Android app');
    asUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)');
    expect(renderToStaticMarkup(<AppDownloadBanner />)).toContain('Get the Android app');
  });

  it('steps aside while a panel or notice owns that space', () => {
    asUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8)');
    expect(renderToStaticMarkup(<AppDownloadBanner hidden />)).toBe('');
  });
});

describe('AppDownloadSheet on iPhone', () => {
  it('explains the situation but offers no APK to download', () => {
    const html = renderToStaticMarkup(<AppDownloadSheet ios onClose={() => {}} />);
    expect(html).toContain('FGV refuses connections');
    expect(html).toContain('no download yet');
    expect(html).not.toContain(APK_URL);
    expect(html).not.toContain('app-banner-download');
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
