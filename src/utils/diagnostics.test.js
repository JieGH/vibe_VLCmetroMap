import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getClientDiagnostics } from './diagnostics';

describe('getClientDiagnostics', () => {
  const originalNavigator = globalThis.navigator;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('collects platform, timezone, screen, language and app version', () => {
    const diag = getClientDiagnostics('ca');
    expect(diag).toHaveProperty('platform');
    expect(diag).toHaveProperty('timezone');
    expect(diag).toHaveProperty('screen');
    expect(diag.language).toBe('ca');
    expect(diag).toHaveProperty('appVersion');
    expect(diag).toHaveProperty('gitSha');
    expect(diag).toHaveProperty('timestamp');
  });

  it('detects iPhone from userAgent', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)', language: 'es' },
      configurable: true,
    });
    const diag = getClientDiagnostics();
    expect(diag.device).toBe('iPhone');
    expect(diag.language).toBe('es');

    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      configurable: true,
    });
  });

  it('detects Android from userAgent', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)', language: 'en' },
      configurable: true,
    });
    const diag = getClientDiagnostics();
    expect(diag.device).toBe('Android Device');

    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      configurable: true,
    });
  });
});

describe('API failure diagnostics (#123)', () => {
  it('shows the last failure class and status, not "fetch failed"', async () => {
    const { recordApiFailure, getApiDiagnostics } = await import('./diagnostics');
    recordApiFailure('train', { kind: 'blocked', status: 403 });
    recordApiFailure('bus', { kind: 'unreachable', status: null });
    expect(getApiDiagnostics().train).toMatchObject({ kind: 'blocked', status: 403 });
    expect(getClientDiagnostics('es').apiFailures).toMatch(/train: blocked \(403\)/);
    expect(getClientDiagnostics('es').apiFailures).toMatch(/bus: unreachable/);
  });
});

describe('#144 request counter', () => {
  it('counts requests per API inside the window and forgets older ones', async () => {
    const { recordApiRequest, getRecentRequestCount } = await import('./diagnostics');
    const base = 5_000_000;
    recordApiRequest('train', base);
    recordApiRequest('train', base + 5_000);
    recordApiRequest('train', base + 62_000);
    expect(getRecentRequestCount('train', 10_000, base + 63_000)).toBe(1);
    expect(getRecentRequestCount('train', 60_000, base + 63_000)).toBe(2);
    expect(getRecentRequestCount('bus', 60_000, base + 63_000)).toBe(0);
  });
});
