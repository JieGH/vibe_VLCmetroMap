import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { isChunkLoadError, isOpaqueScriptError, reloadOnceForNewBuild } from './chunkReload';

describe('isChunkLoadError', () => {
  it.each([
    "'text/html' is not a valid JavaScript MIME type for module script 'https://xarxa.net/assets/MapView-C7SPjvDb.js'.",
    'Failed to fetch dynamically imported module: https://xarxa.net/assets/MapView-abc.js',
    'error loading dynamically imported module',
    'Importing a module script failed.',
  ])('matches %s', (msg) => {
    expect(isChunkLoadError(msg)).toBe(true);
    expect(isChunkLoadError(new TypeError(msg))).toBe(true);
  });

  it('ignores other errors', () => {
    expect(isChunkLoadError('Cannot read properties of undefined')).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
  });
});

describe('isOpaqueScriptError', () => {
  it('flags only the message-less cross-origin form', () => {
    expect(isOpaqueScriptError('Script error.', '')).toBe(true);
    expect(isOpaqueScriptError('Script error.', 'https://xarxa.net/a.js')).toBe(false);
    expect(isOpaqueScriptError('TypeError: x', '')).toBe(false);
  });
});

describe('reloadOnceForNewBuild', () => {
  let store;
  let reload;

  beforeEach(() => {
    store = {};
    reload = vi.fn();
    vi.stubGlobal('window', {
      sessionStorage: {
        getItem: (k) => store[k] ?? null,
        setItem: (k, v) => {
          store[k] = String(v);
        },
      },
      location: { reload },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('reloads the first time and refuses a second reload inside the cooldown', () => {
    expect(reloadOnceForNewBuild()).toBe(true);
    expect(reloadOnceForNewBuild()).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reloads again once the cooldown has passed', () => {
    store.xarxa_chunk_reload_at = String(Date.now() - 120_000);
    expect(reloadOnceForNewBuild()).toBe(true);
  });

  it('does not reload when storage is unavailable', () => {
    window.sessionStorage.getItem = () => {
      throw new Error('blocked');
    };
    expect(reloadOnceForNewBuild()).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
