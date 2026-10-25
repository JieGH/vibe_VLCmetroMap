import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, afterEach, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));

import AppDownloadButton, { AppDownloadSheet } from './AppDownloadBanner';
import { APK_URL } from '../utils/appDownload';

const asUserAgent = (userAgent, maxTouchPoints = 0) =>
  vi.stubGlobal('navigator', { userAgent, maxTouchPoints });

afterEach(() => vi.unstubAllGlobals());

describe('AppDownloadButton', () => {
  it('is an icon button in the top bar, with the explanation still closed', () => {
    asUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8)');
    const html = renderToStaticMarkup(<AppDownloadButton className="topbar-icon-btn" />);
    expect(html).toContain('topbar-icon-btn');
    expect(html).toContain('aria-label="Get the Android app"');
    expect(html).toContain('<svg');
    expect(html).not.toContain('app-banner-sheet');
  });

  it('is shown to an iPhone and to a desktop browser too', () => {
    asUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');
    expect(renderToStaticMarkup(<AppDownloadButton />)).toContain('Get the Android app');
    asUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)');
    expect(renderToStaticMarkup(<AppDownloadButton />)).toContain('Get the Android app');
  });
});

describe('AppDownloadSheet on iPhone', () => {
  it('says there is no iPhone app yet and offers no APK', () => {
    const html = renderToStaticMarkup(<AppDownloadSheet ios onClose={() => {}} />);
    expect(html).toContain('there is no app yet');
    expect(html).toContain('Add to Home Screen');
    expect(html).not.toContain(APK_URL);
    expect(html).not.toContain('app-banner-download');
  });
});

describe('AppDownloadSheet', () => {
  it('speaks plainly: what you get, three steps, one download button', () => {
    const html = renderToStaticMarkup(<AppDownloadSheet onClose={() => {}} />);
    expect(html).toContain('role="dialog"');
    expect(html).toContain('See more trains');
    expect(html).toContain('How to install it');
    expect(html).toContain(`href="${APK_URL}"`);
    // No operator or relay jargon in the user-facing copy.
    expect(html).not.toMatch(/FGV|relay|API|test-signed/);
  });
});
