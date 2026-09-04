import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['maplibre-gl']
  },
  build: {
    // maplibre-gl alone is ~1 MB of ES modules (546K + 470K shared), and a
    // full-screen map cannot defer its map engine for any real gain. The
    // default 500 kB warning can therefore never be satisfied, so it is raised
    // to just above the current bundle rather than silenced: that keeps it
    // working as a ratchet, tripping if the bundle grows again.
    //
    // Everything reducible has been reduced — line geometry is simplified
    // (scripts/simplify_line_geometry.cjs), line 4's OSM geometry is fetched
    // from public/ instead of imported, and react-map-gl was an unused
    // dependency. Remaining option if this ever matters: lazy-load MapView so
    // the sidebar paints before the map engine arrives.
    chunkSizeWarningLimit: 1300,
  },
  server: {
    proxy: {
      '/api/metro': {
        target: 'https://metroapi.alexbadi.es',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/metro/, ''),
        headers: {
          'User-Agent': 'vib-metro-valencia/1.0 (Web; contact=dev@example.com)'
        }
      }
    }
  }
})
