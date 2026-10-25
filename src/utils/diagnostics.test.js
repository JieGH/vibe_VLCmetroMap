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
