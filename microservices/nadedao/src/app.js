// 共用路由：同一份程式碼跑在 Cloudflare Workers（worker.js）與 Node / Docker（node.js）
// 補助比對在使用者手機上完成，個資不會送到後端；後端只提供健康檢查與版本資訊。
import { Hono } from 'hono';

export function createApp(runtime) {
  const app = new Hono();

  app.get('/api/health', (c) => c.json({ ok: true, service: 'nadedao', runtime }));

  app.notFound((c) => c.json({ error: 'not found' }, 404));

  return app;
}
