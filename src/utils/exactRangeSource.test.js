import { describe, it, expect, vi, afterEach } from 'vitest';
import { ExactRangeSource } from './exactRangeSource';

const URL_ = 'http://localhost/basemap/valencia.pmtiles';

// A body of `total` bytes (value = index % 251) delivered in `chunk`-byte pieces,
// the way a server that ignores the range's end would stream the whole file.
const overLongResponse = (total, chunk, { status = 206, headers = {} } = {}) => {
  const bytes = Uint8Array.from({ length: total }, (_, i) => i % 251);
  const state = { pulls: 0, cancelled: false };
  let next = 0;
  const body = new ReadableStream({
    pull(controller) {
      if (next >= total) return controller.close();
      state.pulls += 1;
      controller.enqueue(bytes.slice(next, next + chunk));
      next += chunk;
    },
    cancel() { state.cancelled = true; },
  });
  return { response: new Response(body, { status, headers }), state, bytes };
};

afterEach(() => vi.unstubAllGlobals());

describe('ExactRangeSource', () => {
  it('keys the archive by its URL', () => {
    expect(new ExactRangeSource(URL_).getKey()).toBe(URL_);
  });

  it('returns exactly the requested bytes when the body runs past the range', async () => {
    const { response, bytes } = overLongResponse(10_000, 700);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

    const { data } = await new ExactRangeSource(URL_).getBytes(16384, 100);

    expect(data.byteLength).toBe(100);
    expect(new Uint8Array(data)).toEqual(bytes.slice(0, 100));
  });

  it('sends an inclusive Range header for the offset and length', async () => {
    const { response } = overLongResponse(1000, 1000);
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal('fetch', fetchMock);

    await new ExactRangeSource(URL_).getBytes(16384, 100);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(URL_);
    expect(new Headers(init.headers).get('range')).toBe('bytes=16384-16483');
  });

  it('stops reading once it has enough and cancels the rest of the body', async () => {
    const { response, state } = overLongResponse(1_000_000, 100);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

    await new ExactRangeSource(URL_).getBytes(0, 250);

    expect(state.cancelled).toBe(true);
    expect(state.pulls).toBeLessThan(10);
  });

  it('passes through a strong etag and the cache headers', async () => {
    const { response } = overLongResponse(500, 500, {
      headers: { Etag: '"abc"', 'Cache-Control': 'max-age=60', Expires: 'soon' },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

    const result = await new ExactRangeSource(URL_).getBytes(0, 10);

    expect(result.etag).toBe('"abc"');
    expect(result.cacheControl).toBe('max-age=60');
    expect(result.expires).toBe('soon');
  });

  it('throws on a non-2xx status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 404 })));

    await expect(new ExactRangeSource(URL_).getBytes(0, 10)).rejects.toThrow(/404/);
  });
});
