import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', 'assets');
// The game server the port talks to (login, robots, lobby, matches). A test server by
// default; never the shared one on 8090 while developing.
const server = process.env.RR_SERVER ?? 'http://127.0.0.1:8091';

// The extracted game assets (port/assets, never committed) are served as /assets.
export default defineConfig({
  publicDir: false,
  server: {
    port: 8092,
    host: '127.0.0.1',
    fs: { allow: ['..'] },
    proxy: {
      // Keep the Host header: the server builds main.ini's URLs from it, and they must
      // point back here (same origin).
      '/api': { target: server, changeOrigin: false },
      '^/game/': { target: server, changeOrigin: false },
      '/ws': { target: server, ws: true, changeOrigin: false },
    },
  },
  // The production build is the game (game.html, from the loader), served by the game
  // server (server/index.mjs, APP_DIR) as its front page, and the privacy page; the other
  // pages are dev tools that need the dev server. Its hashed files go to /app: /assets
  // is the game's.
  build: {
    assetsDir: 'app',
    chunkSizeWarningLimit: 1500,
    rollupOptions: { input: { game: 'game.html', ...(existsSync(join(here, 'privacy.html')) && { privacy: 'privacy.html' }) } },
  },
  plugins: [
    {
      name: 'game-assets',
      configureServer(server) {
        server.middlewares.use('/assets', async (req, res, next) => {
          const path = normalize(join(root, decodeURIComponent((req.url ?? '/').split('?')[0])));
          if (!path.startsWith(root)) return next();
          try {
            const data = await readFile(path);
            const type = path.endsWith('.json') ? 'application/json' : path.endsWith('.png') ? 'image/png' : 'application/octet-stream';
            res.setHeader('Content-Type', type);
            res.end(data);
          } catch {
            next();
          }
        });
      },
    },
  ],
});
