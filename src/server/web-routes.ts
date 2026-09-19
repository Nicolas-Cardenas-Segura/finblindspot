import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { registerApiRoute } from '@mastra/core/server';

async function publicFile(name: string): Promise<string> {
  const paths = [resolve('.mastra/output/public', name), resolve('src/mastra/public', name)];
  for (const path of paths) { try { return await readFile(path, 'utf8'); } catch { } }
  throw new Error('Web assets unavailable; run npm run build:web');
}
export const webRoutes = [registerApiRoute('/assets/:filename', {
  method: 'GET', requiresAuth: false,
  handler: async c => {
    const filename = c.req.param('filename');
    if (!/^[A-Za-z0-9_-]+\.(js|css)$/.test(filename)) return c.text('Not found', 404);
    try {
      c.header('Content-Type', filename.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8');
      c.header('X-Content-Type-Options', 'nosniff');
      c.header('Cache-Control', 'public, max-age=31536000, immutable');
      return c.body(await publicFile(`assets/${filename}`));
    } catch { return c.text('Not found', 404); }
  },
}), ...['/', '/r/:token', '/evidence', '/how-it-works'].map(path => registerApiRoute(path, {
  method: 'GET', requiresAuth: false,
  handler: async c => {
    c.header('Cache-Control', 'no-store');
    c.header('Referrer-Policy', 'no-referrer');
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    try { return c.html(await publicFile('index.html')); } catch { return c.text('Web assets are not built yet.', 503); }
  },
}))];
