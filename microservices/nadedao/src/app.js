// 共用路由：同一份程式碼跑在 Cloudflare Workers（worker.js）與 Node / Docker（node.js）
// 補助比對在使用者手機上完成，個資不會送到後端。
// 後端只做兩件事：健康檢查，以及代理授權同步（同意、權限、撤銷、代辦紀錄）。
import { Hono } from 'hono';
import { registerLinkRoutes } from './links.js';

/** getStore(c)：回傳代理授權的儲存（Workers 用 D1，Node 用記憶體） */
export function createApp(runtime, getStore) {
  const app = new Hono();

  app.get('/api/health', (c) => c.json({ ok: true, service: 'nadedao', runtime }));
  registerLinkRoutes(app, getStore);

  app.notFound((c) => c.json({ error: 'not found' }, 404));

  return app;
}
