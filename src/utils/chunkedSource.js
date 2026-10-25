// A PMTiles source for hosts that cannot answer HTTP Range requests.
//
// Cloudflare Workers static assets ignore `Range` on a cache hit and send the
// whole 16 MB archive with a 200, which PMTiles rejects ("Server returned no
// content-length header or content-length exceeding request"), so the basemap
// draws nothing. The build therefore also cuts the archive into fixed-size
// parts (scripts/split_basemap.cjs) plus a manifest, and this source reads the
// bytes it is asked for by fetching only the parts that cover them. Parts are
// whole-file GETs, which every static host serves, and each is fetched at most
// once per page load.
export function createChunkedSource(manifest, baseUrl, fetchImpl = (...args) => fetch(...args)) {
  const { size, chunkSize, parts } = manifest;
  const cache = new Map();

  const part = (index) => {
    if (!cache.has(index)) {
      const promise = fetchImpl(`${baseUrl}.p${index}`).then(async (response) => {
        if (!response.ok) throw new Error(`Basemap part ${index} answered HTTP ${response.status}`);
        const bytes = new Uint8Array(await response.arrayBuffer());
        const expected = index === parts - 1 ? size - chunkSize * (parts - 1) : chunkSize;
        if (bytes.length !== expected) throw new Error(`Basemap part ${index} is ${bytes.length} bytes, expected ${expected}`);
        return bytes;
      });
      // A failed part must be retried next time, not remembered.
      promise.catch(() => cache.delete(index));
      cache.set(index, promise);
    }
    return cache.get(index);
  };

  return {
    getKey: () => baseUrl,
    async getBytes(offset, length) {
      const end = Math.min(offset + length, size);
      const first = Math.floor(offset / chunkSize);
      const last = Math.floor((end - 1) / chunkSize);
      const out = new Uint8Array(end - offset);
      const fetched = await Promise.all(Array.from({ length: last - first + 1 }, (_, i) => part(first + i)));
      fetched.forEach((bytes, i) => {
        const partStart = (first + i) * chunkSize;
        const from = Math.max(offset, partStart) - partStart;
        const to = Math.min(end, partStart + bytes.length) - partStart;
        out.set(bytes.subarray(from, to), Math.max(offset, partStart) - offset);
      });
      return { data: out.buffer };
    },
  };
}

/** The manifest the build writes beside the archive, or null when this host has none (or answers with HTML). */
export async function loadChunkManifest(baseUrl, fetchImpl = (...args) => fetch(...args)) {
  try {
    const response = await fetchImpl(`${baseUrl}.json`);
    if (!response.ok) return null;
    const manifest = await response.json();
    return manifest && manifest.parts > 0 && manifest.chunkSize > 0 && manifest.size > 0 ? manifest : null;
  } catch {
    return null;
  }
}
