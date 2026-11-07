// 代理授權 API：讓代理人與被代理人的兩支手機同步「同意、權限、撤銷、代辦紀錄」
// 只存授權狀態與代辦紀錄；補助資格、收入、回答都留在手機上，不經過這裡。
//
// POST   /api/links                    代理人建立邀請 → { code, proxyToken }
// GET    /api/links/:code              查看邀請（帶金鑰時附代辦紀錄）
// POST   /api/links/:code/consent      被代理人同意（或拒絕）→ { ownerToken }
// PATCH  /api/links/:code              被代理人調整權限、任一方撤銷
// POST   /api/links/:code/log          代理人記錄一筆代辦

const PERMS = ['notify', 'query', 'apply', 'collect'];
const PENDING_TTL_MS = 24 * 60 * 60 * 1000;

const now = () => new Date().toISOString();
const token = () => crypto.randomUUID().replace(/-/g, '');
const clean = (s, max = 40) => String(s ?? '').trim().slice(0, max);
const perms = (obj) => Object.fromEntries(PERMS.map((k) => [k, obj?.[k] === true]));
const sixDigits = () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0');

/** Cloudflare D1 */
export function d1Store(db) {
  const row = (r) => r && { ...r, requested: JSON.parse(r.requested), permissions: JSON.parse(r.permissions) };
  return {
    async get(code) { return row(await db.prepare('SELECT * FROM links WHERE code = ?').bind(code).first()); },
    async insert(l) {
      await db.prepare(`INSERT INTO links (code, proxy_token, owner_token, proxy_name, member_name, relation, status, requested, permissions, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(l.code, l.proxy_token, null, l.proxy_name, l.member_name, l.relation, l.status, JSON.stringify(l.requested), JSON.stringify(l.permissions), l.created_at, l.updated_at)
        .run();
    },
    async update(code, f) {
      await db.prepare('UPDATE links SET status = ?, permissions = ?, owner_token = ?, updated_at = ? WHERE code = ?')
        .bind(f.status, JSON.stringify(f.permissions), f.owner_token ?? null, f.updated_at, code).run();
    },
    async addLog(code, actor, action) {
      await db.prepare('INSERT INTO link_logs (code, at, actor, action) VALUES (?, ?, ?, ?)').bind(code, now(), actor, action).run();
    },
    async logs(code) {
      const { results } = await db.prepare('SELECT at, actor, action FROM link_logs WHERE code = ? ORDER BY id DESC LIMIT 30').bind(code).all();
      return results;
    },
  };
}

/** Node / Docker：記憶體版（重開就清空，示範與開發用） */
export function memoryStore() {
  const links = new Map();
  const logs = new Map();
  return {
    async get(code) { const l = links.get(code); return l && structuredClone(l); },
    async insert(l) { links.set(l.code, structuredClone({ ...l, owner_token: null })); },
    async update(code, f) { links.set(code, { ...links.get(code), ...structuredClone(f) }); },
    async addLog(code, actor, action) { logs.set(code, [{ at: now(), actor, action }, ...(logs.get(code) ?? [])].slice(0, 30)); },
    async logs(code) { return logs.get(code) ?? []; },
  };
}

/** 對外的樣子：不回傳金鑰 */
function view(l) {
  return {
    code: l.code, proxyName: l.proxy_name, memberName: l.member_name, relation: l.relation,
    status: l.status, requested: l.requested, permissions: l.permissions, updatedAt: l.updated_at,
  };
}

function roleOf(l, t) {
  if (t && t === l.proxy_token) return 'proxy';
  if (t && l.owner_token && t === l.owner_token) return 'owner';
  return null;
}

export function registerLinkRoutes(app, getStore) {
  app.post('/api/links', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const proxyName = clean(body.proxyName);
    const memberName = clean(body.memberName);
    const relation = clean(body.relation, 10);
    if (!proxyName || !memberName || !relation) return c.json({ error: '缺少姓名或關係' }, 400);
    const store = getStore(c);
    let code;
    for (let i = 0; i < 5 && !code; i++) {
      const candidate = sixDigits();
      if (!(await store.get(candidate))) code = candidate;
    }
    if (!code) return c.json({ error: '請再試一次' }, 503);
    const t = now();
    const link = {
      code, proxy_token: token(), proxy_name: proxyName, member_name: memberName, relation,
      status: 'pending', requested: perms(body.permissions), permissions: perms({}), created_at: t, updated_at: t,
    };
    await store.insert(link);
    await store.addLog(code, proxyName, `送出代理邀請給${memberName}`);
    return c.json({ code, proxyToken: link.proxy_token, link: view(link) }, 201);
  });

  app.get('/api/links/:code', async (c) => {
    const store = getStore(c);
    const l = await store.get(c.req.param('code'));
    if (!l) return c.json({ error: '找不到這個邀請碼' }, 404);
    if (l.status === 'pending' && Date.now() - Date.parse(l.created_at) > PENDING_TTL_MS) {
      return c.json({ error: '邀請已過期，請對方重新邀請' }, 410);
    }
    const role = roleOf(l, c.req.header('x-link-token'));
    return c.json({ link: view(l), role, logs: role ? await store.logs(l.code) : undefined });
  });

  app.post('/api/links/:code/consent', async (c) => {
    const store = getStore(c);
    const l = await store.get(c.req.param('code'));
    if (!l) return c.json({ error: '找不到這個邀請碼' }, 404);
    if (l.status !== 'pending') return c.json({ error: '這個邀請已經處理過了' }, 409);
    const body = await c.req.json().catch(() => ({}));
    const t = now();
    if (body.accept === false) {
      await store.update(l.code, { status: 'declined', permissions: perms({}), owner_token: null, updated_at: t });
      await store.addLog(l.code, l.member_name, '拒絕代理邀請');
      return c.json({ ok: true });
    }
    const ownerToken = token();
    const p = perms(body.permissions);
    await store.update(l.code, { status: 'granted', permissions: p, owner_token: ownerToken, updated_at: t });
    const opened = PERMS.filter((k) => p[k]).map((k) => LABELS[k]).join('、') || '沒有開放任何權限';
    await store.addLog(l.code, l.member_name, `同意代理（開放：${opened}）`);
    return c.json({ ownerToken, link: view({ ...l, status: 'granted', permissions: p, updated_at: t }) });
  });

  app.patch('/api/links/:code', async (c) => {
    const store = getStore(c);
    const l = await store.get(c.req.param('code'));
    if (!l) return c.json({ error: '找不到這個邀請碼' }, 404);
    const role = roleOf(l, c.req.header('x-link-token'));
    if (!role) return c.json({ error: '沒有權限' }, 403);
    const body = await c.req.json().catch(() => ({}));
    const t = now();
    if (body.status === 'revoked') {
      await store.update(l.code, { status: 'revoked', permissions: perms({}), owner_token: l.owner_token, updated_at: t });
      await store.addLog(l.code, role === 'owner' ? l.member_name : l.proxy_name, '撤銷代理');
      return c.json({ ok: true });
    }
    if (role !== 'owner' || l.status !== 'granted') return c.json({ error: '只有被代理人可以調整權限' }, 403);
    const p = perms({ ...l.permissions, ...body.permissions });
    await store.update(l.code, { status: l.status, permissions: p, owner_token: l.owner_token, updated_at: t });
    const changed = PERMS.filter((k) => p[k] !== l.permissions[k]).map((k) => `${p[k] ? '開放' : '關閉'}「${LABELS[k]}」`).join('、');
    if (changed) await store.addLog(l.code, l.member_name, changed);
    return c.json({ link: view({ ...l, permissions: p, updated_at: t }) });
  });

  app.post('/api/links/:code/log', async (c) => {
    const store = getStore(c);
    const l = await store.get(c.req.param('code'));
    if (!l) return c.json({ error: '找不到這個邀請碼' }, 404);
    if (roleOf(l, c.req.header('x-link-token')) !== 'proxy' || l.status !== 'granted') return c.json({ error: '沒有權限' }, 403);
    const body = await c.req.json().catch(() => ({}));
    const action = clean(body.action, 80);
    if (!action) return c.json({ error: '缺少內容' }, 400);
    await store.addLog(l.code, l.proxy_name, action);
    return c.json({ ok: true });
  });
}

const LABELS = { notify: '接收補助通知', query: '查詢資格', apply: '代為申請', collect: '代為領取' };
