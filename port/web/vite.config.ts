import { readFile } from 'node:fs/promises';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');

// The extracted game assets (port/assets, never committed) are served as /assets.
export default defineConfig({
  publicDir: false,
  server: { port: 8092, host: '127.0.0.1', fs: { allow: ['..'] } },
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
