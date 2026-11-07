# 拿得到

城市通微服務：用城市通實名驗證的資料，找出你和家人**可能符合**的補助，指引怎麼申請；需要協助的長輩、孩子或身心障礙家人，可以由代理人接收通知、代為申請與領取。

- 題目：2026 臺北秋季程式設計節「拿不到」#資源限制
- 線上網址：https://townpass-nadedao.shawn-shaubo-hsu.workers.dev/
- 城市通入口：服務頁「我的服務」第一個，或「服務 › 更多 › 市政服務 › 拿得到」

## 功能

| 功能 | 說明 |
|---|---|
| 自動比對 | 用 `userinfo`（生日、設籍、原住民身分、行政區）加上自評問題，在手機上判斷：可能符合／再回答幾題／不符合（附原因） |
| 最少提問 | 只問「會影響最多補助」的那一題；已列冊低收、中低收入戶可省略收入與財產題 |
| 領取指引 | 依行政區帶出最近的區公所或戶政事務所（地址、電話、撥電話、開地圖）、文件清單可打勾 |
| 辦事小卡 | 大字卡片＋QR Code（不含身分證字號），可複製文字傳給家人 |
| 代理機制 | 家人同意後才能代辦；四種權限（接收通知、查詢資格、代為申請、代為領取）可分開設定、隨時撤銷；每次代辦都有紀錄 |
| 通知 | 可能符合、還差幾題、即將滿 65 歲、生育補助 60 日期限；用城市通 `notify` |

## 隱私

- 補助比對在使用者手機上完成，**生日、戶籍、收入自評、回答與資格結果都不會上傳**。
- 後端只做代理授權同步（`/api/links`，Cloudflare D1）：雙方姓名、開放的權限、代辦紀錄，讓家人在自己的手機同意、調整、撤銷；代辦紀錄只寫「代為回答了哪一題」，不含答案。
- 邀請碼 6 位數、24 小時內有效；同意後雙方各有自己的金鑰，只有被代理人能調整權限，雙方都能撤銷。
- 家人資料、回答、代理紀錄只存在這支手機的瀏覽器儲存空間。
- 結果標示「可能符合」，最後以受理單位審核為準。

## 執行

```bash
npm install
npm test         # 比對引擎、正式規則、信心度、代理授權 API 的測試（25 項）
npm run dev      # 本機（wrangler dev）
npx wrangler d1 migrations apply nadedao-proxy --remote   # 第一次部署前：建立代理授權資料表
npm run deploy   # 部署到 Cloudflare Workers
npm start        # 以 Node 執行（http://localhost:8080）
docker build -t nadedao . && docker run -p 8080:8080 nadedao
```

## 更新補助規則

規則在 `public/data/benefits.json`，問題在 `public/data/questions.json`，承辦單位改 JSON 就能更新，不必改程式。每一項補助都要附 `sourceUrls`（官方網址）與 `verifiedAt`（查證日期）；`npm test` 會檢查每個條件都有對應的問題。

## 資料來源

| 資料 | 提供單位 | 授權 | 用途 |
|---|---|---|---|
| [臺北市政府各機關學校聯絡資訊](https://data.taipei/dataset/detail?id=6b99dd93-9c63-43c9-96eb-0bfffce97217) | 臺北市政府人事處 | 政府資料開放授權條款第 1 版 | 12 區區公所、戶政事務所地址與電話（`public/data/offices.json`，2026-11-07 取得） |
| [臺北市生育補助發放辦法](https://laws.gov.taipei/Law/LawSearch/LawArticleContent/FL081869)、[戶政事務所說明](https://zzhr.gov.taipei/News_Content.aspx?n=1F8E58A3DFA80E14&sms=87415A8B9CE81B16&s=7CFAB551F7DA3852) | 民政局 | — | 生育補助規則 |
| [敬老愛心卡](https://dosw.gov.taipei/cp.aspx?n=4683CD9EE2EB68B1) | 社會局 | — | 敬老卡規則 |
| [身心障礙者生活補助](https://dosw.gov.taipei/cp.aspx?n=C764A5808F9A3B08)、[身心障礙者生活補助費發給辦法](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=D0050189) | 社會局、衛福部 | — | 身障生活補助規則（115 年度金額與門檻） |
| [低收入戶](https://dosw.gov.taipei/cp.aspx?n=E6D700BD37E78592) | 社會局 | — | 低收入戶生活扶助規則（115 年度最低生活費） |
| [中低收入老人補助裝置假牙實施計畫](https://laws.gov.taipei/law/LawSearch/LawPrint/FL079304?type=0)、[社會局說明](https://dosw.gov.taipei/cp.aspx?n=504CCD746B074DAE) | 社會局 | — | 假牙補助規則 |
| [身心障礙者輔具費用補助](https://dosw.gov.taipei/cp.aspx?n=49304F9B0793FFEF)、[補助辦法](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=D0050060) | 社會局、衛福部 | — | 輔具補助規則、三區輔具中心電話 |
| 城市通 `userinfo` | 城市通 App | — | 生日、設籍、原住民身分、行政區 |

規則於 2026-11-07 從上列官方頁面查證；各項尚未確認的地方列在 `benefits.json` 的 `uncertain`，畫面上也會顯示。

## 第三方套件

| 套件 | 授權 | 用途 |
|---|---|---|
| [Hono](https://github.com/honojs/hono) | MIT | 後端路由 |
| [@hono/node-server](https://github.com/honojs/node-server) | MIT | Node / Docker 執行 |
| [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) 1.4.4 | MIT | 辦事小卡 QR Code（`public/vendor/qrcode.js`，已內含授權聲明） |
| [Wrangler](https://github.com/cloudflare/workers-sdk)（開發用） | MIT / Apache-2.0 | 部署 |

## AI 使用聲明

- 執行時**沒有使用任何 AI 模型**，補助比對是確定性的規則判斷。
- 開發階段使用 Claude Code 協助撰寫程式與查證補助規則；規則皆回到官方頁面確認。

## 授權

AGPL-3.0-only
