// 拿得到：畫面與流程（hash 路由）
import { factsFrom, evaluateAll, evaluateBenefit, evaluateCondition, nextQuestion, ageFrom, daysSince } from './engine.js';
import { inApp, getSelfProfile, notify, phoneCall, openMap, callApp } from './bridge.js';
import { rankByNeed } from './need.js';
import { load, save, logAction, setNamespace, loadGlobal, saveGlobal } from './store.js';

const $view = document.getElementById('view');
const TOWNS = ['中正區', '大同區', '中山區', '松山區', '大安區', '萬華區', '信義區', '士林區', '北投區', '內湖區', '南港區', '文山區'];
const STATUS = {
  eligible: { label: '可能符合', icon: '✓' },
  ask: { label: '再回答幾題', icon: '?' },
  ineligible: { label: '不符合', icon: '✕' },
};
const PERMS = [
  ['notify', '接收補助通知'],
  ['query', '查詢資格'],
  ['apply', '代為申請'],
  ['collect', '代為領取'],
];

// need：「說說你的需要」輸入的文字，只放在記憶體，不存也不上傳
// demoAs：這支手機在示範中扮演誰（null＝本人；'brother'＝弟弟的手機）
// myLinks：別人代理我的授權（被代理人這一端），只存邀請碼與金鑰
const state = { benefits: [], questions: {}, offices: {}, self: null, family: [], need: '', demoAs: null, myLinks: [] };
const NEED_EXAMPLES = ['牙齒不好', '需要輪椅', '剛生寶寶', '想搭公車', '失業繳不起房租'];

