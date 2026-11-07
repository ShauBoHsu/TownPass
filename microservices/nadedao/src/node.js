// Node / Docker 進入點：不依賴 Cloudflare 也能執行（可移轉、可維運）
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createApp } from './app.js';
import { memoryStore } from './links.js';

// 代理授權用記憶體儲存（重開清空）；正式環境可換成資料庫
const store = memoryStore();
const app = createApp('node', () => store);
app.use('/*', serveStatic({ root: './public' }));

const port = Number(process.env.PORT) || 8080;
serve({ fetch: app.fetch, port }, () => {
  console.log(`listening on http://localhost:${port}`);
});
