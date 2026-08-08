import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/**
 * Dev-only screenshot sink so the game can be verified headlessly:
 *
 *   await fetch('/__snap?name=title', { method: 'POST', body: canvas.toDataURL('image/png') })
 *
 * Writes shots/<name>.png. Never included in a production build.
 */
function snapshotSink(): Plugin {
  return {
    name: 'tajo-snapshot-sink',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__snap', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('POST only');
          return;
        }
        const url = new URL(req.url ?? '/', 'http://localhost');
        const name = (url.searchParams.get('name') ?? 'shot').replace(/[^a-z0-9_-]/gi, '');
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          const b64 = body.slice(body.indexOf(',') + 1);
          const dir = resolve(server.config.root, 'shots');
          mkdirSync(dir, { recursive: true });
          const file = resolve(dir, `${name}.png`);
          writeFileSync(file, Buffer.from(b64, 'base64'));
          res.statusCode = 200;
          res.end(file);
        });
      });
    },
  };
}

export default defineConfig({
  /**
   * Relative so the same build works at the domain root and at a GitHub Pages
   * project path (kvothesson.github.io/tajo/) without hardcoding the repo name.
   */
  base: './',
  server: { port: 5178 },
  build: { target: 'es2022' },
  plugins: [snapshotSink()],
});
