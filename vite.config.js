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
    // The only real reduction available was the line geometry, simplified by
    // scripts/simplify_line_geometry.cjs: 1,373 kB → 1,265 kB, essentially all
    // of it metro_lines.json. Line 4's geometry moving to public/ and the
    // react-map-gl removal were correctness and hygiene fixes — neither was in
    // the bundle to begin with, so neither saved a byte.
    //
    // Remaining option if this ever matters: lazy-load MapView so the sidebar
    // paints before the map engine arrives. It defers bytes rather than
    // removing them, which is why it was not done here.
    chunkSizeWarningLimit: 1300,
  },
  server: {
    // Browser fetch() can never set User-Agent (a forbidden header in the
    // Fetch spec), and the API requires one containing contact=, so a browser
    // context has to go through this Node-side proxy, which can set it. The
    // native iOS app has no dev server to proxy through, so it takes a
    // different path — see arrivalStore.js.
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
