// 拿得到：畫面與流程（hash 路由）
import { factsFrom, evaluateAll, evaluateBenefit, evaluateCondition, nextQuestion, ageFrom, daysSince } from './engine.js';
import { inApp, getSelfProfile, notify, phoneCall, openMap } from './bridge.js';
import { load, save, logAction } from './store.js';

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

const state = { benefits: [], questions: {}, offices: {}, self: null, family: [] };

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
    logAction({ actor: state.self.name, target: p.name, action: `代為回答「${state.questions[key]?.text ?? key}」` });
  }
}
/** 文件可以是字串，或 { text, when }：when 條件符合才需要（例如原住民才要戶口名簿） */
function docsFor(items, p) {
  const facts = factsFor(p);
  return (items ?? [])
    .filter((d) => typeof d === 'string' || !d.when || evaluateCondition(d.when, facts).result === 'pass')
    .map((d) => (typeof d === 'string' ? d : d.text));
}
function officeFor(where, p) {
  const table = where === 'householdOffice' ? state.offices.householdOffices : state.offices.districtOffices;
  return table?.[p.town] ?? null;
}

// ---------- 共用元件 ----------
function whoBar(active) {
  return `<div class="who-bar" role="group" aria-label="查看誰的補助">
    ${profiles().map((p) => `
      <button type="button" class="who-chip" data-who="${esc(p.id)}" aria-pressed="${p.id === active.id}">
        <strong>${esc(isSelf(p) ? '我' : p.relation)}</strong>
        <span class="${p.consent === 'pending' ? 'pending' : ''}">${esc(p.name)}${p.consent === 'pending' ? '・等待同意' : ''}</span>
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
  if (p.consent === 'pending') {
    return `<div class="banner warn"><strong>等待${esc(p.relation)}同意代理</strong>
      <p>${esc(p.name)}要在自己的城市通按「同意」，或到區公所臨櫃辦理，你才能查詢與代辦。</p>
      <button type="button" class="btn secondary" data-simulate-consent="${esc(p.id)}">示範：${esc(p.name)}已同意</button></div>`;
  }
  return `<div class="banner warn"><strong>${esc(p.relation)}沒有開放「查詢資格」權限</strong>
    <p>可以請${esc(p.name)}到「家人與代理」調整授權。</p></div>`;
}

