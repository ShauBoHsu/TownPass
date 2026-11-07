// 代理授權 API：兩支手機的同意、權限、撤銷、代辦紀錄
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { memoryStore } from '../src/links.js';

const store = memoryStore();
const app = createApp('test', () => store);
const call = async (method, path, body, tok) => {
  const res = await app.request(path, {
    method, headers: { 'content-type': 'application/json', ...(tok ? { 'x-link-token': tok } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
};

test('邀請 → 同意 → 代辦紀錄 → 調整權限 → 撤銷', async () => {
  const created = await call('POST', '/api/links', {
    proxyName: '金大森', memberName: '金小華', relation: '弟弟', permissions: { notify: true, query: true, apply: true, collect: true },
  });
  assert.equal(created.status, 201);
  const { code, proxyToken } = created.body;
  assert.match(code, /^\d{6}$/);

  // 弟弟的手機用邀請碼查看：看得到請求，但沒有金鑰就看不到紀錄
  const peek = await call('GET', `/api/links/${code}`);
  assert.equal(peek.body.link.status, 'pending');
  assert.equal(peek.body.logs, undefined);
  assert.equal(JSON.stringify(peek.body).includes(proxyToken), false);

  // 代理人還沒被同意前不能記錄代辦
  assert.equal((await call('POST', `/api/links/${code}/log`, { action: 'x' }, proxyToken)).status, 403);

  // 弟弟只開放通知與查詢
  const ok = await call('POST', `/api/links/${code}/consent`, { permissions: { notify: true, query: true } });
  const ownerToken = ok.body.ownerToken;
  assert.deepEqual(ok.body.link.permissions, { notify: true, query: true, apply: false, collect: false });
  assert.equal((await call('POST', `/api/links/${code}/consent`, {})).status, 409);

  // 哥哥代答一題，弟弟看得到
  assert.equal((await call('POST', `/api/links/${code}/log`, { action: '代為回答「是否住在家裡」' }, proxyToken)).status, 200);
  const ownerView = await call('GET', `/api/links/${code}`, null, ownerToken);
  assert.equal(ownerView.body.role, 'owner');
  assert.equal(ownerView.body.logs[0].action, '代為回答「是否住在家裡」');

  // 只有弟弟能調整權限
  assert.equal((await call('PATCH', `/api/links/${code}`, { permissions: { apply: true } }, proxyToken)).status, 403);
  const changed = await call('PATCH', `/api/links/${code}`, { permissions: { apply: true } }, ownerToken);
  assert.equal(changed.body.link.permissions.apply, true);

  // 弟弟撤銷：哥哥看到 revoked，也不能再記錄
  await call('PATCH', `/api/links/${code}`, { status: 'revoked' }, ownerToken);
  const proxyView = await call('GET', `/api/links/${code}`, null, proxyToken);
  assert.equal(proxyView.body.link.status, 'revoked');
  assert.equal((await call('POST', `/api/links/${code}/log`, { action: 'x' }, proxyToken)).status, 403);
  assert.ok(proxyView.body.logs.some((l) => l.action === '撤銷代理'));
});

test('找不到邀請碼、資料不完整', async () => {
  assert.equal((await call('GET', '/api/links/000000')).status, 404);
  assert.equal((await call('POST', '/api/links', { proxyName: '金大森' })).status, 400);
});
