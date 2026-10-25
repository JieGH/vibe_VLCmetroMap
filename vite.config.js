import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'

// Build-time date-stamp injected as a global constant so the running app can
// always report which build it is. Format: YYYY.MM.DD (UTC). Baked in at
// compile time — no manual version bump needed.
const buildDate = new Date().toISOString().slice(0, 10).replace(/-/g, '.');

// The commit this build was made from, short: shown beside the version so a tester can tell which build is
// running. Hosts that build from a tarball set the commit in the environment; otherwise ask git.
const gitSha = (() => {
  const fromEnv = process.env.WORKERS_CI_COMMIT_SHA || process.env.COMMIT_REF || process.env.CF_PAGES_COMMIT_SHA;
  if (fromEnv) return fromEnv.slice(0, 7);
  try {
    return execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'dev';
  }
})();

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(buildDate),
    __GIT_SHA__: JSON.stringify(gitSha),
  },
  plugins: [react()],
  test: {
    // Agent worktrees live under .claude/worktrees with their own copy of
    // every test; without this `npm test` runs them all as well.
    exclude: ['**/node_modules/**', '**/dist/**', '.claude/**'],
  },
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
    // FGV's CORS policy admits only FGV's own sites, so a browser has to reach
    // its live feed through this same-origin proxy. The native iOS app calls
    // FGV directly — see arrivalStore.js. In production
    // netlify/functions/metro-proxy.js does the same forwarding; keep the two
    // targets in sync. See ADR-0005.
    proxy: {
      '/api/metro': {
        target: 'https://www.fgv.es',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/metro/, '/fgv/app/es/api/v1/V'),
      }
    }
  }
})
