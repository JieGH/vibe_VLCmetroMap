import { describe, it, expect, vi } from 'vitest';
import { createChunkedSource, loadChunkManifest } from './chunkedSource';

const SIZE = 25;
const CHUNK = 10;
const file = Uint8Array.from({ length: SIZE }, (_, i) => i);
const manifest = { size: SIZE, chunkSize: CHUNK, parts: 3 };
const fakeFetch = () => vi.fn(async (url) => {
  const index = Number(String(url).match(/\.p(\d+)$/)?.[1]);
  if (Number.isNaN(index) || index > 2) return new Response('', { status: 404 });
  return new Response(file.slice(index * CHUNK, Math.min(SIZE, (index + 1) * CHUNK)));
});
const read = async (source, offset, length) => [...new Uint8Array((await source.getBytes(offset, length)).data)];

describe('createChunkedSource', () => {
  it('reads inside one part', async () => {
    const source = createChunkedSource(manifest, 'https://x/a.pmtiles', fakeFetch());
    expect(await read(source, 12, 3)).toEqual([12, 13, 14]);
  });
  it('reads across parts, including the shorter last one', async () => {
    const source = createChunkedSource(manifest, 'https://x/a.pmtiles', fakeFetch());
    expect(await read(source, 8, 15)).toEqual(Array.from({ length: 15 }, (_, i) => 8 + i));
    expect(await read(source, 20, 5)).toEqual([20, 21, 22, 23, 24]);
  });
  it('fetches each part once', async () => {
    const f = fakeFetch();
    const source = createChunkedSource(manifest, 'https://x/a.pmtiles', f);
    await read(source, 0, 4); await read(source, 5, 4); await read(source, 8, 4);
    expect(f).toHaveBeenCalledTimes(2);
  });
  it('retries a part that failed', async () => {
    let calls = 0;
    const f = vi.fn(async (url) => (++calls === 1 ? new Response('', { status: 500 }) : fakeFetch()(url)));
    const source = createChunkedSource(manifest, 'https://x/a.pmtiles', f);
    await expect(source.getBytes(0, 2)).rejects.toThrow(/HTTP 500/);
    expect(await read(source, 0, 2)).toEqual([0, 1]);
  });
  it('rejects a part of the wrong size', async () => {
    const f = vi.fn(async () => new Response(new Uint8Array(3)));
    const source = createChunkedSource(manifest, 'https://x/a.pmtiles', f);
    await expect(source.getBytes(0, 2)).rejects.toThrow(/expected 10/);
  });
  it('keys the source by the archive URL, which is what the pmtiles:// style URL names', () => {
    expect(createChunkedSource(manifest, 'https://x/a.pmtiles').getKey()).toBe('https://x/a.pmtiles');
  });
});

describe('loadChunkManifest', () => {
  it('returns the manifest when the host has one', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify(manifest)));
    expect(await loadChunkManifest('https://x/a.pmtiles', f)).toEqual(manifest);
    expect(f).toHaveBeenCalledWith('https://x/a.pmtiles.json');
  });
  it('returns null on a 404 or on an HTML fallback page', async () => {
    expect(await loadChunkManifest('u', async () => new Response('', { status: 404 }))).toBeNull();
    expect(await loadChunkManifest('u', async () => new Response('<!doctype html>'))).toBeNull();
  });
});
