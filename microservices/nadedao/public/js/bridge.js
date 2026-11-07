// 與城市通 App 的雙向溝通（flutterObject）；一般瀏覽器中改用模擬資料
const bridge = window.flutterObject;
export const inApp = !!bridge;

// 與城市通 assets/mock_data/account.json 相同的測試帳號（全為假資料）
export const MOCK_USER = {
  realName: '金大森',
  birthday: '1988/12/12',
  citizen: true,
  nativePeople: false,
  verifyLevel: '3',
  addresses: [{ city: '臺北市', town: '中山區', village: '正得里' }],
};

/** 送出 { name, data } 並等待同名回覆；用完移除 listener */
export function callApp(name, data = null, timeoutMs = 10000) {
  if (!inApp) return Promise.reject(new Error('not in app'));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      bridge.removeEventListener('message', onReply);
      reject(new Error(`${name} 逾時`));
    }, timeoutMs);
    function onReply(event) {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      if (msg.name !== name) return;
      clearTimeout(timer);
      bridge.removeEventListener('message', onReply);
      resolve(msg.data);
    }
    bridge.addEventListener('message', onReply);
    bridge.postMessage(JSON.stringify({ name, data }));
  });
}

function sendToApp(name, data) {
  if (!inApp) return false;
  bridge.postMessage(JSON.stringify({ name, data }));
  return true;
}

/** 取得本人資料：在 App 內用 userinfo，否則用測試帳號 */
export async function getSelfProfile() {
  let u = MOCK_USER;
  let source = 'mock';
  if (inApp) {
    try {
      const data = await callApp('userinfo');
      if (data && !Array.isArray(data)) { u = data; source = 'app'; }
    } catch { /* 逾時就用測試帳號 */ }
  }
  const addr = (u.addresses ?? []).find((a) => a.priority) ?? (u.addresses ?? [])[0] ?? {};
  return {
    id: 'self',
    name: u.realName || u.username || '我',
    relation: '本人',
    birthday: u.birthday,
    citizen: u.citizen === true,
    nativePeople: u.nativePeople === true,
    town: addr.town,
    village: addr.village,
    verifyLevel: u.verifyLevel,
    consent: 'self',
    permissions: { notify: true, query: true, apply: true, collect: true },
    source,
  };
}

/** 手機通知；不在 App 內時回傳 false，由畫面顯示提示 */
export function notify(title, content) {
  return sendToApp('notify', { title, content });
}

export function phoneCall(number) {
  const digits = String(number).replace(/[^\d#*+]/g, '');
  if (!sendToApp('phone_call', digits)) window.location.href = `tel:${digits}`;
}

const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
const isAndroid = /Android/.test(navigator.userAgent);

/**
 * 開地圖：用手機內建的地圖 App
 * - Android：geo: 連結，交給系統預設的地圖 App（例如 Google 地圖）
 * - iOS：maps: 連結，開 Apple 地圖
 * App 回覆無法開啟時，改用地圖網址（Android 會由地圖 App 接手）
 */
export async function openMap(address) {
  const q = encodeURIComponent(address);
  const native = isIOS ? `maps:?q=${q}` : `geo:0,0?q=${q}`;
  const web = isIOS ? `https://maps.apple.com/?q=${q}` : `https://www.google.com/maps/search/?api=1&query=${q}`;
  if (inApp) {
    try { if (await callApp('launch_map', native, 4000)) return true; } catch { /* 改用網址 */ }
    try { return (await callApp('launch_map', web, 4000)) === true; } catch { return false; }
  }
  if (isIOS || isAndroid) window.location.href = native;
  else window.open(web, '_blank', 'noopener');
  return true;
}
