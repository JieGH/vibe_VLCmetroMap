import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

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
  plugins: [
    react(),
    {
      name: 'feedback-mock-api',
      configureServer(server) {
        server.middlewares.use('/api/feedback', (req, res) => {
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ error: 'method not allowed' }));
          }
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', () => {
            try {
              const data = JSON.parse(body || '{}');
              if (!data.message || !data.message.trim()) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ error: 'message is required' }));
              }
              const cleanMsg = data.message.trim();
              const timestamp = new Date().toISOString();

              const forwarded = req.headers['x-forwarded-for'];
              const clientIp =
                (forwarded ? String(forwarded).split(',')[0].trim() : null) ||
                req.socket?.remoteAddress ||
                '127.0.0.1';

              console.log('\n================== [FEEDBACK RECEIVED] ==================');
              console.log(`Time:     ${timestamp}`);
              console.log(`IP:       ${clientIp}`);
              console.log(`Message:  ${cleanMsg}`);
              if (data.email) console.log(`Email:    ${data.email}`);
              if (data.metadata) console.log(`Metadata: ${JSON.stringify(data.metadata)}`);
              console.log('=========================================================\n');

              try {
                const entry = JSON.stringify({
                  timestamp,
                  ip: clientIp,
                  message: cleanMsg,
                  email: data.email || null,
                  metadata: data.metadata || null,
                }) + '\n';
                fs.appendFileSync(path.resolve('feedback.log.jsonl'), entry, 'utf-8');
              } catch {}

              const token = process.env.TELEGRAM_BOT_TOKEN || '8763009106:AAGwvWk6o8T0FXRVMZZuR6ANFopQ_wMB_mU';
              const chatId = process.env.TELEGRAM_CHAT_ID || '5007040501';
              if (token && chatId && typeof globalThis.fetch === 'function') {
                const safeMsg = cleanMsg.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                const safeEmail = (data.email || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                const metadata = data.metadata;
                const versionStr = metadata?.appVersion
                  ? `v${metadata.appVersion}${metadata.gitSha ? ` (${metadata.gitSha})` : ''}`
                  : '';

                const lines = [
                  `📬 <b>New Feedback on Xarxa</b>\n`,
                  `💬 <b>Message:</b>`,
                  `${safeMsg}\n`,
                  `👤 <b>User & Device Info:</b>`,
                  `• <b>IP:</b> <code>${clientIp}</code>`,
                ];
                if (metadata?.platform) lines.push(`• <b>Platform:</b> ${metadata.platform}`);
                if (metadata?.device && metadata.device !== 'Unknown') lines.push(`• <b>Device:</b> ${metadata.device}`);
                if (metadata?.screen) lines.push(`• <b>Screen:</b> <code>${metadata.screen}</code>`);
                if (metadata?.timezone) lines.push(`• <b>Timezone:</b> <code>${metadata.timezone}</code>`);
                if (metadata?.language) lines.push(`• <b>Language:</b> <code>${metadata.language}</code>`);
                if (versionStr) lines.push(`• <b>Version:</b> <code>${versionStr}</code>`);
                if (safeEmail) lines.push(`• <b>Contact:</b> <code>${safeEmail}</code>`);
                lines.push(`⏱ <b>Time:</b> <code>${timestamp}</code>`);

                const text = lines.join('\n');
                globalThis.fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
                }).catch(() => {});
              }

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                success: true,
                message: 'Feedback received',
                receivedMessage: cleanMsg,
                clientIp,
              }));
            } catch {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'invalid json' }));
            }
          });
        });
      },
    },
  ],
  test: {
    // Agent worktrees live under .claude/worktrees with their own copy of
    // every test; without this `npm test` runs them all as well.
    exclude: ['**/node_modules/**', '**/dist/**', '.claude/**'],
  },
  optimizeDeps: {
    exclude: ['maplibre-gl']
  },
  build: {
    // MapView is lazy-loaded with React.lazy so the initial bundle stays lean (~300 kB)
    // while MapLibre and its basemap stack load asynchronously in their own chunk.
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
            return 'react-vendor';
          }
        },
      },
    },
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