// ---------- 小工具 ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let toastTimer;
function toast(text) {
  const el = document.getElementById('toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}
const today = () => new Date();
const isSelf = (p) => p.id === 'self';
const profiles = () => [state.self, ...state.family];
const profileById = (id) => profiles().find((p) => p.id === id) ?? state.self;
const current = () => profileById(load('current', 'self'));
const canQuery = (p) => isSelf(p) || (p.consent === 'granted' && p.permissions?.query);
const can = (p, perm) => isSelf(p) || (p.consent === 'granted' && p.permissions?.[perm]);
const whoName = (p) => (isSelf(p) ? '你' : p.relation);

function answersOf(p) {
  return isSelf(p) ? load('answers.self', {}) : (p.answers ?? {});
}
function factsFor(p) {
  return factsFrom({ ...p, answers: answersOf(p) }, today());
}
function setAnswer(p, key, value) {
  if (isSelf(p)) {
    save('answers.self', { ...answersOf(p), [key]: value });
  } else {
    p.answers = { ...p.answers, [key]: value };
    save('family', state.family);
    record(p, `代為回答「${state.questions[key]?.text ?? key}」`);
  }
}
/** 領取紀錄：{ 家人 id: { 補助 id: 'YYYY-MM-DD' } }，只存在這支手機 */
const claimedOf = (p) => load('claimed', {})[p.id] ?? {};
function setClaimed(p, benefitId, on) {
  const all = load('claimed', {});
  const mine = { ...(all[p.id] ?? {}) };
  if (on) mine[benefitId] = new Date().toISOString().slice(0, 10);
  else delete mine[benefitId];
  save('claimed', { ...all, [p.id]: mine });
}
const fmtDate = (iso) => { const [, m, d] = iso.split('-'); return `${Number(m)}/${Number(d)}`; };

/** 勾選「已領取」；代理家人要有「代為領取」權限 */
function claimToggle(p, b, compact = false) {
  const date = claimedOf(p)[b.id];
  const allowed = can(p, 'collect');
  return `<label class="claim-toggle${compact ? ' compact' : ''}${allowed ? '' : ' disabled'}">
    <input type="checkbox" data-claim="${esc(b.id)}" ${date ? 'checked' : ''} ${allowed ? '' : 'disabled'}>
    <span>${date ? `已領取（${fmtDate(date)}）` : '已經領到了'}</span>
  </label>${allowed ? '' : `<p class="small muted">${esc(p.relation)}沒有開放「代為領取」，由${esc(p.name)}自己勾選。</p>`}`;
}

/** 文件可以是字串，或 { text, when }：when 條件符合才需要（例如原住民才要戶口名簿） */
function docsFor(items, p) {
  const facts = factsFor(p);
  return (items ?? [])
    .filter((d) => typeof d === 'string' || !d.when || evaluateCondition(d.when, facts).result === 'pass')
    .map((d) => (typeof d === 'string' ? d : d.text));
}
const OFFICE_TABLES = { householdOffice: 'householdOffices', districtOffice: 'districtOffices', assistiveCenter: 'assistiveCenters' };
function officeFor(where, p) {
  const table = state.offices[OFFICE_TABLES[where]];
  return table?.[p.town] ?? null;
}

// ---------- 代理授權同步（兩支手機） ----------
async function api(method, path, body, token) {
  const res = await fetch(`./api${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { 'x-link-token': token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `連線失敗（${res.status}）`);
  return data;
}

/** 代理人做的事：記在本機，也送到被代理人的手機（有經過 App 同意的家人） */
function record(p, action) {
  logAction({ actor: state.self.name, target: p.name, action });
  if (p.link?.token && p.consent === 'granted') {
    api('POST', `/links/${p.link.code}/log`, { action }, p.link.token).catch(() => { /* 離線時只留本機紀錄 */ });
  }
}

const CONSENT_LABEL = { granted: '已同意', pending: '等待同意', revoked: '已撤銷', declined: '已拒絕' };
const permsText = (perms) => PERMS.filter(([k]) => perms?.[k]).map(([, l]) => l).join('、') || '沒有開放任何權限';

/** 每 3 秒同步一次：代理人看對方是否同意、權限變了沒；被代理人看新的代辦紀錄 */
async function syncLinks() {
  if (document.visibilityState === 'hidden') return;
  let changed = false;
  for (const p of state.family) {
    if (!p.link) continue;
    try {
      const { link, logs } = await api('GET', `/links/${p.link.code}`, null, p.link.token);
      const before = `${p.consent}|${JSON.stringify(p.permissions)}`;
      const wasGranted = p.consent === 'granted';
      p.consent = link.status;
      if (link.status === 'granted') p.permissions = link.permissions;
      p.link.logs = (logs ?? []).filter((l) => l.actor !== state.self.name);
      if (`${p.consent}|${JSON.stringify(p.permissions)}` !== before) {
        changed = true;
        const msg = link.status === 'granted'
          ? wasGranted ? `${p.name}調整了代理權限（開放：${permsText(link.permissions)}）` : `${p.name}已在自己的手機同意代理（${permsText(link.permissions)}）`
          : link.status === 'revoked' ? `${p.name}已撤銷代理` : link.status === 'declined' ? `${p.name}拒絕了代理邀請` : '';
        if (msg) { toast(msg); notify('拿得到・代理', msg); }
      }
    } catch { /* 網路不穩時下次再試 */ }
  }
  for (const m of state.myLinks) {
    try {
      const { link, logs } = await api('GET', `/links/${m.code}`, null, m.token);
      const fresh = (logs ?? []).filter((l) => l.actor === link.proxyName && l.at > (m.lastSeenAt ?? ''));
      if (JSON.stringify(m.view) !== JSON.stringify(link) || (logs?.length ?? 0) !== (m.logs?.length ?? 0)) changed = true;
      m.view = link;
      m.logs = logs ?? [];
      if (fresh.length) {
        m.lastSeenAt = fresh[0].at;
        const msg = `${fresh[0].actor}${fresh[0].action}`;
        toast(msg);
        notify('拿得到・代理人幫你做了一件事', msg);
      }
    } catch { /* 網路不穩時下次再試 */ }
  }
  if (changed) {
    save('family', state.family);
    save('myLinks', state.myLinks.map(({ code, token, proxyName, lastSeenAt }) => ({ code, token, proxyName, lastSeenAt })));
    rerender();
  }
}

/** 同步後重畫目前的畫面（不捲動、不打斷輸入；辦事小卡不重畫，避免重複記錄） */
function rerender() {
  const page = (location.hash || '#/').split('/')[1];
  if (page === 'card' || page === 'invite') return;
  if (document.activeElement?.matches?.('input[type="search"], input[type="text"], input[inputmode]')) return;
  const y = window.scrollY;
  route(false);
  window.scrollTo(0, y);
}

function demoBanner() {
  return state.demoAs
    ? `<div class="banner warn demo-as"><strong>示範：這支手機是${esc(state.self.name)}（弟弟）的城市通</strong></div>`
    : '';
}

// ---------- 共用元件 ----------
function whoBar(active) {
  return `<div class="who-bar" role="group" aria-label="查看誰的補助">
    ${profiles().map((p) => `
      <button type="button" class="who-chip" data-who="${esc(p.id)}" aria-pressed="${p.id === active.id}">
        <strong>${esc(isSelf(p) ? '我' : p.relation)}</strong>
        <span class="${!isSelf(p) && p.consent !== 'granted' ? 'pending' : ''}">${esc(p.name)}${!isSelf(p) && p.consent !== 'granted' ? `・${CONSENT_LABEL[p.consent] ?? '等待同意'}` : ''}</span>
      </button>`).join('')}
  </div>`;
}

function questionCard(p, q) {
  return `<section class="card question" aria-labelledby="q-title">
    <p class="small muted">${isSelf(p) ? '回答一題，就能知道更多結果' : `幫${esc(p.relation)}回答一題`}（影響 ${q.affects} 項補助）</p>
    <p class="q" id="q-title">${esc(q.text)}</p>
    ${q.hint ? `<p class="small muted">${esc(q.hint)}</p>` : ''}
    <div class="options">
      ${q.options.map((o) => `<button type="button" class="btn" data-answer="${esc(q.key)}" data-value='${esc(JSON.stringify(o.value))}'>${esc(o.label)}</button>`).join('')}
    </div>
  </section>`;
}

/** 還沒確認的條件數（「或」條件算一個，不把每個分支都算進去） */
const unknownCount = (r) => r.checks.filter((c) => c.result === 'unknown').length;

function reasonOf(r) {
  if (r.status === 'ineligible') {
    const fail = r.checks.find((c) => c.result === 'fail');
    return `原因：${fail?.label ?? '條件不符'}`;
  }
  if (r.status === 'ask') return `還要確認 ${unknownCount(r)} 個條件`;
  return r.benefit.amount;
}

function consentBanner(p) {
  if (p.consent === 'revoked' || p.consent === 'declined') {
    return `<div class="banner danger"><strong>${esc(p.name)}${p.consent === 'revoked' ? '已撤銷代理' : '拒絕了代理邀請'}</strong>
      <p>你看不到${esc(p.relation)}的資格結果。需要的話，可以到「家人與代理」重新邀請。</p></div>`;
  }
  if (p.consent === 'pending' && p.link) {
    return `<div class="banner warn"><strong>等待${esc(p.relation)}在自己的手機同意</strong>
      <p>邀請碼 <b class="code">${esc(p.link.code)}</b>，到「家人與代理」可以看 QR Code。</p></div>`;
  }
  if (p.consent === 'pending') {
    return `<div class="banner warn"><strong>等待${esc(p.relation)}同意代理</strong>
      <p>${esc(p.name)}要在自己的城市通按「同意」，或到區公所臨櫃辦理，你才能查詢與代辦。</p>
      <button type="button" class="btn secondary" data-simulate-consent="${esc(p.id)}">示範：${esc(p.name)}已同意</button></div>`;
  }
  return `<div class="banner warn"><strong>${esc(p.relation)}沒有開放「查詢資格」權限</strong>
    <p>可以請${esc(p.name)}到「家人與代理」調整授權。</p></div>`;
}

// ---------- 畫面：補助清單 ----------
function benefitListHtml(results, p) {
  const ranked = rankByNeed(results, state.need);
  const claimed = claimedOf(p);
  return ranked.map((r) => {
    const date = claimed[r.benefit.id];
    const n = r.need;
    const needLine = n
      ? `<div class="need-score${n.confidence ? '' : ' none'}">
          <span class="bar" aria-hidden="true"><span style="width:${n.confidence}%"></span></span>
          <span>信心度 ${n.confidence}%${n.matched.length ? `・因為提到「${n.matched.map(esc).join('、')}」` : '・跟你說的需要關係不大'}</span>
        </div>`
      : '';
    return `<div class="card benefit-card${date ? ' claimed' : ''}${n && !n.confidence && !date ? ' faded' : ''}">
      <a class="card-link" href="#/b/${esc(r.benefit.id)}">
        <div class="benefit-head">
          <h3>${esc(r.benefit.name)}</h3>
          ${date
            ? '<span class="status claimed">✓ 已領取</span>'
            : `<span class="status ${r.status}">${STATUS[r.status].icon} ${STATUS[r.status].label}</span>`}
        </div>
        <p class="reason">${date ? `${fmtDate(date)} 已領取・${esc(r.benefit.amount)}` : esc(reasonOf(r))}</p>
        ${needLine}
      </a>
      ${date || r.status === 'eligible' ? claimToggle(p, r.benefit, true) : ''}
    </div>`;
  }).join('');
}

function needBox(p) {
  return `<section class="card need-box" aria-labelledby="need-title">
    <label id="need-title" for="need-input"><strong>說說${isSelf(p) ? '你' : esc(p.relation)}的需要</strong></label>
    <div class="need-input-row">
      <input id="need-input" type="search" enterkeyhint="search" maxlength="60" autocomplete="off"
        placeholder="例如：牙齒不好、需要輪椅" value="${esc(state.need)}">
    </div>
    <div class="need-examples" role="group" aria-label="範例">
      ${NEED_EXAMPLES.map((x) => `<button type="button" class="chip-btn" data-need="${esc(x)}">${esc(x)}</button>`).join('')}
    </div>
    <p class="small muted">依你說的話計算每項補助的信心度並排序。在手機上比對，不會上傳。</p>
  </section>`;
}

function updateBenefitList() {
  const list = document.getElementById('benefit-list');
  if (!list) return;
  list.innerHTML = benefitListHtml(evaluateAll(state.benefits, factsFor(current())), current());
}

function renderHome() {
  const p = current();
  let html = `<div class="page">
    ${demoBanner()}
    <header class="stack">
      <h1>${isSelf(p) ? '你可能可以領的補助' : `${esc(p.relation)}可能可以領的補助`}</h1>
      <p class="small muted">${isSelf(p)
        ? `依城市通實名資料比對（${state.demoAs ? '示範身分' : state.self.source === 'app' ? `驗證等級 ${esc(state.self.verifyLevel ?? '')}` : '瀏覽器測試帳號'}）`
        : `你是${esc(p.name)}的代理人・${esc(p.consentChannel ?? '')}授權`}</p>
    </header>
    ${whoBar(p)}`;

  if (!canQuery(p)) {
    $view.innerHTML = `${html}${consentBanner(p)}</div>`;
    return;
  }

  const results = evaluateAll(state.benefits, factsFor(p));
  const n = (s) => results.filter((r) => r.status === s).length;
  const q = nextQuestion(results, state.questions);
  html += `
    <div class="summary" aria-label="比對結果摘要">
      <div class="ok"><strong>${n('eligible')}</strong>可能符合</div>
      <div class="ask"><strong>${n('ask')}</strong>再回答幾題</div>
      <div class="no"><strong>${n('ineligible')}</strong>不符合</div>
    </div>
    ${q ? questionCard(p, q) : ''}
    ${needBox(p)}
    <div class="stack" id="benefit-list" aria-live="polite">${benefitListHtml(results, p)}</div>
    <p class="footnote">比對在這支手機上完成，資格與回答不會上傳。結果僅供參考，以區公所、戶政事務所審核為準。</p>
  </div>`;
  $view.innerHTML = html;
}

// ---------- 畫面：補助詳情 ----------
function checkItem(c, p) {
  const icon = { pass: '✓', fail: '✕', unknown: '?' }[c.result];
  let ask = '';
  if (c.result === 'unknown') {
    const key = (c.missing ?? []).find((k) => state.questions[k]);
    const q = key && state.questions[key];
    if (q) {
      ask = `<div class="stack"><p class="small">${esc(q.text)}</p><div class="options">
        ${q.options.map((o) => `<button type="button" class="btn" data-answer="${esc(key)}" data-value='${esc(JSON.stringify(o.value))}'>${esc(o.label)}</button>`).join('')}
      </div></div>`;
    }
  }
  return `<li class="${c.result}"><span class="icon" aria-hidden="true">${icon}</span>
    <div class="stack"><span>${esc(c.label)}<span class="visually-hidden">：${{ pass: '符合', fail: '不符合', unknown: '待確認' }[c.result]}</span></span>${ask}</div></li>`;
}

function docList(p, b, listKey, items) {
  const key = `docs.${p.id}.${b.id}.${listKey}`;
  const done = new Set(load(key, []));
  return `<ul class="docs">${items.map((d, i) => `
    <li><label><input type="checkbox" data-doc="${esc(key)}" data-i="${i}" ${done.has(i) ? 'checked' : ''}>${esc(d)}</label></li>`).join('')}</ul>`;
}

function renderDetail(id) {
  const p = current();
  const b = state.benefits.find((x) => x.id === id);
  if (!b) { location.hash = '#/'; return; }
  if (!canQuery(p)) { location.hash = '#/'; return; }
  const r = evaluateBenefit(b, factsFor(p));
  const proxy = !isSelf(p);
  const bannerCls = { eligible: 'info', ask: 'warn', ineligible: 'danger' }[r.status];
  const bannerText = {
    eligible: `${whoName(p)}可能符合，可以準備申請`,
    ask: `還要確認 ${unknownCount(r)} 個條件`,
    ineligible: `${whoName(p)}目前不符合`,
  }[r.status];

  const channels = b.applyChannels.map((ch) => {
    if (ch.type === '線上') {
      return `<div class="card"><h3>線上：${esc(ch.label)}</h3>
        <a class="btn secondary" href="${esc(ch.url)}" target="_blank" rel="noopener">前往${esc(ch.label)}</a></div>`;
    }
    // 沒有固定窗口（例如牙醫診所）：用手機地圖搜尋附近的地點
    if (!OFFICE_TABLES[ch.where]) {
      return `<div class="card">
        <h3>臨櫃：${esc(ch.label)}</h3>
        ${ch.mapQuery ? `<div class="row"><button type="button" class="btn secondary" data-map="${esc(ch.mapQuery)}">在地圖找${esc(ch.mapQuery)}</button></div>` : ''}
      </div>`;
    }
    const office = officeFor(ch.where, p);
    return `<div class="card">
      <h3>臨櫃：${esc(ch.label)}</h3>
      ${office ? `<dl class="kv"><dt>地點</dt><dd>${esc(office.name)}</dd>${office.address ? `<dt>地址</dt><dd>${esc(office.address)}</dd>` : ''}<dt>電話</dt><dd>${esc(office.phone)}</dd></dl>
      <div class="row"><button type="button" class="btn secondary" data-call="${esc(office.phone)}">撥電話</button>
      <button type="button" class="btn secondary" data-map="${esc(office.address || office.name)}">開地圖</button></div>`
        : `<p class="muted">${esc(whoName(p))}的行政區資料不完整，請到「家人與代理」補上行政區。</p>`}
    </div>`;
  }).join('');

  const canCard = r.status !== 'ineligible' && can(p, 'apply');
  // 申請人不是對象本人（例如生育補助由寶寶的媽媽申請）
  const forOther = !!b.applicantRole;
  // 孩子自己不會收通知；只有可以自己看通知的家人才會「一起收到」
  const bothNotified = proxy && !forOther && (ageFrom(p.birthday, today()) ?? 99) >= 12;
  const claimedDate = claimedOf(p)[b.id];
  $view.innerHTML = `<div class="page">
    <a class="back" href="#/">← 回到補助清單</a>
    <header class="stack">
      <p class="small muted">${proxy ? `幫${esc(p.relation)} ${esc(p.name)} 查詢` : '你的補助'}・${esc(b.agency)}</p>
      <h1>${esc(b.name)}</h1>
      <p>${esc(b.summary)}</p>
    </header>
    ${claimedDate
      ? `<div class="banner claimed"><strong>✓ ${esc(whoName(p))}已在 ${fmtDate(claimedDate)} 領取</strong><p>${esc(b.amount)}</p></div>`
      : `<div class="banner ${bannerCls}"><strong>${STATUS[r.status].icon} ${esc(bannerText)}</strong><p>${esc(b.amount)}</p></div>`}
    ${claimedDate || r.status === 'eligible' ? `<section class="card">${claimToggle(p, b)}</section>` : ''}

    <section class="card"><h2>條件</h2><ul class="checks">${r.checks.map((c) => checkItem(c, p)).join('')}</ul></section>

    ${b.notes?.length ? `<section class="card"><h2>要知道的事</h2><ul class="stack" style="margin:0;padding-left:1.2em">${b.notes.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></section>` : ''}

    <section class="stack"><h2>去哪裡申請</h2>${channels}<p class="small muted">受理期間：${esc(b.period)}${b.prepay ? '・需要先自行墊付' : ''}</p></section>

    <section class="card"><h2>${forOther ? `${esc(b.applicantRole)}要帶的文件` : proxy ? `${esc(p.relation)}的文件` : '要帶的文件'}</h2>${forOther && b.applicantNote ? `<p class="small muted">申請人是${esc(b.applicantRole)}；${esc(b.applicantNote)}。</p>` : ''}${docList(p, b, 'main', docsFor(b.documents, p))}</section>
    ${proxy && !b.proxyAllowed ? `<div class="banner info"><strong>這項要${esc(p.relation)}本人去辦</strong><p>你可以陪同、幫忙預約和準備文件。</p></div>` : ''}
    ${(proxy || forOther) && b.proxyAllowed ? `<section class="card"><h2>${forOther ? '請別人代辦時，另外要帶' : '你（代理人）另外要帶'}</h2>${docList(p, b, 'proxy', docsFor(b.proxyDocuments, p))}</section>` : ''}

    <div class="stack">
      <a class="btn block${canCard ? '' : ' disabled'}" ${canCard ? `href="#/card/${esc(b.id)}"` : 'aria-disabled="true"'}>產生辦事小卡</a>
      ${!can(p, 'apply') ? `<p class="small muted">${esc(p.relation)}沒有開放「代為申請」權限。</p>` : ''}
      <button type="button" class="btn secondary block" data-remind="${esc(b.id)}">提醒我（${bothNotified ? '我和' + esc(p.relation) + '都會收到' : '傳到手機通知'}）</button>
    </div>

    <section class="stack small muted">
      <p>官方來源（${esc(b.verifiedAt)} 查證）：${b.sourceUrls.map((u, i) => `<a href="${esc(u)}" target="_blank" rel="noopener">來源 ${i + 1}</a>`).join('、')}</p>
      ${b.uncertain?.length ? `<p>尚未確認：${b.uncertain.map(esc).join('；')}</p>` : ''}
      <p>結果僅供參考，以受理單位審核為準。</p>
    </section>
  </div>`;
}

// ---------- 畫面：辦事小卡 ----------
function qrSvg(text) {
  if (!window.qrcode) return '';
  window.qrcode.stringToBytes = window.qrcode.stringToBytesFuncs['UTF-8'];
  const qr = window.qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}

function renderCard(id) {
  const p = current();
  const b = state.benefits.find((x) => x.id === id);
  if (!b || !can(p, 'apply')) { location.hash = '#/'; return; }
  const proxy = !isSelf(p);
  const ch = b.applyChannels.find((c) => c.type === '臨櫃');
  const office = ch ? officeFor(ch.where, p) : null;
  const docs = [...docsFor(b.documents, p), ...(proxy && b.proxyAllowed ? docsFor(b.proxyDocuments, p) : [])];
  // 不能代辦的補助（要本人去），代理人改稱「陪同家人」
  const helperRole = b.proxyAllowed ? '代辦人' : '陪同家人';
  // 有些補助的申請人不是對象本人（例如生育補助由寶寶的媽媽申請）
  const applicant = b.applicantRole ? `${b.applicantRole}${b.applicantNote ? `（${b.applicantNote}）` : ''}` : p.name;
  const payload = {
    app: 'nadedao', v: 1, benefit: b.name, for: p.name, applicant,
    proxy: proxy && !b.applicantRole ? state.self.name : undefined, office: office?.name, docs, issuedAt: new Date().toISOString().slice(0, 10),
  };
  if (proxy) record(p, `產生「${b.name}」辦事小卡`);
  const text = `【辦事小卡】${b.name}\n${b.applicantRole ? `對象：${p.name}\n` : ''}申請人：${applicant}${payload.proxy ? `\n${helperRole}：${state.self.name}` : ''}\n地點：${office ? `${office.name}（${[office.address, office.phone].filter(Boolean).join('，')}）` : ch?.label ?? ''}\n要帶：${docs.join('、')}\n受理期間：${b.period}`;

  $view.innerHTML = `<div class="page">
    <a class="back" href="#/b/${esc(b.id)}">← 回到${esc(b.name)}</a>
    <article class="ticket" aria-label="辦事小卡">
      <p class="small muted">辦事小卡・可以直接拿給臨櫃人員看</p>
      <p class="t-title">${esc(b.name)}</p>
      <dl class="kv">
        ${b.applicantRole ? `<dt>對象</dt><dd class="t-big">${esc(p.name)}</dd>` : ''}
        <dt>申請人</dt><dd class="t-big">${esc(applicant)}</dd>
        ${payload.proxy ? `<dt>${helperRole}</dt><dd class="t-big">${esc(state.self.name)}</dd>` : ''}
        <dt>地點</dt><dd>${office ? [office.name, office.address, office.phone].filter(Boolean).map(esc).join('<br>') : esc(ch?.label ?? '')}</dd>
      </dl>
      <div><p class="t-big">要帶這些</p><ol class="t-docs">${docs.map((d) => `<li>${esc(d)}</li>`).join('')}</ol></div>
      <div class="qr" aria-label="辦事小卡 QR Code，內含補助名稱、申請人、地點與文件清單">${qrSvg(JSON.stringify(payload))}</div>
      <p class="small muted">QR Code 不含身分證字號等個資。</p>
    </article>
    <button type="button" class="btn block" data-copy>複製文字，傳給家人</button>
    <textarea id="card-text" class="visually-hidden" aria-hidden="true" readonly>${esc(text)}</textarea>
  </div>`;
}

// ---------- 畫面：家人與代理 ----------
/** 代理人這一端：邀請碼、QR Code、同步狀態 */
function linkBlock(p) {
  if (p.consent === 'granted' && p.link) {
    return `<div class="banner claimed"><strong>✓ ${esc(p.name)}已在自己的手機同意</strong><p>開放：${esc(permsText(p.permissions))}</p></div>`;
  }
  if (p.consent === 'pending' && p.link) {
    const url = `${location.origin}${location.pathname}#/invite/${p.link.code}`;
    return `<div class="invite">
      <p class="small">請${esc(p.name)}打開自己的城市通 →「拿得到」→「家人與代理」→ 輸入邀請碼或掃描 QR Code</p>
      <p class="code big" aria-label="邀請碼">${esc(p.link.code.replace(/(\d{3})(\d{3})/, '$1 $2'))}</p>
      <div class="qr small-qr">${qrSvg(url)}</div>
      <p class="small muted waiting">等待${esc(p.name)}同意…（每 3 秒自動更新）</p>
    </div>`;
  }
  if ((p.consent === 'pending' || p.consent === 'revoked' || p.consent === 'declined') && /App/.test(p.consentChannel ?? '')) {
    return `<button type="button" class="btn block" data-invite="${esc(p.id)}">${p.link ? '重新邀請' : `邀請${esc(p.relation)}在自己的手機同意`}</button>`;
  }
  return '';
}

/** 被代理人這一端：誰在代理我、我開放了什麼、代理人做了什麼 */
function myProxiesSection() {
  const links = state.myLinks.filter((m) => m.view && m.view.status !== 'revoked');
  return `<section class="card" aria-labelledby="my-proxies">
    <h2 id="my-proxies">我的代理人</h2>
    ${links.map((m) => `
      <div class="my-proxy stack">
        <div class="benefit-head"><h3>${esc(m.view.proxyName)}</h3><span class="status granted">已同意</span></div>
        <p class="small muted">你可以隨時調整，${esc(m.view.proxyName)}的手機會馬上更新。</p>
        <ul class="perm-list">${PERMS.map(([k, label]) => `
          <li><label>${esc(label)}<input type="checkbox" data-link-perm="${esc(k)}" data-code="${esc(m.code)}" ${m.view.permissions?.[k] ? 'checked' : ''}></label></li>`).join('')}</ul>
        <h3 class="small-h">${esc(m.view.proxyName)}幫你做了什麼</h3>
        ${m.logs?.length ? `<ul class="log">${m.logs.slice(0, 8).map((l) => `<li>${esc(new Date(l.at).toLocaleString('zh-TW', { hour12: false }))}・${esc(l.actor)} ${esc(l.action)}</li>`).join('')}</ul>` : '<p class="small muted">還沒有紀錄。</p>'}
        <button type="button" class="btn danger" data-link-revoke="${esc(m.code)}">撤銷代理</button>
      </div>`).join('')}
    <form class="form invite-form" id="invite-form">
      <label>${links.length ? '有新的邀請？' : '家人邀請你？'}輸入 6 位數邀請碼
        <input type="text" id="invite-code" inputmode="numeric" pattern="[0-9 ]*" maxlength="7" autocomplete="off" placeholder="例如 123456"></label>
      <div class="row">
        <button type="submit" class="btn">查看邀請</button>
        ${inApp ? '<button type="button" class="btn secondary" data-scan>掃描 QR Code</button>' : ''}
      </div>
    </form>
  </section>`;
}

function renderFamily() {
  // 代理紀錄：本機的代辦，加上家人在自己手機上的同意、調整、撤銷
  const remote = state.family.flatMap((p) => (p.link?.logs ?? []).map((l) => ({ ...l, target: null })));
  const log = [...load('log', []), ...remote].sort((a, b) => (a.at < b.at ? 1 : -1));
  $view.innerHTML = `<div class="page">
    ${demoBanner()}
    <header class="stack">
      <h1>家人與代理</h1>
      <p class="muted">幫長輩、孩子或需要協助的家人接收通知、查詢資格、代為申請與領取。代理要經過對方同意，對方可以隨時調整或撤銷。</p>
    </header>
    ${state.family.map((p) => `
      <section class="card" aria-labelledby="f-${esc(p.id)}">
        <div class="benefit-head">
          <h2 id="f-${esc(p.id)}">${esc(p.relation)}・${esc(p.name)}</h2>
          <span class="status ${p.consent === 'granted' ? 'granted' : p.consent === 'pending' ? 'pending' : 'draft'}">${CONSENT_LABEL[p.consent] ?? '等待同意'}</span>
        </div>
        <p class="small muted">${ageFrom(p.birthday, today()) ?? '?'} 歲・${esc(p.town ?? '未填行政區')}${p.note ? `・${esc(p.note)}` : ''}</p>
        <p class="small">授權方式：${esc(p.link ? `${p.name}在自己的城市通同意` : p.consentChannel ?? '')}</p>
        ${linkBlock(p)}
        <ul class="perm-list">${PERMS.map(([k, label]) => `
          <li><label>${esc(label)}<input type="checkbox" data-perm="${esc(k)}" data-pid="${esc(p.id)}" ${p.permissions?.[k] && p.consent === 'granted' ? 'checked' : ''} ${p.link ? 'disabled' : ''}></label></li>`).join('')}</ul>
        <p class="small muted">${p.link ? `權限由${esc(p.name)}在自己的手機決定，這裡會自動更新。` : `權限由${esc(p.name)}決定（示範中可以直接切換）。`}</p>
        <div class="row">
          <button type="button" class="btn" data-view-as="${esc(p.id)}">查看${esc(p.relation)}的補助</button>
          ${p.consent === 'pending' && !p.link ? `<button type="button" class="btn secondary" data-simulate-consent="${esc(p.id)}">示範：${esc(p.name)}已同意</button>` : ''}
          <button type="button" class="btn danger" data-revoke="${esc(p.id)}">撤銷代理</button>
        </div>
      </section>`).join('') || `<p class="muted">${state.demoAs ? '你目前沒有代理其他家人。' : '還沒有家人。'}</p>`}

    ${myProxiesSection()}

    <details class="card">
      <summary><strong>新增家人</strong></summary>
      <form class="form" id="add-form">
        <label>姓名<input type="text" id="f-name" required maxlength="20"></label>
        <label>關係<select id="f-relation"><option>媽媽</option><option>爸爸</option><option>阿公</option><option>阿嬤</option><option>孩子</option><option>兄弟姊妹</option><option>其他</option></select></label>
        <label>生日<input type="date" id="f-birthday" required></label>
        <label>戶籍行政區<select id="f-town">${TOWNS.map((t) => `<option>${t}</option>`).join('')}</select></label>
        <label class="check"><input type="checkbox" id="f-citizen" checked>設籍臺北市</label>
        <label class="check"><input type="checkbox" id="f-native">原住民身分</label>
        <label>怎麼取得同意<select id="f-channel"><option value="城市通 App">對方在自己的城市通按同意</option><option value="臨櫃（區公所）">對方沒有手機：到區公所臨櫃辦理</option><option value="監護人">我是監護人（孩子）</option></select></label>
        <button type="submit" class="btn block">送出代理邀請</button>
      </form>
    </details>

    <section class="card"><h2>代理紀錄</h2>
      ${log.length ? `<ul class="log">${log.slice(0, 10).map((l) => `<li>${esc(new Date(l.at).toLocaleString('zh-TW', { hour12: false }))}・${esc(l.actor)} ${l.target ? `為 ${esc(l.target)} ` : ''}${esc(l.action)}</li>`).join('')}</ul>` : '<p class="small muted">還沒有代理操作。每一次代辦都會記在這裡，被代理的家人也看得到。</p>'}
    </section>

    <details class="card demo-switch">
      <summary><strong>示範：這支手機是誰的？</strong></summary>
      <p class="small muted">用兩支手機示範代理時，把第二支切成弟弟。只影響這支手機，資料分開存。</p>
      <div class="row">
        <button type="button" class="btn ${state.demoAs ? 'secondary' : ''}" data-demo-as="self">本人（金大森）</button>
        <button type="button" class="btn ${state.demoAs === 'brother' ? '' : 'secondary'}" data-demo-as="brother">弟弟（金小華）</button>
      </div>
    </details>
    <button type="button" class="btn ghost" data-reset>重設示範資料</button>
  </div>`;
}

// ---------- 畫面：通知 ----------
/** 通知排序：期限與生命事件 → 可能符合（可以行動）→ 還要回答 */
function buildNotices() {
  const events = [];
  const eligible = [];
  const asks = [];
  for (const p of profiles()) {
    if (!isSelf(p) && !(p.consent === 'granted' && p.permissions?.notify)) continue;
    const who = isSelf(p) ? '你' : `${p.relation}（${p.name}）`;
    const results = evaluateAll(state.benefits, factsFor(p));
    const claimed = claimedOf(p);
    for (const r of results) {
      if (claimed[r.benefit.id]) continue;
      if (r.status === 'eligible') eligible.push({ p, title: `${who}可能可以申請「${r.benefit.name}」`, body: r.benefit.amount, href: `#/b/${r.benefit.id}` });
      if (r.status === 'ask') asks.push({ p, title: `「${r.benefit.name}」還要確認 ${unknownCount(r)} 個條件`, body: `回答後就知道${who}能不能申請`, href: `#/b/${r.benefit.id}` });
    }
    // 生命事件：即將滿 65 歲
    if (ageFrom(p.birthday, today()) === 64) {
      const [, m, d] = String(p.birthday).match(/^\d{4}[/-](\d{1,2})[/-](\d{1,2})$/) ?? [];
      events.push({ p, title: `${who}今年 ${Number(m)} 月 ${Number(d)} 日滿 65 歲`, body: '滿 65 歲當月就能申請敬老愛心卡，可以先準備 2 吋照片。', href: '#/b/senior-card' });
    }
    if (factsFor(p).hasNewborn === true && !claimed['birth-grant']) {
      const days = daysSince(p.birthday, today());
      const left = ageFrom(p.birthday, today()) === 0 && days !== undefined ? `，還剩 ${60 - days} 天` : '';
      events.push({ p, title: `生育補助要在寶寶出生後 60 日內申請${left}`, body: '到辦理出生登記的戶政事務所申請，申請人是寶寶的媽媽，爸爸可以拿委託書代辦。', href: '#/b/birth-grant' });
    }
  }
  return [...events, ...eligible, ...asks];
}

function renderNotices() {
  const list = buildNotices();
  $view.innerHTML = `<div class="page">
    <header class="stack">
      <h1>通知</h1>
      <p class="muted">開放「接收補助通知」的家人，他們的提醒你也會收到。</p>
    </header>
    ${list.map((n, i) => `
      <section class="card">
        <p class="small muted">${esc(isSelf(n.p) ? '你' : `${n.p.relation}・${n.p.name}`)}</p>
        <h3>${esc(n.title)}</h3>
        <p class="reason">${esc(n.body)}</p>
        <div class="row">
          <a class="btn secondary" href="${esc(n.href)}" data-open-as="${esc(n.p.id)}">查看</a>
          <button type="button" class="btn ghost" data-push="${i}">傳到手機通知</button>
        </div>
      </section>`).join('') || '<p class="muted">目前沒有新的提醒。</p>'}
  </div>`;
  $view._notices = list;
}

// ---------- 畫面：代理邀請（被代理人的手機） ----------
async function renderInvite(code) {
  $view.innerHTML = `<div class="page">${demoBanner()}<p class="muted">讀取邀請中…</p></div>`;
  let link;
  try {
    ({ link } = await api('GET', `/links/${encodeURIComponent(code)}`));
  } catch (err) {
    $view.innerHTML = `<div class="page">${demoBanner()}<a class="back" href="#/family">← 回到家人與代理</a>
      <div class="banner danger"><strong>沒辦法打開這個邀請</strong><p>${esc(err.message)}</p></div></div>`;
    return;
  }
  if (link.status !== 'pending') {
    $view.innerHTML = `<div class="page">${demoBanner()}<a class="back" href="#/family">← 回到家人與代理</a>
      <div class="banner info"><strong>這個邀請已經處理過了（${esc(CONSENT_LABEL[link.status] ?? link.status)}）</strong></div></div>`;
    return;
  }
  $view.innerHTML = `<div class="page">
    ${demoBanner()}
    <a class="back" href="#/family">← 回到家人與代理</a>
    <header class="stack">
      <p class="small muted">代理邀請・邀請碼 ${esc(link.code)}</p>
      <h1>${esc(link.proxyName)}想幫你處理補助</h1>
      <p>同意後，${esc(link.proxyName)}可以依你開放的權限，幫你接收通知、查詢資格、準備申請或代為領取。</p>
    </header>
    <section class="card">
      <h2>你要開放哪些？</h2>
      <p class="small muted">${esc(link.proxyName)}請求了：${esc(permsText(link.requested))}。你可以只開放一部分。</p>
      <ul class="perm-list">${PERMS.map(([k, label]) => `
        <li><label>${esc(label)}<input type="checkbox" name="perm" value="${esc(k)}" ${link.requested?.[k] ? 'checked' : ''}></label></li>`).join('')}</ul>
    </section>
    <div class="stack">
      <button type="button" class="btn block" data-consent="${esc(link.code)}">同意</button>
      <button type="button" class="btn ghost block" data-decline="${esc(link.code)}">不同意</button>
    </div>
    <p class="small muted">你可以隨時到「家人與代理」調整或撤銷。伺服器只存授權狀態與代辦紀錄，你的補助資格與回答不會上傳。</p>
  </div>`;
}

const codeFrom = (text) => String(text ?? '').match(/(\d{3})\s?(\d{3})/)?.slice(1).join('') ?? null;

// ---------- 路由 ----------
function route(scroll = true) {
  const hash = location.hash || '#/';
  const [, page, id] = hash.split('/');
  const tab = page === 'family' || page === 'invite' ? 'family' : page === 'notices' ? 'notices' : 'home';
  document.querySelectorAll('.tabbar a').forEach((a) => {
    if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  if (page === 'invite' && id) renderInvite(decodeURIComponent(id));
  else if (page === 'b' && id) renderDetail(decodeURIComponent(id));
  else if (page === 'card' && id) renderCard(decodeURIComponent(id));
  else if (page === 'family') renderFamily();
  else if (page === 'notices') renderNotices();
  else renderHome();
  if (scroll) window.scrollTo(0, 0);
}

// ---------- 事件 ----------
$view.addEventListener('click', async (e) => {
  const t = e.target.closest('button, a');
  if (!t) return;
  const d = t.dataset;

  if (d.who) { save('current', d.who); renderHome(); return; }
  if (d.need !== undefined) {
    state.need = d.need;
    const input = document.getElementById('need-input');
    if (input) input.value = d.need;
    updateBenefitList();
    return;
  }
  if (d.answer) {
    setAnswer(current(), d.answer, JSON.parse(d.value));
    toast('已記錄');
    route();
    return;
  }
  if (d.simulateConsent) {
    const p = profileById(d.simulateConsent);
    p.consent = 'granted';
    save('family', state.family);
    logAction({ actor: p.name, target: state.self.name, action: '同意代理' });
    toast(`${p.name}已同意代理`);
    route();
    return;
  }
  if (d.invite) {
    const p = profileById(d.invite);
    try {
      const res = await api('POST', '/links', {
        proxyName: state.self.name, memberName: p.name, relation: p.relation,
        permissions: { notify: true, query: true, apply: true, collect: true },
      });
      p.link = { code: res.code, token: res.proxyToken, logs: [] };
      p.consent = 'pending';
      save('family', state.family);
      logAction({ actor: state.self.name, target: p.name, action: '送出代理邀請（請對方在自己的手機同意）' });
      toast(`邀請碼 ${res.code}`);
      renderFamily();
    } catch (err) {
      toast(`邀請失敗：${err.message}`);
    }
    return;
  }
  if (d.consent || d.decline) {
    const code = d.consent || d.decline;
    const perms = Object.fromEntries([...document.querySelectorAll('input[name="perm"]')].map((i) => [i.value, i.checked]));
    try {
      const res = await api('POST', `/links/${code}/consent`, d.consent ? { permissions: perms } : { accept: false });
      if (d.consent) {
        state.myLinks = [...state.myLinks.filter((m) => m.code !== code),
          { code, token: res.ownerToken, proxyName: res.link.proxyName, view: res.link, logs: [], lastSeenAt: new Date().toISOString() }];
        save('myLinks', state.myLinks.map(({ code: c, token, proxyName, lastSeenAt }) => ({ code: c, token, proxyName, lastSeenAt })));
        toast(`已同意 ${res.link.proxyName} 代理`);
      } else {
        toast('已拒絕邀請');
      }
      location.hash = '#/family';
      syncLinks();
    } catch (err) {
      toast(err.message);
    }
    return;
  }
  if (d.linkRevoke) {
    if (t.dataset.confirm !== 'yes') {
      t.dataset.confirm = 'yes';
      t.textContent = '再按一次確認撤銷';
      return;
    }
    const m = state.myLinks.find((x) => x.code === d.linkRevoke);
    try {
      await api('PATCH', `/links/${m.code}`, { status: 'revoked' }, m.token);
      state.myLinks = state.myLinks.filter((x) => x.code !== m.code);
      save('myLinks', state.myLinks.map(({ code, token, proxyName, lastSeenAt }) => ({ code, token, proxyName, lastSeenAt })));
      toast(`已撤銷 ${m.proxyName} 的代理`);
      renderFamily();
    } catch (err) {
      toast(err.message);
    }
    return;
  }
  if (d.scan !== undefined) {
    try {
      const text = await callApp('qr_code_scan', null, 120000);
      const code = codeFrom(text);
      if (code) location.hash = `#/invite/${code}`;
      else toast('這不是拿得到的邀請 QR Code');
    } catch {
      toast('沒有掃到 QR Code');
    }
    return;
  }
  if (d.demoAs) {
    saveGlobal('demoAs', d.demoAs === 'self' ? null : d.demoAs);
    location.replace(`${location.pathname}#/family`);
    setTimeout(() => location.reload(), 50);
    return;
  }
  if (d.viewAs) { save('current', d.viewAs); location.hash = '#/'; return; }
  if (d.openAs) { save('current', d.openAs); return; }
  if (d.revoke) {
    if (t.dataset.confirm !== 'yes') {
      t.dataset.confirm = 'yes';
      t.textContent = '再按一次確認撤銷';
      return;
    }
    const p = profileById(d.revoke);
    if (p.link?.token) api('PATCH', `/links/${p.link.code}`, { status: 'revoked' }, p.link.token).catch(() => {});
    state.family = state.family.filter((x) => x.id !== d.revoke);
    save('family', state.family);
    if (load('current', 'self') === d.revoke) save('current', 'self');
    logAction({ actor: state.self.name, target: p.name, action: '撤銷代理' });
    toast('已撤銷代理');
    renderFamily();
    return;
  }
  if (d.reset !== undefined) {
    const demo = await (await fetch('./data/family-demo.json')).json();
    state.family = state.demoAs ? [] : demo;
    state.myLinks = [];
    save('myLinks', []);
    save('family', state.family);
    save('answers.self', state.demoAs ? demo.find((x) => x.id === state.demoAs)?.answers ?? {} : {});
    save('claimed', {});
    save('log', []);
    save('current', 'self');
    toast('已重設示範資料');
    renderFamily();
    return;
  }
  if (d.call) { phoneCall(d.call); return; }
  if (d.map) {
    if (!(await openMap(d.map))) toast('這支手機沒有可以開啟的地圖 App');
    return;
  }
  if (d.remind) {
    const p = current();
    const b = state.benefits.find((x) => x.id === d.remind);
    const who = isSelf(p) ? '' : `${p.relation}的`;
    const ok = notify('拿得到', `記得辦理${who}「${b.name}」：${b.period}`);
    toast(ok ? '已傳到手機通知' : '在城市通 App 內才能發送手機通知');
    return;
  }
  if (d.push) {
    const n = $view._notices?.[Number(d.push)];
    if (!n) return;
    const ok = notify(n.title, n.body);
    toast(ok ? '已傳到手機通知' : '在城市通 App 內才能發送手機通知');
    return;
  }
  if (d.copy !== undefined) {
    const text = document.getElementById('card-text').value;
    try {
      await navigator.clipboard.writeText(text);
      toast('已複製，可以貼到 LINE 傳給家人');
    } catch {
      toast('無法複製，請長按小卡截圖分享');
    }
  }
});

$view.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.doc) {
    const key = t.dataset.doc;
    const done = new Set(load(key, []));
    const i = Number(t.dataset.i);
    if (t.checked) done.add(i); else done.delete(i);
    save(key, [...done]);
  }
  if (t.dataset.claim) {
    const p = current();
    const b = state.benefits.find((x) => x.id === t.dataset.claim);
    setClaimed(p, b.id, t.checked);
    if (!isSelf(p)) record(p, `標記「${b.name}」${t.checked ? '已領取' : '尚未領取'}`);
    toast(t.checked ? `「${b.name}」已標記領取` : '已取消領取標記');
    route();
    return;
  }
  if (t.dataset.linkPerm) {
    const m = state.myLinks.find((x) => x.code === t.dataset.code);
    api('PATCH', `/links/${m.code}`, { permissions: { [t.dataset.linkPerm]: t.checked } }, m.token)
      .then((res) => { m.view = res.link; toast('已更新，對方的手機會馬上看到'); })
      .catch((err) => { t.checked = !t.checked; toast(err.message); });
    return;
  }
  if (t.dataset.perm) {
    const p = profileById(t.dataset.pid);
    p.permissions = { ...p.permissions, [t.dataset.perm]: t.checked };
    save('family', state.family);
    logAction({ actor: p.name, target: state.self.name, action: `${t.checked ? '開放' : '關閉'}「${PERMS.find(([k]) => k === t.dataset.perm)[1]}」` });
  }
});

$view.addEventListener('input', (e) => {
  if (e.target.id !== 'need-input') return;
  state.need = e.target.value;
  updateBenefitList();
});

$view.addEventListener('submit', (e) => {
  if (e.target.id === 'invite-form') {
    e.preventDefault();
    const code = codeFrom(document.getElementById('invite-code').value);
    if (!code) { toast('請輸入 6 位數邀請碼'); return; }
    location.hash = `#/invite/${code}`;
    return;
  }
  if (e.target.id !== 'add-form') return;
  e.preventDefault();
  const v = (id) => document.getElementById(id);
  const name = v('f-name').value.trim();
  if (!name || !v('f-birthday').value) { toast('請填姓名與生日'); return; }
  const channel = v('f-channel').value;
  const p = {
    id: `fam-${Date.now()}`,
    name,
    relation: v('f-relation').value,
    birthday: v('f-birthday').value.replaceAll('-', '/'),
    citizen: v('f-citizen').checked,
    nativePeople: v('f-native').checked,
    town: v('f-town').value,
    consent: channel === '監護人' ? 'granted' : 'pending',
    consentChannel: channel,
    permissions: { notify: true, query: true, apply: channel === '監護人', collect: channel === '監護人' },
    answers: {},
  };
  state.family.push(p);
  save('family', state.family);
  logAction({ actor: state.self.name, target: name, action: channel === '監護人' ? '以監護人身分加入' : '送出代理邀請' });
  toast(channel === '監護人' ? `已加入${name}` : `已送出邀請，等待${name}同意`);
  renderFamily();
});

// ---------- 啟動 ----------
(async function start() {
  $view.innerHTML = '<div class="page"><p class="muted">載入中…</p></div>';
  // 示範身分：網址 ?as=brother 或「家人與代理」最下面切換；各身分的資料分開存
  // （網址參數只影響這個分頁，方便同一台電腦開兩個分頁測試；切換按鈕才會記住）
  const asParam = new URLSearchParams(location.search).get('as');
  state.demoAs = asParam === 'brother' ? 'brother' : asParam === 'self' ? null : loadGlobal('demoAs', null);
  if (state.demoAs) setNamespace(state.demoAs);
  try {
    const [benefits, questions, offices] = await Promise.all(
      ['benefits', 'questions', 'offices'].map((f) => fetch(`./data/${f}.json`).then((r) => r.json()))
    );
    Object.assign(state, { benefits, questions, offices });
    state.self = await getSelfProfile();
    const demo = await (await fetch('./data/family-demo.json')).json();
    if (state.demoAs) {
      // 這支手機扮演家人（例如弟弟）：本人資料換成弟弟的，沒有代理別人
      const me = demo.find((x) => x.id === state.demoAs);
      state.self = { ...state.self, name: me.name, birthday: me.birthday, citizen: me.citizen, nativePeople: me.nativePeople, town: me.town, village: me.village, source: 'demo' };
      if (load('answers.self', null) === null) save('answers.self', me.answers ?? {});
      state.family = load('family', []);
    } else {
      // 示範資料改版時（例如新增女兒），自動換成新版
      const DEMO_VERSION = 2;
      state.family = load('demoVersion', 0) === DEMO_VERSION ? load('family', null) : null;
      if (!state.family) {
        state.family = demo;
        save('demoVersion', DEMO_VERSION);
        save('current', 'self');
      }
    }
    save('family', state.family);
    state.myLinks = load('myLinks', []).map((m) => ({ ...m, view: null, logs: [] }));
  } catch (err) {
    $view.innerHTML = `<div class="page"><div class="banner danger"><strong>資料載入失敗</strong><p>請確認網路後重新開啟。（${esc(err.message)}）</p></div></div>`;
    return;
  }
  window.addEventListener('hashchange', () => route());
  window.__nadedaoStarted = true;
  route();
  // 代理授權同步：有邀請或代理人時，每 3 秒更新一次
  syncLinks();
  setInterval(() => {
    if (state.family.some((p) => p.link) || state.myLinks.length) syncLinks();
  }, 3000);
})();
