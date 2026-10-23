// A pmtiles Source that never trusts the end of a range response.
//
// Capacitor's Android local server answers `Range: bytes=a-b` with a 206 and a
// correct Content-Range and Content-Length, but streams the body from `a` to
// the end of the file — 36 MB for a 100-byte request. pmtiles' FetchSource
// rejects any body longer than it asked for, so every tile failed and the
// basemap drew no streets. Reading only `length` bytes and cancelling the rest
// makes the over-long body harmless; on a correct server it is a no-op.
export class ExactRangeSource {
  constructor(url) {
    this.url = url;
  }

  getKey() {
    return this.url;
  }

  async getBytes(offset, length, signal, etag) {
    const response = await fetch(this.url, {
      signal,
      headers: { Range: `bytes=${offset}-${offset + length - 1}` },
    });
    if (!response.ok) {
      throw new Error(`Basemap range request failed: HTTP ${response.status}`);
    }
    // A 200 means the server ignored Range and sent the file from byte 0, so
    // its first bytes are only the right ones when the range starts there.
    if (response.status === 200 && offset > 0) {
      throw new Error('Basemap server ignored the range request');
    }

    // A weak etag cannot validate a byte range, so pmtiles ignores it too.
    const newEtag = response.headers.get('Etag');
    const meta = {
      etag: newEtag && !newEtag.startsWith('W/') ? newEtag : undefined,
      cacheControl: response.headers.get('Cache-Control') ?? undefined,
      expires: response.headers.get('Expires') ?? undefined,
    };

    if (!response.body) {
      return { data: (await response.arrayBuffer()).slice(0, length), ...meta };
    }

    const reader = response.body.getReader();
    const out = new Uint8Array(length);
    let filled = 0;
    while (filled < length) {
      const { done, value } = await reader.read();
      if (done) break;
      const take = Math.min(value.length, length - filled);
      out.set(value.subarray(0, take), filled);
      filled += take;
    }
    await reader.cancel();
    return { data: out.buffer.slice(0, filled), ...meta };
  }
}
