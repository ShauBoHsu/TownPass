// 比較「關鍵字比對」與「embedding + 範例句（kNN）」在繁中測試句上的準確度與速度
// 用法：npm run bench
import { readFileSync } from 'node:fs';
import { pipeline, env } from '@huggingface/transformers';

env.cacheDir = './.model-cache';

// 用法：node bench/run.js [catalog.json] [testset.json]（預設為陳情分派的資料）
const [catPath = 'data/catalog.json', testPath = 'data/testset.json'] = process.argv.slice(2);
const catalog = JSON.parse(readFileSync(catPath, 'utf8'));
const testset = JSON.parse(readFileSync(testPath, 'utf8'));
const outOfScope = JSON.parse(readFileSync('data/limits.json', 'utf8')).outOfScope;
const names = Object.fromEntries(catalog.map((c) => [c.id, c.name]));
const groupOf = Object.fromEntries(catalog.map((c) => [c.id, c.group]));
const okIds = (t) => [t.label, ...(t.alsoOk ?? [])];
console.log(`類別清單：${catPath}（${catalog.length} 類）｜測試集：${testPath}（${testset.length} 句）`);

// ---------- 1. 關鍵字比對 ----------
function keywordRank(text) {
  return catalog
    .map((c) => ({ id: c.id, score: c.keywords.filter((k) => text.includes(k)).length }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
}

// ---------- 2. embedding + 範例句 ----------
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0); // 已 normalize，內積 = cosine

async function buildEmbedder(model, prefix) {
  const t0 = performance.now();
  const extractor = await pipeline('feature-extraction', model, { dtype: 'q8' });
  const loadMs = performance.now() - t0;
  const embed = async (texts) => {
    const out = await extractor(texts.map((t) => prefix + t), { pooling: 'mean', normalize: true });
    return out.tolist();
  };
  // 預先把範例句轉成向量（實際使用時可以在 build 階段先算好存成 JSON）
  const t1 = performance.now();
  const exampleVecs = [];
  for (const c of catalog) {
    const vecs = await embed(c.examples);
    vecs.forEach((v, i) => exampleVecs.push({ id: c.id, text: c.examples[i], v }));
  }
  const indexMs = performance.now() - t1;
  return { embed, exampleVecs, loadMs, indexMs };
}

function knnRank(qv, exampleVecs) {
  const best = {};
  for (const e of exampleVecs) {
    const s = dot(qv, e.v);
    if (!best[e.id] || s > best[e.id].score) best[e.id] = { id: e.id, score: s, nearest: e.text };
  }
  return Object.values(best).sort((a, b) => b.score - a.score);
}

// 混合計分：embedding 相似度 + 關鍵字命中加分（每個命中 +KW_BONUS，最多計 2 個）
const KW_BONUS = 0.08;
const kwById = Object.fromEntries(catalog.map((c) => [c.id, c.keywords]));
function hybridRank(text, rank) {
  return rank
    .map((r) => {
      const hits = kwById[r.id].filter((k) => text.includes(k));
      return { ...r, score: r.score + KW_BONUS * Math.min(hits.length, 2), hits };
    })
    .sort((a, b) => b.score - a.score);
}

// ---------- 評分 ----------
function report(title, results) {
  const n = results.length;
  const top1 = results.filter((r) => okIds(r).includes(r.rank[0]?.id)).length;
  const top3 = results.filter((r) => r.rank.slice(0, 3).some((x) => okIds(r).includes(x.id))).length;
  const none = results.filter((r) => r.rank.length === 0).length;
  console.log(`\n=== ${title} ===`);
  console.log(`Top-1 準確度：${top1}/${n}（${((top1 / n) * 100).toFixed(0)}%）`);
  console.log(`Top-3 命中率：${top3}/${n}（${((top3 / n) * 100).toFixed(0)}%）`);
  if (none) console.log(`完全沒有結果：${none}/${n}`);
  const wrong = results.filter((r) => !okIds(r).includes(r.rank[0]?.id));
  for (const r of wrong) {
    const got = r.rank[0] ? `${names[r.rank[0].id]}${r.rank[0].nearest ? `（最像「${r.rank[0].nearest}」 ${r.rank[0].score.toFixed(3)}）` : ''}` : '（無結果）';
    console.log(`  ✗ 「${r.text}」 應為 ${names[r.label]} → ${got}`);
  }
  return { top1, top3, n };
}

const summary = [];

const kw = testset.map((t) => ({ ...t, rank: keywordRank(t.text) }));
summary.push({ method: '關鍵字比對', ...report('關鍵字比對', kw) });

const MODELS = [
  { model: 'Xenova/multilingual-e5-small', prefix: 'query: ', label: 'multilingual-e5-small (q8)' },
  { model: 'Xenova/paraphrase-multilingual-MiniLM-L12-v2', prefix: '', label: 'paraphrase-multilingual-MiniLM-L12-v2 (q8)' },
];

for (const m of MODELS) {
  const { embed, exampleVecs, loadMs, indexMs } = await buildEmbedder(m.model, m.prefix);
  await embed(['暖機']); // warmup
  const times = [];
  const res = [];
  const hyb = [];
  for (const t of testset) {
    const t0 = performance.now();
    const [qv] = await embed([t.text]);
    const rank = knnRank(qv, exampleVecs);
    times.push(performance.now() - t0);
    res.push({ ...t, rank });
    hyb.push({ ...t, rank: hybridRank(t.text, rank) });
  }
  const h = report(`${m.label} + 關鍵字加分`, hyb);
  summary.push({ method: `${m.label} + 關鍵字`, ...h });
  const r = report(m.label, res);
  times.sort((a, b) => a - b);
  const p50 = times[Math.floor(times.length / 2)];
  const p95 = times[Math.floor(times.length * 0.95)];
  // 信心：第 1 名與第 2 名的差距，差距小代表該讓使用者自己選
  const margins = res.map((x) => x.rank[0].score - x.rank[1].score);
  const lowConf = res.filter((x, i) => margins[i] < 0.02);
  const lowConfWrong = lowConf.filter((x) => x.rank[0].id !== x.label).length;
  console.log(`載入模型 ${(loadMs / 1000).toFixed(1)} s；建立範例索引 ${indexMs.toFixed(0)} ms（${exampleVecs.length} 句）`);
  console.log(`每句判斷 p50 ${p50.toFixed(1)} ms / p95 ${p95.toFixed(1)} ms（Node CPU）`);
  console.log(`低信心（第1、2名差 < 0.02）：${lowConf.length} 句，其中答錯 ${lowConfWrong} 句`);

  // 大類層級：如果先只判斷大類（例如「App 功能」「城市生活」），準確度是多少
  if (catalog.every((c) => c.group)) {
    const g1 = res.filter((x) => okIds(x).some((id) => groupOf[id] === groupOf[x.rank[0].id])).length;
    console.log(`大類層級 Top-1（${new Set(catalog.map((c) => c.group)).size} 個大類）：${g1}/${res.length}（${Math.round((g1 / res.length) * 100)}%）`);
  }

  // 範圍外偵測：第 1 名分數低於門檻 → 視為「找不到服務」
  const inScores = res.map((x) => x.rank[0].score);
  const oosScores = [];
  for (const q of outOfScope) oosScores.push(knnRank((await embed([q]))[0], exampleVecs)[0].score);
  let bestTh = null;
  for (const th of [...inScores, ...oosScores].sort((a, b) => a - b)) {
    const kept = inScores.filter((s) => s >= th).length;
    const rej = oosScores.filter((s) => s < th).length;
    const sc = kept / inScores.length + rej / oosScores.length;
    if (!bestTh || sc > bestTh.sc) bestTh = { th, kept, rej, sc };
  }
  console.log(`範圍外偵測：最佳門檻 ${bestTh.th.toFixed(3)} → 範圍內保留 ${bestTh.kept}/${inScores.length}、範圍外擋下 ${bestTh.rej}/${oosScores.length}`);
  summary.push({ method: m.label, ...r, p50: p50.toFixed(1) });
}

console.log('\n=== 總表 ===');
console.table(summary.map((s) => ({ 方法: s.method, 'Top-1': `${s.top1}/${s.n}`, 'Top-3': `${s.top3}/${s.n}`, 'p50 ms': s.p50 ?? '-' })));
