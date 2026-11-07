// 「說說你的需要」信心度排序
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scoreBenefit, rankByNeed, normalize } from '../public/js/need.js';
import { factsFrom, evaluateAll } from '../public/js/engine.js';

const benefits = JSON.parse(readFileSync(new URL('../public/data/benefits.json', import.meta.url), 'utf8'));
const top = (text) => rankByNeed(evaluateAll(benefits, factsFrom({ birthday: '1948/03/15', citizen: true }, new Date(2026, 10, 7))), text)[0];

test('每項補助都有關鍵字', () => {
  for (const b of benefits) assert.ok(Object.keys(b.keywords ?? {}).length >= 5, `${b.id} 關鍵字太少`);
});

test('一句話找到最相關的補助', () => {
  assert.equal(top('媽媽牙齒不好，吃東西咬不動').benefit.id, 'denture');
  assert.equal(top('爸爸需要輪椅').benefit.id, 'assistive-device');
  assert.equal(top('剛生寶寶').benefit.id, 'birth-grant');
  assert.equal(top('想搭公車去看醫生').benefit.id, 'senior-card');
  assert.equal(top('失業了，房租繳不起').benefit.id, 'low-income-living');
});

test('長關鍵字優先、不重複計分；信心度在 0～100', () => {
  const den = benefits.find((b) => b.id === 'denture');
  const r = scoreBenefit(den, '假牙');
  assert.deepEqual(r.matched, ['假牙']);
  assert.ok(r.confidence > 60 && r.confidence < 100);
  assert.ok(scoreBenefit(den, '假牙壞了，缺牙咬不動').confidence > r.confidence);
});

test('否定說法不計分；沒輸入時不排序', () => {
  const dev = benefits.find((b) => b.id === 'assistive-device');
  assert.equal(scoreBenefit(dev, '不需要輪椅').confidence, 0);
  assert.equal(normalize('台北 市'), '臺北市');
  const results = evaluateAll(benefits, factsFrom({ birthday: '1988/12/12', citizen: true }));
  assert.deepEqual(rankByNeed(results, '  ').map((r) => r.benefit.id), results.map((r) => r.benefit.id));
});
