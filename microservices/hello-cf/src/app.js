// 共用的 API 路由：同一份程式碼同時跑在 Cloudflare Workers（worker.js）與 Node / Docker（node.js）
import { Hono } from 'hono';

// 只允許代理這些模型（避免變成任何人都能用的開放代理）
const HF_MODELS = [
  'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
  'Xenova/multilingual-e5-small',
];

export function createApp(runtime) {
  const app = new Hono();

  app.get('/api/hello', (c) => {
    const name = c.req.query('name') || '市民';
    return c.json({
      message: `Hello, ${name}！來自城市通微服務後端`,
      runtime,
      time: new Date().toISOString(),
    });
  });

  app.get('/api/health', (c) => c.json({ ok: true }));

  // 模型檔代理：網頁改從同網域下載模型，避開 WebView 對 huggingface.co 的 CORS 問題，
  // 並利用 Cloudflare 邊緣快取（台北節點）加速
  app.get('/hf/*', async (c) => {
    const path = c.req.path.slice('/hf/'.length);
    if (!HF_MODELS.some((m) => path.startsWith(`${m}/resolve/`))) {
      return c.json({ error: 'model not allowed' }, 403);
    }

    const cache = globalThis.caches?.default; // 只有 Workers 有
    const cacheKey = new Request(new URL(c.req.url).origin + c.req.path);
    if (cache) {
      const hit = await cache.match(cacheKey);
      if (hit) return hit;
    }

    const upstream = await fetch(`https://huggingface.co/${path}`, { redirect: 'follow' });
    if (!upstream.ok) return c.json({ error: `upstream ${upstream.status}` }, 502);

    const headers = new Headers({
      'Content-Type': upstream.headers.get('Content-Type') ?? 'application/octet-stream',
      'Cache-Control': 'public, max-age=86400',
    });
    const len = upstream.headers.get('Content-Length');
    if (len) headers.set('Content-Length', len);

    const res = new Response(upstream.body, { status: 200, headers });
    if (cache) {
      try {
        c.executionCtx.waitUntil(cache.put(cacheKey, res.clone()));
      } catch {
        // 非 Workers 環境沒有 executionCtx，略過快取
      }
    }
    return res;
  });

  app.notFound((c) => c.json({ error: 'not found' }, 404));

  return app;
}
