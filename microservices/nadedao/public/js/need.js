// 「說說你的需要」：把使用者輸入的一句話，對應到各項補助的信心度（0～100）
// 純規則、在手機上執行、不上傳；不使用 AI 模型。
//
// 每項補助在 benefits.json 有 keywords：{ "輪椅": 3, "走路": 2, ... }
// 1. 正規化輸入（台→臺、去空白、英文小寫）
// 2. 由長到短比對關鍵字，已比對到的字不重複計分（「假牙」不會再算一次「牙」）
// 3. 分數換算成信心度：1 - e^(-分數/2.5)，一個強關鍵字約 70%，兩個約 90%
// 4. 「不需要輪椅」「沒有牙齒問題」這類否定說法不計分

const NEGATIONS = ['不需要', '不用', '沒有需要', '不要', '不想'];

export function normalize(text) {
  return String(text ?? '')
    .replace(/台/g, '臺')
    .replace(/\s+/g, '')
    .toLowerCase();
}

/** 一項補助對一句話的信心度與命中的關鍵字 */
export function scoreBenefit(benefit, text) {
  const t = normalize(text);
  if (!t) return { confidence: 0, matched: [] };
  const used = new Array(t.length).fill(false);
  const entries = Object.entries(benefit.keywords ?? {})
    .map(([k, w]) => [normalize(k), w])
    .sort((a, b) => b[0].length - a[0].length);
  let score = 0;
  const matched = [];
  for (const [kw, weight] of entries) {
    let from = 0;
    let hit = false;
    for (let i = t.indexOf(kw, from); i !== -1; i = t.indexOf(kw, from)) {
      from = i + 1;
      if (used.slice(i, i + kw.length).some(Boolean)) continue;
      const before = t.slice(Math.max(0, i - 4), i);
      for (let j = i; j < i + kw.length; j++) used[j] = true;
      if (NEGATIONS.some((n) => before.endsWith(n))) continue;
      hit = true;
    }
    if (hit) {
      score += weight;
      matched.push(kw);
    }
  }
  const confidence = Math.round(100 * (1 - Math.exp(-score / 2.5)));
  return { confidence, matched };
}

const STATUS_ORDER = { eligible: 0, ask: 1, ineligible: 2 };

/**
 * 依信心度排序比對結果（evaluateAll 的輸出）；信心度一樣時維持「可能符合 → 要回答 → 不符合」
 * 沒有輸入時原樣回傳
 */
export function rankByNeed(results, text) {
  if (!normalize(text)) return results.map((r) => ({ ...r, need: null }));
  return results
    .map((r) => ({ ...r, need: scoreBenefit(r.benefit, text) }))
    .sort((a, b) => b.need.confidence - a.need.confidence || STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
}
