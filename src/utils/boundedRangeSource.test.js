import { describe, it, expect } from 'vitest';
import { createBoundedRangeSource } from './boundedRangeSource';

const FILE = Uint8Array.from({ length: 1000 }, (_, i) => i % 251);

// Android's local server: honours where a range starts, ignores where it ends.
const overlongServer = (status = 206) => async (_url, { headers }) => {
  const start = Number(headers.Range.match(/bytes=(\d+)-/)[1]);
  const body = FILE.slice(start);
  // Hand the body over in small chunks, as a real stream does.
  const stream = new ReadableStream({
    start(controller) {
      for (let i = 0; i < body.length; i += 64) controller.enqueue(body.slice(i, i + 64));
      controller.close();
    },
  });
  return new Response(stream, { status });
};

const bytesOf = ({ data }) => Array.from(new Uint8Array(data));

describe('createBoundedRangeSource', () => {
  it('returns exactly the bytes asked for when the server sends on past the range', async () => {
    const source = createBoundedRangeSource('https://localhost/valencia.pmtiles', overlongServer());

    expect(bytesOf(await source.getBytes(0, 10))).toEqual(Array.from(FILE.slice(0, 10)));
    expect(bytesOf(await source.getBytes(300, 130))).toEqual(Array.from(FILE.slice(300, 430)));
  });

  it('is keyed by the archive URL', () => {
    expect(createBoundedRangeSource('https://localhost/a.pmtiles').getKey()).toBe('https://localhost/a.pmtiles');
  });

  it('refuses a server that ignored the range altogether', async () => {
    const source = createBoundedRangeSource('u', overlongServer(200));
    await expect(source.getBytes(5, 10)).rejects.toThrow(/HTTP 200/);
  });

  it('refuses a body that ends before the bytes asked for', async () => {
    const short = async () => new Response(FILE.slice(0, 4), { status: 206 });
    await expect(createBoundedRangeSource('u', short).getBytes(0, 10)).rejects.toThrow(/4 of 10/);
  });
});