// ---------- 畫面：補助清單 ----------
function renderHome() {
  const p = current();
  let html = `<div class="page">
    <header class="stack">
      <h1>${isSelf(p) ? '你可能可以領的補助' : `${esc(p.relation)}可能可以領的補助`}</h1>
      <p class="small muted">${isSelf(p)
        ? `依城市通實名資料比對（${state.self.source === 'app' ? `驗證等級 ${esc(state.self.verifyLevel ?? '')}` : '瀏覽器測試帳號'}）`
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
    <div class="stack">
      ${results.map((r) => `
        <a class="card" href="#/b/${esc(r.benefit.id)}">
          <div class="benefit-head">
            <h3>${esc(r.benefit.name)}</h3>
            <span class="status ${r.status}">${STATUS[r.status].icon} ${STATUS[r.status].label}</span>
          </div>
          <p class="reason">${esc(reasonOf(r))}</p>
        </a>`).join('')}
    </div>
    <p class="footnote">比對在這支手機上完成，個資不會上傳。結果僅供參考，以區公所、戶政事務所審核為準。</p>
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
    const office = officeFor(ch.where, p);
    return `<div class="card">
      <h3>臨櫃：${esc(ch.label)}</h3>
      ${office ? `<dl class="kv"><dt>地點</dt><dd>${esc(office.name)}</dd><dt>地址</dt><dd>${esc(office.address)}</dd><dt>電話</dt><dd>${esc(office.phone)}</dd></dl>
      <div class="row"><button type="button" class="btn secondary" data-call="${esc(office.phone)}">撥電話</button>
      <button type="button" class="btn secondary" data-map="${esc(office.address)}">開地圖</button></div>`
        : `<p class="muted">${esc(whoName(p))}的行政區資料不完整，請到「家人與代理」補上行政區。</p>`}
    </div>`;
  }).join('');

  const canCard = r.status !== 'ineligible' && can(p, 'apply');
  // 申請人不是對象本人（例如生育補助由寶寶的媽媽申請）
  const forOther = !!b.applicantRole;
  // 孩子自己不會收通知；只有可以自己看通知的家人才會「一起收到」
  const bothNotified = proxy && !forOther && (ageFrom(p.birthday, today()) ?? 99) >= 12;
  $view.innerHTML = `<div class="page">
    <a class="back" href="#/">← 回到補助清單</a>
    <header class="stack">
      <p class="small muted">${proxy ? `幫${esc(p.relation)} ${esc(p.name)} 查詢` : '你的補助'}・${esc(b.agency)}</p>
      <h1>${esc(b.name)}</h1>
      <p>${esc(b.summary)}</p>
    </header>
    <div class="banner ${bannerCls}"><strong>${STATUS[r.status].icon} ${esc(bannerText)}</strong><p>${esc(b.amount)}</p></div>

    <section class="card"><h2>條件</h2><ul class="checks">${r.checks.map((c) => checkItem(c, p)).join('')}</ul></section>

    ${b.notes?.length ? `<section class="card"><h2>要知道的事</h2><ul class="stack" style="margin:0;padding-left:1.2em">${b.notes.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></section>` : ''}

    <section class="stack"><h2>去哪裡申請</h2>${channels}<p class="small muted">受理期間：${esc(b.period)}${b.prepay ? '・需要先自行墊付' : ''}</p></section>

    <section class="card"><h2>${forOther ? `${esc(b.applicantRole)}要帶的文件` : proxy ? `${esc(p.relation)}的文件` : '要帶的文件'}</h2>${forOther && b.applicantNote ? `<p class="small muted">申請人是${esc(b.applicantRole)}；${esc(b.applicantNote)}。</p>` : ''}${docList(p, b, 'main', docsFor(b.documents, p))}</section>
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
  const docs = [...docsFor(b.documents, p), ...(proxy ? docsFor(b.proxyDocuments, p) : [])];
  // 有些補助的申請人不是對象本人（例如生育補助由寶寶的媽媽申請）
  const applicant = b.applicantRole ? `${b.applicantRole}${b.applicantNote ? `（${b.applicantNote}）` : ''}` : p.name;
  const payload = {
    app: 'nadedao', v: 1, benefit: b.name, for: p.name, applicant,
    proxy: proxy && !b.applicantRole ? state.self.name : undefined, office: office?.name, docs, issuedAt: new Date().toISOString().slice(0, 10),
  };
  if (proxy) logAction({ actor: state.self.name, target: p.name, action: `產生「${b.name}」辦事小卡` });
  const text = `【辦事小卡】${b.name}\n${b.applicantRole ? `對象：${p.name}\n` : ''}申請人：${applicant}${payload.proxy ? `\n代辦人：${state.self.name}` : ''}\n地點：${office ? `${office.name}（${office.address}，${office.phone}）` : ch?.label ?? ''}\n要帶：${docs.join('、')}\n受理期間：${b.period}`;

  $view.innerHTML = `<div class="page">
    <a class="back" href="#/b/${esc(b.id)}">← 回到${esc(b.name)}</a>
    <article class="ticket" aria-label="辦事小卡">
      <p class="small muted">辦事小卡・可以直接拿給臨櫃人員看</p>
      <p class="t-title">${esc(b.name)}</p>
      <dl class="kv">
        ${b.applicantRole ? `<dt>對象</dt><dd class="t-big">${esc(p.name)}</dd>` : ''}
        <dt>申請人</dt><dd class="t-big">${esc(applicant)}</dd>
        ${payload.proxy ? `<dt>代辦人</dt><dd class="t-big">${esc(state.self.name)}</dd>` : ''}
        <dt>地點</dt><dd>${office ? `${esc(office.name)}<br>${esc(office.address)}<br>${esc(office.phone)}` : esc(ch?.label ?? '')}</dd>
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
function renderFamily() {
  const log = load('log', []);
  $view.innerHTML = `<div class="page">
    <header class="stack">
      <h1>家人與代理</h1>
      <p class="muted">幫長輩、孩子或需要協助的家人接收通知、查詢資格、代為申請與領取。代理要經過對方同意，對方可以隨時調整或撤銷。</p>
    </header>
    ${state.family.map((p) => `
      <section class="card" aria-labelledby="f-${esc(p.id)}">
        <div class="benefit-head">
          <h2 id="f-${esc(p.id)}">${esc(p.relation)}・${esc(p.name)}</h2>
          <span class="status ${p.consent === 'granted' ? 'granted' : 'pending'}">${p.consent === 'granted' ? '已同意' : '等待同意'}</span>
        </div>
        <p class="small muted">${ageFrom(p.birthday, today()) ?? '?'} 歲・${esc(p.town ?? '未填行政區')}${p.note ? `・${esc(p.note)}` : ''}</p>
        <p class="small">授權方式：${esc(p.consentChannel ?? '')}</p>
        <ul class="perm-list">${PERMS.map(([k, label]) => `
          <li><label>${esc(label)}<input type="checkbox" data-perm="${esc(k)}" data-pid="${esc(p.id)}" ${p.permissions?.[k] ? 'checked' : ''}></label></li>`).join('')}</ul>
        <p class="small muted">權限由${esc(p.name)}決定（示範中可以直接切換）。</p>
        <div class="row">
          <button type="button" class="btn" data-view-as="${esc(p.id)}">查看${esc(p.relation)}的補助</button>
          ${p.consent === 'pending' ? `<button type="button" class="btn secondary" data-simulate-consent="${esc(p.id)}">示範：${esc(p.name)}已同意</button>` : ''}
          <button type="button" class="btn danger" data-revoke="${esc(p.id)}">撤銷代理</button>
        </div>
      </section>`).join('') || '<p class="muted">還沒有家人。</p>'}

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
      ${log.length ? `<ul class="log">${log.slice(0, 10).map((l) => `<li>${esc(new Date(l.at).toLocaleString('zh-TW', { hour12: false }))}・${esc(l.actor)} 為 ${esc(l.target)} ${esc(l.action)}</li>`).join('')}</ul>` : '<p class="small muted">還沒有代理操作。每一次代辦都會記在這裡，被代理的家人也看得到。</p>'}
    </section>
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
    for (const r of results) {
      if (r.status === 'eligible') eligible.push({ p, title: `${who}可能可以申請「${r.benefit.name}」`, body: r.benefit.amount, href: `#/b/${r.benefit.id}` });
      if (r.status === 'ask') asks.push({ p, title: `「${r.benefit.name}」還要確認 ${unknownCount(r)} 個條件`, body: `回答後就知道${who}能不能申請`, href: `#/b/${r.benefit.id}` });
    }
    // 生命事件：即將滿 65 歲
    if (ageFrom(p.birthday, today()) === 64) {
      const [, m, d] = String(p.birthday).match(/^\d{4}[/-](\d{1,2})[/-](\d{1,2})$/) ?? [];
      events.push({ p, title: `${who}今年 ${Number(m)} 月 ${Number(d)} 日滿 65 歲`, body: '滿 65 歲當月就能申請敬老愛心卡，可以先準備 2 吋照片。', href: '#/b/senior-card' });
    }
    if (factsFor(p).hasNewborn === true) {
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

// ---------- 路由 ----------
function route() {
  const hash = location.hash || '#/';
  const [, page, id] = hash.split('/');
  const tab = page === 'family' ? 'family' : page === 'notices' ? 'notices' : 'home';
  document.querySelectorAll('.tabbar a').forEach((a) => {
    if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  if (page === 'b' && id) renderDetail(decodeURIComponent(id));
  else if (page === 'card' && id) renderCard(decodeURIComponent(id));
  else if (page === 'family') renderFamily();
  else if (page === 'notices') renderNotices();
  else renderHome();
  window.scrollTo(0, 0);
}

// ---------- 事件 ----------
$view.addEventListener('click', async (e) => {
  const t = e.target.closest('button, a');
  if (!t) return;
  const d = t.dataset;

  if (d.who) { save('current', d.who); renderHome(); return; }
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
  if (d.viewAs) { save('current', d.viewAs); location.hash = '#/'; return; }
  if (d.openAs) { save('current', d.openAs); return; }
  if (d.revoke) {
    if (t.dataset.confirm !== 'yes') {
      t.dataset.confirm = 'yes';
      t.textContent = '再按一次確認撤銷';
      return;
    }
    const p = profileById(d.revoke);
    state.family = state.family.filter((x) => x.id !== d.revoke);
    save('family', state.family);
    if (load('current', 'self') === d.revoke) save('current', 'self');
    logAction({ actor: state.self.name, target: p.name, action: '撤銷代理' });
    toast('已撤銷代理');
    renderFamily();
    return;
  }
  if (d.reset !== undefined) {
    state.family = await (await fetch('./data/family-demo.json')).json();
    save('family', state.family);
    save('answers.self', {});
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
  if (t.dataset.perm) {
    const p = profileById(t.dataset.pid);
    p.permissions = { ...p.permissions, [t.dataset.perm]: t.checked };
    save('family', state.family);
    logAction({ actor: p.name, target: state.self.name, action: `${t.checked ? '開放' : '關閉'}「${PERMS.find(([k]) => k === t.dataset.perm)[1]}」` });
  }
});

$view.addEventListener('submit', (e) => {
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
  try {
    const [benefits, questions, offices] = await Promise.all(
      ['benefits', 'questions', 'offices'].map((f) => fetch(`./data/${f}.json`).then((r) => r.json()))
    );
    Object.assign(state, { benefits, questions, offices });
    state.self = await getSelfProfile();
    // 示範資料改版時（例如新增女兒），自動換成新版
    const DEMO_VERSION = 2;
    state.family = load('demoVersion', 0) === DEMO_VERSION ? load('family', null) : null;
    if (!state.family) {
      state.family = await (await fetch('./data/family-demo.json')).json();
      save('demoVersion', DEMO_VERSION);
      save('current', 'self');
    }
    save('family', state.family);
  } catch (err) {
    $view.innerHTML = `<div class="page"><div class="banner danger"><strong>資料載入失敗</strong><p>請確認網路後重新開啟。（${esc(err.message)}）</p></div></div>`;
    return;
  }
  window.addEventListener('hashchange', route);
  window.__nadedaoStarted = true;
  route();
})();
