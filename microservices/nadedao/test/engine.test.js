import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ageFrom, factsFrom, evaluateBenefit, evaluateAll, nextQuestion } from '../public/js/engine.js';

const today = new Date(2026, 10, 7); // 2026-11-07

test('ageFrom 足歲計算（生日前後）', () => {
  assert.equal(ageFrom('1961/11/07', today), 65);
  assert.equal(ageFrom('1961/11/08', today), 64);
  assert.equal(ageFrom('1961-12-01', today), 64);
  assert.equal(ageFrom('', today), undefined);
});

const seniorCard = {
  id: 'senior-card',
  conditions: [
    { key: 'citizen', op: '==', value: true, label: '設籍臺北市' },
    {
      anyOf: [
        { key: 'age', op: '>=', value: 65, label: '年滿 65 歲' },
        { allOf: [
          { key: 'nativePeople', op: '==', value: true, label: '原住民' },
          { key: 'age', op: '>=', value: 55, label: '年滿 55 歲' },
        ], label: '原住民年滿 55 歲' },
      ],
      label: '年滿 65 歲，或原住民年滿 55 歲',
    },
  ],
};

const lowIncome = {
  id: 'low-income-living',
  conditions: [
    { key: 'citizen', op: '==', value: true, label: '設籍臺北市' },
    { key: 'incomeStatus', op: '==', value: 'low', label: '列冊低收入戶' },
  ],
};

test('敬老卡：65 歲市民可能符合', () => {
  const r = evaluateBenefit(seniorCard, factsFrom({ birthday: '1947/03/15', citizen: true, nativePeople: false }, today));
  assert.equal(r.status, 'eligible');
});

test('敬老卡：原住民 56 歲可能符合、一般 56 歲不符合', () => {
  const f1 = factsFrom({ birthday: '1970/01/01', citizen: true, nativePeople: true }, today);
  const f2 = factsFrom({ birthday: '1970/01/01', citizen: true, nativePeople: false }, today);
  assert.equal(evaluateBenefit(seniorCard, f1).status, 'eligible');
  assert.equal(evaluateBenefit(seniorCard, f2).status, 'ineligible');
});

test('非市民一律不符合市府補助', () => {
  const r = evaluateBenefit(seniorCard, factsFrom({ birthday: '1940/01/01', citizen: false }, today));
  assert.equal(r.status, 'ineligible');
});

test('收入身分未回答 → 要回答；回答後才有結果', () => {
  const base = { birthday: '1990/01/01', citizen: true };
  assert.equal(evaluateBenefit(lowIncome, factsFrom(base, today)).status, 'ask');
  assert.equal(evaluateBenefit(lowIncome, factsFrom({ ...base, answers: { incomeStatus: 'low' } }, today)).status, 'eligible');
  assert.equal(evaluateBenefit(lowIncome, factsFrom({ ...base, answers: { incomeStatus: 'none' } }, today)).status, 'ineligible');
  assert.equal(evaluateBenefit(lowIncome, factsFrom({ ...base, answers: { incomeStatus: 'unknown' } }, today)).status, 'ask');
});

test('已知不符合的條件優先於未知：直接判定不符合', () => {
  const r = evaluateBenefit(lowIncome, factsFrom({ birthday: '1990/01/01', citizen: false }, today));
  assert.equal(r.status, 'ineligible');
});

test('排序：可能符合 → 要回答 → 不符合；下一題選影響最多補助的事實', () => {
  const facts = factsFrom({ birthday: '1947/03/15', citizen: true }, today);
  const results = evaluateAll([lowIncome, seniorCard], facts);
  assert.deepEqual(results.map((r) => r.status), ['eligible', 'ask']);
  const q = nextQuestion(results, { incomeStatus: { text: '是否為低收入戶？' } });
  assert.equal(q.key, 'incomeStatus');
  assert.equal(q.affects, 1);
});
