// 查詢單句的前 5 名與最接近的範例句：node bench/query.js "句子" ["句子2" ...]
import { readFileSync } from 'node:fs';
import { pipeline, env } from '@huggingface/transformers';

env.cacheDir = './.model-cache';
const catalog = JSON.parse(readFileSync(new URL('../data/catalog.json', import.meta.url)));
const names = Object.fromEntries(catalog.map((c) => [c.id, c.name]));
const extractor = await pipeline('feature-extraction', 'Xenova/paraphrase-multilingual-MiniLM-L12-v2', { dtype: 'q8' });
const embed = async (t) => (await extractor(t, { pooling: 'mean', normalize: true })).tolist();
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);

const index = [];
for (const c of catalog) (await embed(c.examples)).forEach((v, i) => index.push({ id: c.id, text: c.examples[i], v }));

for (const q of process.argv.slice(2)) {
  const [qv] = await embed([q]);
  const best = {};
  for (const e of index) {
    const s = dot(qv, e.v);
    if (!best[e.id] || s > best[e.id].s) best[e.id] = { s, near: e.text };
  }
  console.log(`\n「${q}」`);
  Object.entries(best).sort((a, b) => b[1].s - a[1].s).slice(0, 5)
    .forEach(([id, r], i) => console.log(`  ${i + 1}. ${names[id].padEnd(10)} ${r.s.toFixed(3)}  最像「${r.near}」`));
}
