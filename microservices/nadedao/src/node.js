// Node / Docker 進入點：不依賴 Cloudflare 也能執行（可移轉、可維運）
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createApp } from './app.js';

const app = createApp('node');
app.use('/*', serveStatic({ root: './public' }));

const port = Number(process.env.PORT) || 8080;
serve({ fetch: app.fetch, port }, () => {
  console.log(`listening on http://localhost:${port}`);
});
