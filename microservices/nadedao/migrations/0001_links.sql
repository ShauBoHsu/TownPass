-- 代理授權（只存授權狀態與代辦紀錄；補助資格、收入、回答都只在手機上）
CREATE TABLE IF NOT EXISTS links (
  code TEXT PRIMARY KEY,          -- 6 位數邀請碼
  proxy_token TEXT NOT NULL,      -- 代理人手機用的金鑰
  owner_token TEXT,               -- 被代理人同意後拿到的金鑰
  proxy_name TEXT NOT NULL,
  member_name TEXT NOT NULL,
  relation TEXT NOT NULL,         -- 代理人怎麼稱呼對方（例如：弟弟）
  status TEXT NOT NULL,           -- pending / granted / declined / revoked
  requested TEXT NOT NULL,        -- 代理人請求的權限 JSON
  permissions TEXT NOT NULL,      -- 被代理人實際開放的權限 JSON
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS link_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  at TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS link_logs_code ON link_logs (code, id);
