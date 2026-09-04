import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['maplibre-gl']
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
