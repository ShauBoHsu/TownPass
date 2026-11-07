// 本機儲存（只存在這支手機；不上傳）。所有讀寫都包 try/catch，私密瀏覽或被封鎖時照樣能用。
const ROOT = 'nadedao.';
let PREFIX = ROOT;
let memory = {};

/** 示範：同一個瀏覽器扮演不同人（例如弟弟）時，各自的資料分開存 */
export function setNamespace(ns) {
  PREFIX = ns ? `${ROOT}${ns}.` : ROOT;
  memory = {};
}

/** 不分身分的設定（例如：這支手機扮演誰） */
export function loadGlobal(key, fallback) {
  try {
    const raw = localStorage.getItem(ROOT + key);
    if (raw !== null) return JSON.parse(raw);
  } catch { /* ignore */ }
  return fallback;
}
export function saveGlobal(key, value) {
  try {
    if (value === null || value === undefined) localStorage.removeItem(ROOT + key);
    else localStorage.setItem(ROOT + key, JSON.stringify(value));
  } catch { /* ignore */ }
}

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw !== null) return JSON.parse(raw);
  } catch { /* 改用記憶體 */ }
  return key in memory ? memory[key] : fallback;
}

export function save(key, value) {
  memory[key] = value;
  try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch { /* 只存在記憶體 */ }
}

export function remove(key) {
  delete memory[key];
  try { localStorage.removeItem(PREFIX + key); } catch { /* ignore */ }
}

/** 代理操作紀錄：被代理人看得到誰在什麼時候做了什麼 */
export function logAction(entry) {
  const log = load('log', []);
  log.unshift({ at: new Date().toISOString(), ...entry });
  save('log', log.slice(0, 50));
}
