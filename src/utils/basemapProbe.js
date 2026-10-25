import { Protocol, PMTiles } from 'pmtiles';
import { loadChunkManifest, createChunkedSource } from './chunkedSource';

export const getBasemapDir = () => (
  typeof window !== 'undefined' && window.location
    ? `${window.location.origin}/basemap`
    : '/basemap'
);

export const getBasemapArchive = () => `${getBasemapDir()}/valencia.pmtiles`;

/**
 * Checks if the offline vector basemap is available, guarding against SPA 200 OK HTML fallback pages.
 */
export const probeOfflineBasemap = async (
  archiveUrl = getBasemapArchive(),
  fetchImpl = (...args) => fetch(...args),
  protocol = null
) => {
  // A host that cannot answer Range requests ships the archive as parts plus a manifest (split_basemap.cjs).
  const manifest = await loadChunkManifest(archiveUrl, fetchImpl);
  if (manifest) {
    if (protocol) {
      protocol.add(new PMTiles(createChunkedSource(manifest, archiveUrl, fetchImpl)));
    }
    return true;
  }
  try {
    const probe = await fetchImpl(archiveUrl, { headers: { Range: 'bytes=0-0' } });
    const contentType = (probe.headers?.get?.('content-type') || '').toLowerCase();
    // SPA hosts (Netlify, Cloudflare Workers static assets) answer missing paths with index.html (200 OK).
    // Ensure the response is OK, not HTML, and contains the valid binary PMTiles header ('P', 'M').
    if (probe.ok && !contentType.includes('text/html') && probe.status !== 404) {
      const buffer = await probe.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      if (bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4D) {
        return true;
      }
    }
    console.warn(
      `Offline basemap unavailable (HTTP ${probe.status}); falling back to online raster tiles, ` +
      'which stop resolving past zoom 16. Run `npm run fetch:basemap`.'
    );
    return false;
  } catch (error) {
    console.warn('Offline basemap unreachable; falling back to online raster tiles.', error);
    return false;
  }
};
