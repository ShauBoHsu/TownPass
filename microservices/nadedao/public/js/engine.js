// 補助比對引擎（純函式，在使用者手機上執行，個資不上傳）
//
// 規則格式（public/data/benefits.json）：
//   conditions: [
//     { key: 'age', op: '>=', value: 65, label: '年滿 65 歲' },
//     { anyOf: [ {...}, {...} ], label: '年滿 65 歲，或原住民年滿 55 歲' },
//   ]
// 條件結果：pass（符合）、fail（不符合）、unknown（還不知道，要問使用者）
// 補助結果：eligible（可能符合）、ask（再回答幾題就知道）、ineligible（不符合）

/** 依生日計算足歲；birthday 可為 1947/03/15 或 1947-03-15 */
export function ageFrom(birthday, today = new Date()) {
  if (!birthday) return undefined;
  const m = String(birthday).match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (!m) return undefined;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  let age = today.getFullYear() - y;
  const beforeBirthday = today.getMonth() + 1 < mo || (today.getMonth() + 1 === mo && today.getDate() < d);
  if (beforeBirthday) age -= 1;
  return age;
}

/** 出生到今天的天數 */
export function daysSince(birthday, today = new Date()) {
  const m = String(birthday ?? '').match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (!m) return undefined;
  const born = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((t - born) / 86400000);
}

/** 把城市通 userinfo（或代理的家人資料）加上使用者回答，整理成比對用的事實 */
export function factsFrom(profile, today = new Date()) {
  const answers = profile.answers ?? {};
  const facts = {
    age: ageFrom(profile.birthday, today),
    citizen: profile.citizen,
    nativePeople: profile.nativePeople,
    town: profile.town,
  };
  // 本人就是新生兒（代理的寶寶）：從生日直接判斷是否還在出生 60 日內，不必再問
  const days = daysSince(profile.birthday, today);
  if (facts.age === 0 && days !== undefined) facts.hasNewborn = days <= 60;
  return { ...facts, ...answers };
}

function compare(fact, op, value) {
  switch (op) {
    case '>=': return fact >= value;
    case '<=': return fact <= value;
    case '>': return fact > value;
    case '<': return fact < value;
    case '==': return fact === value;
    case '!=': return fact !== value;
    case 'in': return Array.isArray(value) && value.includes(fact);
    case 'notIn': return Array.isArray(value) && !value.includes(fact);
    default: throw new Error(`unknown op: ${op}`);
  }
}

/** 評估單一條件（可巢狀 anyOf / allOf） */
export function evaluateCondition(cond, facts) {
  if (cond.anyOf) {
    const results = cond.anyOf.map((c) => evaluateCondition(c, facts));
    if (results.some((r) => r.result === 'pass')) return { ...cond, result: 'pass', parts: results };
    if (results.every((r) => r.result === 'fail')) return { ...cond, result: 'fail', parts: results };
    return { ...cond, result: 'unknown', parts: results, missing: results.flatMap((r) => r.missing ?? []) };
  }
  if (cond.allOf) {
    const results = cond.allOf.map((c) => evaluateCondition(c, facts));
    if (results.some((r) => r.result === 'fail')) return { ...cond, result: 'fail', parts: results };
    if (results.every((r) => r.result === 'pass')) return { ...cond, result: 'pass', parts: results };
    return { ...cond, result: 'unknown', parts: results, missing: results.flatMap((r) => r.missing ?? []) };
  }
  const fact = facts[cond.key];
  if (fact === undefined || fact === null || fact === 'unknown') {
    return { ...cond, result: 'unknown', missing: [cond.key] };
  }
  return { ...cond, result: compare(fact, cond.op, cond.value) ? 'pass' : 'fail' };
}

/**
 * 評估一項補助。
 * relevantWhen（選填）：介面上的適用對象（例如生育補助只問 60 歲以下的家長），
 * 不是法定資格；不適用時直接列為不符合並說明原因，不會拿來問使用者。
 */
export function evaluateBenefit(benefit, facts) {
  if (benefit.relevantWhen) {
    const rel = evaluateCondition(benefit.relevantWhen, facts);
    if (rel.result === 'fail') {
      return { benefit, status: 'ineligible', checks: [{ ...rel, label: benefit.relevantWhen.label }], missing: [], notRelevant: true };
    }
  }
  const checks = benefit.conditions.map((c) => evaluateCondition(c, facts));
  let status = 'eligible';
  if (checks.some((c) => c.result === 'fail')) status = 'ineligible';
  else if (checks.some((c) => c.result === 'unknown')) status = 'ask';
  const missing = [...new Set(checks.flatMap((c) => (c.result === 'unknown' ? c.missing ?? [] : [])))];
  return { benefit, status, checks, missing };
}

const STATUS_ORDER = { eligible: 0, ask: 1, ineligible: 2 };

/** 評估全部補助，依「可能符合 → 要回答 → 不符合」排序 */
export function evaluateAll(benefits, facts) {
  return benefits
    .map((b) => evaluateBenefit(b, facts))
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
}

/**
 * 下一個最值得問的問題：
 * 1. 被最多項「要回答」的補助需要的事實優先（回答一題影響最多補助）
 * 2. 一樣多時，優先問「離結論最近」的補助（缺的條件最少），讓使用者最快看到結果
 * 3. 還是一樣時，優先問「已經符合最多條件」的補助（例如有身障證明的人，先問輔具，不先問新生兒）
 */
export function nextQuestion(results, questions) {
  const stat = {};
  for (const r of results) {
    if (r.status !== 'ask') continue;
    const passed = r.checks.filter((c) => c.result === 'pass').length;
    for (const key of r.missing) {
      if (!questions[key]) continue;
      const s = (stat[key] ??= { affects: 0, closest: Infinity, passed: 0 });
      s.affects += 1;
      s.closest = Math.min(s.closest, r.missing.length);
      s.passed = Math.max(s.passed, passed);
    }
  }
  const best = Object.entries(stat).sort((a, b) =>
    b[1].affects - a[1].affects || a[1].closest - b[1].closest || b[1].passed - a[1].passed)[0];
  return best ? { key: best[0], ...questions[best[0]], affects: best[1].affects } : null;
}
