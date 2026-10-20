// A PMTiles source that reads exactly the bytes it asks for.
//
// The Android app serves the basemap archive through Capacitor's local web
// server, which answers a Range request with `206` and a correct
// `Content-Range`, starts the body at the right offset, and then never stops:
// the body runs on to the end of the 36 MB file. PMTiles takes those bytes as
// the slice it asked for, reads a corrupt header, and the map draws no
// basemap. Reading only `length` bytes and cancelling the rest is right for
// that server and for any server that behaves.
export function createBoundedRangeSource(url, fetchImpl = (...args) => fetch(...args)) {
  return {
    getKey: () => url,
    async getBytes(offset, length, signal) {
      const response = await fetchImpl(url, {
        signal,
        headers: { Range: `bytes=${offset}-${offset + length - 1}` },
      });
      if (response.status !== 206) {
        throw new Error(`Basemap range request answered HTTP ${response.status}, not 206`);
      }

      const data = new Uint8Array(length);
      const reader = response.body.getReader();
      let filled = 0;
      while (filled < length) {
        const { done, value } = await reader.read();
        if (done) break;
        const take = Math.min(value.length, length - filled);
        data.set(value.subarray(0, take), filled);
        filled += take;
      }
      // Whatever follows is the rest of the file, which nobody asked for.
      await reader.cancel().catch(() => {});

      if (filled < length) {
        throw new Error(`Basemap range request returned ${filled} of ${length} bytes`);
      }
      return { data: data.buffer };
    },
  };
}
