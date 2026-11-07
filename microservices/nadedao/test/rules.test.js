// 用正式的 benefits.json 驗證示範人物的比對結果（Demo 故事線）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { factsFrom, evaluateAll, nextQuestion } from '../public/js/engine.js';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const benefits = read('../public/data/benefits.json');
const questions = read('../public/data/questions.json');
const family = read('../public/data/family-demo.json');
const today = new Date(2026, 10, 7);
const statusOf = (profile) =>
  Object.fromEntries(evaluateAll(benefits, factsFrom(profile, today)).map((r) => [r.benefit.id, r.status]));

test('每個條件都有對應的問題或來自 userinfo', () => {
  const fromUserinfo = new Set(['age', 'citizen', 'nativePeople', 'town']);
  const walk = (c) => (c.anyOf ?? c.allOf ?? [c]).flatMap((x) => (x.anyOf || x.allOf ? walk(x) : [x.key]));
  for (const b of benefits) {
    for (const key of b.conditions.flatMap(walk)) {
      assert.ok(fromUserinfo.has(key) || questions[key], `${b.id} 的條件 ${key} 沒有對應的問題`);
    }
    assert.ok(b.sourceUrls.length > 0, `${b.id} 缺少官方來源`);
    assert.equal(b.verifiedAt, '2026-11-07');
  }
});

test('本人（37 歲、中山區市民）：敬老卡不符合，生育補助要回答', () => {
  const s = statusOf({ birthday: '1988/12/12', citizen: true, nativePeople: false, town: '中山區' });
  assert.equal(s['senior-card'], 'ineligible');
  assert.equal(s['birth-grant'], 'ask');
});

test('本人有新生兒且設籍滿 10 個月 → 生育補助可能符合', () => {
  const s = statusOf({ birthday: '1988/12/12', citizen: true, answers: { hasNewborn: true, residency10m: true } });
  assert.equal(s['birth-grant'], 'eligible');
});

test('媽媽（78 歲、中低收入戶）：敬老卡可能符合，低收入戶要再問收入，不會問生育補助', () => {
  const mom = family.find((f) => f.id === 'mom');
  const s = statusOf(mom);
  assert.equal(s['senior-card'], 'eligible');
  assert.equal(s['low-income-living'], 'ask');
  assert.equal(s['birth-grant'], 'ineligible');
  const results = evaluateAll(benefits, factsFrom(mom, today));
  assert.notEqual(nextQuestion(results, questions).key, 'hasNewborn');
});

test('弟弟（身障證明、列冊低收入戶）：低收入戶生活扶助可能符合，身障補助只差是否住機構', () => {
  const bro = family.find((f) => f.id === 'brother');
  const results = evaluateAll(benefits, factsFrom(bro, today));
  const s = Object.fromEntries(results.map((r) => [r.benefit.id, r.status]));
  assert.equal(s['low-income-living'], 'eligible');
  assert.equal(s['disability-allowance'], 'ask');
  const dis = results.find((r) => r.benefit.id === 'disability-allowance');
  assert.deepEqual(dis.missing, ['notInstitutionalized']);
  const s2 = statusOf({ ...bro, answers: { ...bro.answers, notInstitutionalized: true } });
  assert.equal(s2['disability-allowance'], 'eligible');
});

test('女兒（出生 18 天、監護人代理）：生育補助自動判斷可能符合，不必再問有沒有新生兒', () => {
  const kid = family.find((f) => f.id === 'daughter');
  const s = statusOf(kid);
  assert.equal(s['birth-grant'], 'eligible');
  assert.equal(s['senior-card'], 'ineligible');
  // 出生超過 60 天就不再符合
  const late = statusOf({ ...kid, birthday: '2026/08/01' });
  assert.equal(late['birth-grant'], 'ineligible');
});

test('示範資料涵蓋長者、兒童、身心障礙三種代理對象', () => {
  assert.deepEqual(family.map((f) => f.persona).sort(), ['兒童', '身心障礙', '長者'].sort());
});

test('影響項目一樣多時，先問離結論最近的補助（弟弟先問是否住機構，不是先問新生兒）', () => {
  const bro = family.find((f) => f.id === 'brother');
  const results = evaluateAll(benefits, factsFrom(bro, today));
  assert.equal(nextQuestion(results, questions).key, 'notInstitutionalized');
});

test('媽媽（78 歲、中低收入戶）：假牙補助可能符合，但要本人去診所（不能代辦）', () => {
  const mom = family.find((f) => f.id === 'mom');
  assert.equal(statusOf(mom)['denture'], 'eligible');
  assert.equal(benefits.find((b) => b.id === 'denture').proxyAllowed, false);
  // 一般戶 70 歲：要問有沒有領中低收入老人生活津貼
  const r = evaluateAll(benefits, factsFrom({ birthday: '1956/01/01', citizen: true, answers: { incomeStatus: 'none' } }, today));
  const den = r.find((x) => x.benefit.id === 'denture');
  assert.equal(den.status, 'ask');
  assert.ok(den.missing.includes('midLowSeniorAllowance'));
  // 50 歲低收入戶：年齡未滿 55，不符合
  assert.equal(statusOf({ birthday: '1976/01/01', citizen: true, answers: { incomeStatus: 'low' } })['denture'], 'ineligible');
});

test('弟弟：輔具補助要問需不需要；已經先買了就不符合（要先申請才能買）', () => {
  const bro = family.find((f) => f.id === 'brother');
  const answers = { ...bro.answers, notInstitutionalized: true };
  const results = evaluateAll(benefits, factsFrom({ ...bro, answers }, today));
  assert.equal(results.find((r) => r.benefit.id === 'assistive-device').status, 'ask');
  // 回答住在家裡之後，下一題問輔具，不問新生兒
  assert.equal(nextQuestion(results, questions).key, 'needsDevice');
  assert.equal(statusOf({ ...bro, answers: { ...answers, needsDevice: true, notPurchasedYet: true } })['assistive-device'], 'eligible');
  assert.equal(statusOf({ ...bro, answers: { ...answers, needsDevice: true, notPurchasedYet: false } })['assistive-device'], 'ineligible');
});

test('每個臨櫃管道都有窗口資料或地圖搜尋字', () => {
  const offices = read('../public/data/offices.json');
  const tables = { householdOffice: 'householdOffices', districtOffice: 'districtOffices', assistiveCenter: 'assistiveCenters' };
  for (const b of benefits) {
    for (const ch of b.applyChannels.filter((c) => c.type === '臨櫃')) {
      if (tables[ch.where]) assert.equal(Object.keys(offices[tables[ch.where]]).length, 12, `${b.id} 的窗口沒有涵蓋 12 區`);
      else assert.ok(ch.mapQuery, `${b.id} 的「${ch.label}」沒有地圖搜尋字`);
    }
  }
});

test('列冊身分可以省略收入與財產題；沒有列冊才問', () => {
  const base = { birthday: '1960/01/01', citizen: true, answers: { disabilityCard: true, notInstitutionalized: true } };
  const r1 = evaluateAll(benefits, factsFrom(base, today));
  assert.equal(nextQuestion(r1, questions).key, 'incomeStatus');
  const r2 = evaluateAll(benefits, factsFrom({ ...base, answers: { ...base.answers, incomeStatus: 'none' } }, today));
  const dis = r2.find((r) => r.benefit.id === 'disability-allowance');
  assert.deepEqual(dis.missing.sort(), ['assetsDisability', 'income39960']);
});
