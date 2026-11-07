// 能力邊界測試（只測量，不修改 catalog）：node bench/limits.js
//  A. 範例數量曲線  B. 類別數量擴充  C. 範圍外偵測  D. 輸入穩健度
import { readFileSync } from 'node:fs';
import { pipeline, env } from '@huggingface/transformers';

env.cacheDir = './.model-cache';
const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const catalog = read('../data/catalog.json');
const testset = read('../data/testset.json');
const limits = read('../data/limits.json');
const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
const pct = (a, n) => `${a}/${n}（${Math.round((a / n) * 100)}%）`;

const MODELS = [
  { id: 'Xenova/paraphrase-multilingual-MiniLM-L12-v2', prefix: '', label: 'MiniLM' },
  { id: 'Xenova/multilingual-e5-small', prefix: 'query: ', label: 'e5-small' },
];

for (const m of MODELS) {
  console.log(`\n################ ${m.label} ################`);
  const ex = await pipeline('feature-extraction', m.id, { dtype: 'q8' });
  const memo = new Map();
  const embed = async (texts) => {
    const todo = texts.filter((t) => !memo.has(t));
    if (todo.length) {
      const out = (await ex(todo.map((t) => m.prefix + t), { pooling: 'mean', normalize: true })).tolist();
      todo.forEach((t, i) => memo.set(t, out[i]));
    }
    return texts.map((t) => memo.get(t));
  };

  const buildIndex = async (cats, k = Infinity) => {
    const idx = [];
    for (const c of cats) {
      const exs = c.examples.slice(0, k);
      (await embed(exs)).forEach((v, i) => idx.push({ id: c.id, text: exs[i], v }));
    }
    return idx;
  };
  const rank = (qv, idx) => {
    const best = {};
    for (const e of idx) {
      const s = dot(qv, e.v);
      if (!best[e.id] || s > best[e.id].score) best[e.id] = { id: e.id, score: s, nearest: e.text };
    }
    return Object.values(best).sort((a, b) => b.score - a.score);
  };
  const evalSet = async (items, idx) => {
    const vecs = await embed(items.map((t) => t.text));
    let t1 = 0, t3 = 0;
    const rows = items.map((t, i) => {
      const r = rank(vecs[i], idx);
      const ok = [t.label, ...(t.alsoOk ?? [])];
      const hit1 = ok.includes(r[0].id);
      const hit3 = r.slice(0, 3).some((x) => ok.includes(x.id));
      t1 += hit1; t3 += hit3;
      return { ...t, r, hit1, hit3 };
    });
    return { t1, t3, n: items.length, rows };
  };

  // ---------- A. 範例數量曲線 ----------
  console.log('\n[A] 每類範例句數量 vs 準確度（12 類，34 句測試）');
  for (const k of [1, 2, 3, 4, 6]) {
    const { t1, t3, n } = await evalSet(testset, await buildIndex(catalog, k));
    console.log(`  每類 ${k} 句：Top-1 ${pct(t1, n)}   Top-3 ${pct(t3, n)}`);
  }

  // ---------- B. 類別數量擴充 ----------
  console.log('\n[B] 類別數量 vs 準確度（加入干擾類別，測試句不變）');
  for (const d of [0, 4, 8, 12]) {
    const cats = [...catalog, ...limits.distractors.slice(0, d)];
    const { t1, t3, n, rows } = await evalSet(testset, await buildIndex(cats));
    const stolen = rows.filter((r) => !r.hit1 && limits.distractors.some((x) => x.id === r.r[0].id)).length;
    console.log(`  ${String(cats.length).padStart(2)} 類：Top-1 ${pct(t1, n)}   Top-3 ${pct(t3, n)}   被干擾類別搶走 ${stolen} 句`);
  }

  // ---------- C. 範圍外偵測 ----------
  console.log('\n[C] 範圍外偵測：第 1 名分數的分布（12 類）');
  const idx = await buildIndex(catalog);
  const inRes = await evalSet(testset, idx);
  const inScores = inRes.rows.map((r) => r.r[0].score).sort((a, b) => a - b);
  const oosVecs = await embed(limits.outOfScope);
  const oos = limits.outOfScope.map((t, i) => ({ text: t, top: rank(oosVecs[i], idx)[0] }));
  const oosScores = oos.map((o) => o.top.score).sort((a, b) => a - b);
  const stat = (a) => `最低 ${a[0].toFixed(3)}｜中位 ${a[Math.floor(a.length / 2)].toFixed(3)}｜最高 ${a[a.length - 1].toFixed(3)}`;
  console.log(`  範圍內（34 句）：${stat(inScores)}`);
  console.log(`  範圍外（10 句）：${stat(oosScores)}`);
  // 找最佳門檻：低於門檻視為「找不到服務 → 1999 人工」
  let best = null;
  const cands = [...new Set([...inScores, ...oosScores])].sort((a, b) => a - b);
  for (const th of cands) {
    const keptIn = inScores.filter((s) => s >= th).length;
    const rejOos = oosScores.filter((s) => s < th).length;
    const score = keptIn / inScores.length + rejOos / oosScores.length;
    if (!best || score > best.score) best = { th, keptIn, rejOos, score };
  }
  console.log(`  最佳門檻 ${best.th.toFixed(3)}：範圍內保留 ${pct(best.keptIn, inScores.length)}，範圍外擋下 ${pct(best.rejOos, oosScores.length)}`);
  for (const o of oos.sort((a, b) => b.top.score - a.top.score)) {
    const name = catalog.find((c) => c.id === o.top.id).name;
    console.log(`    ${o.top.score.toFixed(3)} ${o.top.score >= best.th ? '✗ 誤收' : '✓ 擋下'}「${o.text}」→ ${name}（最像「${o.top.nearest}」）`);
  }

  // ---------- D. 輸入穩健度 ----------
  console.log('\n[D] 輸入穩健度（12 類）');
  const rob = await evalSet(limits.robustness, idx);
  const byKind = {};
  for (const r of rob.rows) (byKind[r.kind] ??= []).push(r);
  for (const [kind, rows] of Object.entries(byKind)) {
    const s = rows.map((r) => {
      const name = catalog.find((c) => c.id === r.r[0].id).name;
      return `${r.hit1 ? '✓' : r.hit3 ? '△' : '✗'}「${r.text.length > 18 ? r.text.slice(0, 18) + '…' : r.text}」→${name} ${r.r[0].score.toFixed(2)}`;
    });
    console.log(`  ${kind.padEnd(6)} ${s.join('   ')}`);
  }
  console.log(`  合計：Top-1 ${pct(rob.t1, rob.n)}   Top-3 ${pct(rob.t3, rob.n)}   （✓ 第1名對、△ 前3名內、✗ 錯）`);
}
