# 開放資料與資源索引（數位平權 × 友善共融）

> 2026-11-07 賽前盤點。**每一筆都實際呼叫或開啟驗證過**；查不到的列在各節的「未驗證」。
> 使用前仍請再開一次連結確認，並在 README 的資料來源清單註明「資料集名稱＋提供單位＋連結」。

**目錄**：[0. 族群 × 情境速查](#0-族群--情境速查) ・ [1. 臺北市](#1-臺北市開放資料datataipei) ・ [2. 全國](#2-全國開放資料) ・ [3. 臺北城市儀表板](#3-臺北城市儀表板) ・ [4. 國際與開源資源](#4-國際與開源資源) ・ [5. 授權與合規](#5-授權與合規)

---

## 0. 族群 × 情境速查

抽到題目後先看這張：每格列出**最快能用的資料**（★＝有座標或即時、可直接上地圖），細節見後面章節。

| 族群 | 找地點／設施 | 即時資訊 | 服務與福利 | 理解門檻（語言、易讀） |
|---|---|---|---|---|
| **長者** | ★AED（含開放時段，全國 12063）、★涼適點（儀表板 WFS）、關懷據點 510 處、巷弄長照站 313 處（無座標） | ★公車到站＋★低地板車（`CarType`）、★捷運擁擠度、氣象特報、AQI、紫外線 | 敬老卡可搭路線、長照特約／喘息單位、樂齡學習、家庭照顧者中心 | 165 闢謠＋涉詐網站清單（防詐）、台語辭典（CC BY-ND）、易讀指南 |
| **行動不便** | ★捷運電梯／坡道出口座標、★無障礙斜坡道 GeoJSON（含坡度）、★輪行臺北 API（斜坡道 28,290）、★公廁（無障礙廁座）、★OSM `wheelchair`（8,452 筆）、無障礙藥局 | ★捷運電梯異常公告、電梯維修預排、★低地板公車、停車場身障優先車位 | 復康巴士、輔具中心、身障服務中心 | — |
| **視障／聽障** | OSM `tactile_paving`（170 筆）、無障礙廁所 | — | 身障服務中心 | 手語辭典**無開放資料**；語音需 App 端裝置端 STT／TTS（WebView 不支援） |
| **新住民／外籍** | ★移民署服務站（雙語＋座標）、新住民關懷據點、新住民學習中心、★友善店家（儀表板 WFS）、穆斯林友善餐廳 | ★即時交通訊息（中英） | **1990 外來人士諮詢熱線**、外國人健檢醫院、就業服務據點 | 臺北市雙語詞彙 8,387 筆、Wikidata 多語地名、多語 embedding（MiniLM 支援 vi/th/id）、Opus-MT 翻譯 |
| **兒童與家長** | ★哺集乳室（儀表板版**有座標**）、★親子友善廁所（尿布台）、捷運站設施（哺乳室）、親子館、公共托育家園 | — | 育兒支持資源（8 資料集彙整）、早療院所、新生兒聽篩院所 | — |
| **經濟弱勢** | ★愛心餐食補給站、實物銀行、街友盥洗據點 | — | 社福中心（臺北／全國）、急難求助窗口 | — |
| **全族群：防災** | ★避難收容處所（含**無障礙**、**弱者安置**欄）、★防空避難（含 `is_accessible`）、★AED | 氣象特報、地震報告 | — | — |
| **全族群：醫療** | ★藥局、★醫療院所、急救責任醫院、健保特約院所 | 健保院所**固定服務時段**（現在有開嗎） | 身障牙科門診 | — |
| **全族群：陳情／市民痛點** | — | — | **1999 派工資料**（每月，可當分類器真實語料、痛點分析） | — |

**底圖**：MapLibre＋OpenFreeMap（免金鑰）或 Leaflet＋國土測繪中心 WMTS `EMAP5_OPENDATA`。
**要先申請的金鑰**：TDX、中央氣象署、環境部（皆免費，請賽前或開賽第一小時完成）。

---

## 1. 臺北市開放資料（data.taipei）

### 怎麼取資料
data.taipei 網頁是 SPA，請直接用官方後端 API：
- 單一資料集中繼資料：`https://data.taipei/api/frontstage/tpeod/dataset.view?id={資料集id}`
- 取資料：`https://data.taipei/api/v1/dataset/{rid}?scope=resourceAquire&limit=1000&offset=0`（`rid` 是**資源 id**，要先從 dataset.view 取得，不是資料集 id）
- 全站目錄：`https://data.taipei/api/frontstage/tpeod/dataset.download?format=json`（2,816 筆資源）
- 資料集頁面：`https://data.taipei/dataset/detail?id={資料集id}`

授權：下列全部為 **政府資料開放授權條款第 1 版（OGDL v1）**，可商用、需標示出處。
驗證代號：A＝中繼資料＋v1 API 取回資料列；D＝實際下載檔案；E＝外部即時端點回 200。

### A. 行動不便／視障：無障礙交通與環境
| 名稱 | 單位 | 格式 | 最後更新 | 可用情境 | 驗證 |
|---|---|---|---|---|---|
| [臺北捷運車站無障礙設施資料](https://data.taipei/dataset/detail?id=3c799405-4e44-40dd-b747-daed09e88cdb) | 捷運公司 | CSV＋API | 2026-08-31 | 每站無障礙電梯出口、無障礙廁所、輪椅區車廂（119 列） | A |
| [捷運車站出入口無障礙電梯、坡道 GPS 座標](https://data.taipei/dataset/detail?id=0a3bb422-9eb5-459b-a9d4-138456516183) | 捷運公司 | CSV（**Big5**） | 2026-09-02 | 導航到有電梯／坡道的出口（WGS84） | D |
| [捷運車站無障礙設施異常公告](https://data.taipei/dataset/detail?id=d884a9c6-f86c-4854-8da7-e6516ddbe612) | 捷運公司 | CSV＋API | 2026-11-01 | 電梯故障推播 | A |
| [捷運車站電梯維修預排時程表](https://data.taipei/dataset/detail?id=4f8b6fcd-5508-48fd-9b2f-98308ad1b0c4) | 捷運公司 | CSV＋API | 每月 | 預告哪天哪部電梯停用 | A |
| [捷運車站設施資訊](https://data.taipei/dataset/detail?id=659b9f55-a687-4e55-a17b-ceca5743c514) | 捷運公司 | CSV（**Big5**） | 2026-09-02 | 各站哺集乳室、尿布台、飲水機、廁所位置 | D |
| [人行道固定設施物_無障礙斜坡道](https://data.taipei/dataset/detail?id=8ab0c662-b560-4310-a825-001ae7fdc524) | 工務局新工處 | GeoJSON（EPSG:3826） | 2026-01-14 | 含坡度、寬度，輪椅路線規劃 | D |
| [公園無障礙出入口點位](https://data.taipei/dataset/detail?id=5a7258c2-5ded-4149-8664-ae10903fe372) | 工務局公園處 | CSV＋API（TWD97） | 2026-03-16 | 745 個公園無障礙入口 | A |
| [輪行臺北設施資料（Open API）](https://data.taipei/dataset/detail?id=2b58f15a-dec6-4b9d-91be-4eaccfda5ae7) | 交通局 | REST：`wheelroute.gov.taipei/wheelrouteApi/api/facility/Get/{type}` | 2025-10-13 | type 1 斜坡道 28,290 筆、type 8 友善店家 253 筆、type 14 身障設施（type 9 無障礙廁所回 204 無資料） | E |
| [停車場資訊（含剩餘車位 V2）](https://data.taipei/dataset/detail?id=d5c0656b-5250-4179-a491-c94daa56ef2c) | 交通局停管處 | XML（`TCMSV_alldesc.xml`） | 剩餘車位即時 | `Handicap_First`、`Pregnancy_First`、`Accessibility_Elevator`、`AED_Equipment` 欄位 | E |
| [定時車機資訊](https://data.taipei/dataset/detail?id=c84f781f-02e7-45a4-84c2-0fc690749f66) | 交通局公運處 | JSON.gz（`GetBusData.gz`） | 即時 | `CarType` 1＝低底盤、2＝大復康巴士（查核時 1,210/1,384 輛為低底盤） | E |
| [預估到站時間（公車）](https://data.taipei/dataset/detail?id=f11a5af0-7b37-48ef-98cc-f6f102ed43c6) | 交通局公運處 | JSON.gz（`GetEstimateTime.gz`） | 即時 | 搭配車機資料做「下一班低地板車」 | E |
| [臺北市站牌](https://data.taipei/dataset/detail?id=62bc76da-6e6b-46ee-8976-c1945092d504) | 交通局公運處 | JSON（`GetStop.gz`） | 2026-09-29 | 站牌座標（WGS84），有英文站名 | E |
| [身心障礙者服務_臺北市復康巴士](https://data.taipei/dataset/detail?id=1bf7de4f-3a79-4f69-b47b-51b6011c8330) | 社會局 | CSV＋API | 2026-08-31 | 復康巴士業者聯絡方式 | A |
| [無障礙計程車營運數據](https://data.taipei/dataset/detail?id=66f1559e-d994-40e8-ac7f-96b108fff006) | 交通局公運處 | CSV＋API | 2024-12-25 | 供需背景資料（只有 3 列，偏舊） | A |

### B. 公共設施與日常便利
| 名稱 | 單位 | 格式 | 最後更新 | 可用情境 | 驗證 |
|---|---|---|---|---|---|
| [公廁點位資訊](https://data.taipei/dataset/detail?id=ca205b54-a06f-4d84-894c-d6ab5079ce79) | 環保局 | CSV＋API | 2026-11-05 | 無障礙廁座數、親子廁座數、照護床，含經緯度 | A |
| [親子友善廁所點位資訊](https://data.taipei/dataset/detail?id=9d7488f5-0f19-45c3-adf9-badf686dda18) | 環保局 | CSV＋API | 2026-03-09 | 尿布台、兒童座椅，含經緯度 | A |
| [臺北市哺集乳室](https://data.taipei/dataset/detail?id=5d1d34d8-1b81-4162-87b6-05e0896af958) | 衛生局 | CSV＋API | 2026-03-30 | 開放時間、位置指引、輪椅可用（**無座標**） | A |
| [AED 設置地點](https://data.taipei/dataset/detail?id=cd050577-115f-4299-b37a-012ff490a632) | 衛生局 | CSV＋API | 2026-09-04 | 最近的 AED，含經緯度 | A |
| [各機關學校聯絡資訊](https://data.taipei/dataset/detail?id=6b99dd93-9c63-43c9-96eb-0bfffce97217) | 人事處 | CSV＋API | 2026-10-06 | 12 區區公所等 398 個機關的電話、地址 | A |

### C. 長者
| 名稱 | 單位 | 格式 | 最後更新 | 可用情境 | 驗證 |
|---|---|---|---|---|---|
| [老人服務中心](https://data.taipei/dataset/detail?id=78dfc9a2-36e2-4ef5-beaa-a74633ba3d26) | 社會局 | CSV＋API | 2026-03-04 | 14 處長者服務據點 | A |
| [社區照顧關懷據點](https://data.taipei/dataset/detail?id=d082dc87-d3fd-479d-89c6-745ff1be955a) | 社會局 | CSV＋API | 2026-03-04 | 510 處，找離家近的據點 | A |
| [C 級單位（巷弄長照站）一覽表](https://data.taipei/dataset/detail?id=48a04f42-094e-46a0-a279-b4d8b703a7b3) | 社會局 | CSV＋API | 2026-09-18 | 313 處巷弄長照站 | A |
| [長照專業服務特約單位](https://data.taipei/dataset/detail?id=d3ba4f78-fb09-47ec-867c-53110570d12f) | 衛生局 | CSV＋API | 2026-09-18 | 依服務區域媒合長照 | A |
| [長照喘息服務特約單位](https://data.taipei/dataset/detail?id=959c34b2-9698-4d99-8987-d389efe18c04) | 衛生局 | CSV＋API | 2026-09-18 | 家庭照顧者找喘息服務 | A |
| [家庭照顧者服務中心](https://data.taipei/dataset/detail?id=e3cec007-4212-4944-989e-5078e4f5f3bb) | 社會局 | CSV＋API | 2026-03-03 | 照顧者支持 | A |
| [敬老愛心卡補助搭乘路線表](https://data.taipei/dataset/detail?id=074036e5-7098-4cb0-bdcf-820fbb5b4395) | 社會局 | CSV＋API | 2025-06-13 | 「這條路線能不能刷敬老卡」 | A |
| [樂齡學習據點](https://data.taipei/dataset/detail?id=ca59e66b-7200-4283-8c32-08bde2f5f142) | 教育局 | CSV＋API | 2026-10-05 | 長者數位學習、課程 | A |

### D. 身心障礙
| 名稱 | 單位 | 格式 | 最後更新 | 可用情境 | 驗證 |
|---|---|---|---|---|---|
| [身心障礙者服務中心](https://data.taipei/dataset/detail?id=ec51217d-c1d1-4804-a05e-f3abdd3a77e9) | 社會局 | CSV＋API | 2026-03-18 | 服務窗口 | A |
| [輔具服務中心](https://data.taipei/dataset/detail?id=34caee29-5566-4516-acb8-c39b93897fe8) | 社會局 | CSV＋API | 2026-03-04 | 輔具評估、租借 | A |
| [身障日間服務機構](https://data.taipei/dataset/detail?id=bb6adffe-2300-4ea7-8f25-1073340f922e) | 社會局 | CSV＋API | 2026-03-04 | 日間照顧資源 | A |
| [身心障礙牙科門診醫院一覽表](https://data.taipei/dataset/detail?id=cf4cc8cd-81b9-4440-8b9a-a0063f252b93) | 衛生局 | CSV＋API | 2025-06-16 | 門診時刻、網路掛號網址 | A |
| [社福設施主題地圖](https://data.taipei/dataset/detail?id=cabdf272-e0ec-4e4e-9136-f4b8596f35d9) | 社會局 | SHP（含 LON/LAT） | 2024-12-05 | 已帶座標的社福設施圖層 | D |

### E. 新住民／外籍人士
| 名稱 | 單位 | 格式 | 最後更新 | 可用情境 | 驗證 |
|---|---|---|---|---|---|
| [新住民社區關懷據點](https://data.taipei/dataset/detail?id=cba93d7e-0f77-4c94-88ab-c91cb1b8a3ae) | 社會局 | CSV＋API | 2026-09-10 | 7 處就近求助點 | A |
| [外國人健檢指定醫院名單](https://data.taipei/dataset/detail?id=9d885d53-8a7d-419c-b17e-600d691917cc) | 衛生局 | CSV＋API | 2026-01-07 | 居留、工作體檢 | A |
| [臺北市雙語詞彙](https://data.taipei/dataset/detail?id=c31fa872-d375-47a7-bb78-a61c41ae481b) | 秘書處 | CSV＋API | 2026-10-30 | 8,387 筆市府官方中英對照，介面翻譯用 | A |
| [即時交通訊息](https://data.taipei/dataset/detail?id=a6fae9f8-8d0f-4605-98ac-577388a7734f) | 交通局 | JSON | 內容當日更新 | `chtmessage`／`engmessage` 雙語交通公告 | D |

### F. 兒童與家長
| 名稱 | 單位 | 格式 | 最後更新 | 可用情境 | 驗證 |
|---|---|---|---|---|---|
| [親子館](https://data.taipei/dataset/detail?id=fd4779d0-827d-4ab3-8f65-2a356abad6d9) | 社會局 | CSV＋API | 2025-06-05 | 親子館地圖 | A |
| [社區公共托育家園](https://data.taipei/dataset/detail?id=7c66efcd-d073-401c-b18a-7a46728776c4) | 社會局 | CSV＋API | 2026-09-22 | 64 處公共托育 | A |
| [早期療育合約醫院及早療診所](https://data.taipei/dataset/detail?id=d12064cb-9fc5-493f-997e-6a30fcb7e65d) | 衛生局 | CSV＋API | 2025-05-21 | 發展遲緩兒童就醫 | A |

### G. 經濟弱勢
| 名稱 | 單位 | 格式 | 最後更新 | 可用情境 | 驗證 |
|---|---|---|---|---|---|
| [社會福利服務中心](https://data.taipei/dataset/detail?id=ece023db-a5f8-4399-97da-f04d7f4009e3) | 社會局 | CSV＋API | 2026-03-05 | 急難求助窗口 | A |
| [實物銀行聯絡資訊](https://data.taipei/dataset/detail?id=3fbc79e5-0138-4c89-8c47-39feddbd6d3f) | 社會局 | CSV＋API | 2026-09-10 | 物資領取點 | A |
| [愛心餐食補給站](https://data.taipei/dataset/detail?id=902ce3ff-75c6-4ad3-bcf4-562c23bc16a6) | 社會局 | CSV＋API | 2026-03-26 | 餐食補給，含經緯度 | A |
| [街友中途之家暨盥洗服務據點](https://data.taipei/dataset/detail?id=ae286d1f-5fe5-4aab-bf2a-d54e93bf6505) | 社會局 | CSV＋API | 2026-03-31 | 盥洗時間、地點 | A |

### H. 醫療
| 名稱 | 單位 | 格式 | 最後更新 | 可用情境 | 驗證 |
|---|---|---|---|---|---|
| [臺北市藥局](https://data.taipei/dataset/detail?id=6fa3ed67-e60e-44d9-a366-ce7008e322de) | 衛生局 | CSV＋API | 2026-09-18 | 最近藥局，含經緯度 | A |
| [公私立醫療院所](https://data.taipei/dataset/detail?id=ffdd5753-30db-4c38-b65f-b77892773d60) | 衛生局 | CSV＋API | 2025-06-27 | 醫療院所地圖，含經緯度 | A |
| [急救責任醫院名冊](https://data.taipei/dataset/detail?id=b747394c-9e67-4b1d-8d1e-bc64f143d06a) | 衛生局 | CSV＋API | 2026-02-11 | 緊急就醫 | A |

### I. 防災避難
| 名稱 | 單位 | 格式 | 最後更新 | 可用情境 | 驗證 |
|---|---|---|---|---|---|
| [114 年可供避難收容處所一覽表](https://data.taipei/dataset/detail?id=f327232d-9230-44d0-bf0c-df151802da32) | 社會局 | CSV＋API | 2025-06-16 | 有「無障礙設施」與服務里別欄位 | A |
| [防空疏散避難設施](https://data.taipei/dataset/detail?id=70a6216e-3730-4d1d-b334-62fca2dd71cd) | 警察局 | CSV＋API | 2026-10-06 | 22,443 處，含座標、容納人數 | A |

### J. 市民服務與陳情
| 名稱 | 單位 | 格式 | 最後更新 | 可用情境 | 驗證 |
|---|---|---|---|---|---|
| [1999 派工資料](https://data.taipei/dataset/detail?id=b796f87a-0ed8-4e57-89f6-225a4941b1ed) | 研考會 | CSV＋API | 2026-11-04 | 派工項目與案件地址：市民痛點分析、陳情分類器的真實語料 | A |
| [1999 每月電話處理總數](https://data.taipei/dataset/detail?id=5e32923b-1812-4e43-8233-e03512cc2dd8) | 研考會 | CSV＋API | 2026-11-04 | 進線量趨勢 | A |

### 未驗證／找不到
- 新住民服務中心、通譯人員名冊：臺北市沒有獨立資料集（全國移民署資源見第 2 節）
- 里辦公處聯絡清冊：找不到；只有「固定里民活動場所」（2024-05，TWD97）與「里界圖」（SHP）
- 無障礙停車位、低地板公車沒有獨立資料集，要從停車場 XML 的 `Handicap_First`、車機資料的 `CarType` 取
- 捷運列車即時到站 API：不在 data.taipei 的 13 支 Open API 中，未驗證
- 教育局版「可供避難收容處所」（aaf97773…）API 回傳壞掉的內容，請用上表社會局 114 年版

### 注意事項
1. **很多據點沒有座標**（老人服務中心、關懷據點、長照站、身障服務、親子館、哺集乳室）：要地圖就得自行地理編碼，或改用社會局 SHP 主題地圖（2024-12）。
2. **座標系統不一**：WGS84（AED、公廁、藥局）與 TWD97／EPSG:3826（斜坡道、公園入口）混用，需轉換；輪行臺北有少數座標為 0，要過濾。
3. **格式陷阱**：捷運兩份 CSV 是 Big5；停車是 XML；公車是 gzip JSON，真正資料在 `tcgbusfs.blob.core.windows.net`。
4. **新舊不一**：無障礙計程車、親子館、敬老卡路線表偏舊；中繼資料的筆數常和 API 實際筆數不同（AED 標 2,089、實際 2,729）。
5. **幾乎只有中文**：多語介面可用「臺北市雙語詞彙」對照，福利名稱與地址需自行翻譯。

---

## 2. 全國開放資料

資料集頁：`https://data.gov.tw/dataset/{ID}`；詮釋資料 API：`https://data.gov.tw/api/v2/rest/dataset/{ID}`。
授權除特別標示外皆為 **OGDL v1**。驗證代號：M＝詮釋資料＋實際下載讀過欄位；S＝讀 TDX 官方 OpenAPI 規格；P＝讀官方網頁原文。
「最後更新」是 data.gov.tw 詮釋資料的修改日，不一定等於資料內容日期。

### 長者／醫療照護
| 名稱 | 單位 | ID／端點 | 格式・取得 | 最後更新 | 可用情境 | 驗證 |
|---|---|---|---|---|---|---|
| 全國老人福利機構名冊 | 社家署 | [8572](https://data.gov.tw/dataset/8572) | CSV（Big5，各縣市一檔） | 2024-07 | 安養、長照機構 | M |
| 全國開業護理機構清冊 | 衛福部照護司 | [115950](https://data.gov.tw/dataset/115950) | CSV，含 WGS84 | 每年／2026-06 | 護理之家、居家護理所地圖 | M |
| 健保特約醫療院所名冊 | 健保署 | [168341](https://data.gov.tw/dataset/168341) | CSV | 每日 | 就近健保院所 | M |
| 健保特約醫事機構－藥局 | 健保署 | [39284](https://data.gov.tw/dataset/39284) | CSV | 每日 | 健保藥局（領慢箋） | M |
| 健保特約院所固定服務時段 | 健保署 | [39291](https://data.gov.tw/dataset/39291) | CSV（星期以 Y/N 字串） | 每日 | 「現在有開的診所」 | M |
| 藥局基本資料 | 食藥署 | [6134](https://data.gov.tw/dataset/6134) | CSV、JSON | 2026-06 | 藥局名稱、電話 | M |

### 身心障礙／無障礙
| 名稱 | 單位 | ID／端點 | 格式・取得 | 最後更新 | 可用情境 | 驗證 |
|---|---|---|---|---|---|---|
| 調查藥局無障礙設施清單 | 食藥署 | [138719](https://data.gov.tw/dataset/138719) | CSV、JSON | 2026-09 | 有無障礙出入口、廁所、送藥到宅的藥局 | M |
| 全國身心障礙福利機構一覽表 | 社家署 | [12061](https://data.gov.tw/dataset/12061) | CSV（Big5） | 2024-12 | 身障機構 | M |
| 復康巴士服務單位一覽表（112 年） | 社家署 | [161450](https://data.gov.tw/dataset/161450) | CSV（Big5） | 2023-04（偏舊） | 叫車電話 | M |
| 各縣市早期療育單位一覽表 | 社家署 | [130229](https://data.gov.tw/dataset/130229) | ODS | 2023-04 | 早療轉介 | M |
| 各縣市政府無障礙專屬信箱與專線 | 國土署 | [21372](https://data.gov.tw/dataset/21372) | CSV | 2025-12 | 無障礙設施通報 | M |
| TDX 市區公車車輛（`IsLowFloor`） | 交通部 TDX | `/v2/Bus/Vehicle/City/{City}` | REST・**需金鑰** | 動態 | 低地板公車 | S |
| TDX 捷運車站設施、出入口 | TDX | `/v2/Rail/Metro/StationFacility/{RailSystem}`、`/StationExit/{RailSystem}` | REST・需金鑰 | 靜態 | 電梯出口導引 | S |

### 交通即時（TDX，需免費註冊金鑰）
| 名稱 | ID／端點 | 更新 | 可用情境 | 驗證 |
|---|---|---|---|---|
| 市區公車預估到站 | [161159](https://data.gov.tw/dataset/161159)；`/v2/Bus/EstimatedTimeOfArrival/City/Taipei` | 每分 | 長者大字版到站提醒 | M＋實際取得 JSON |
| 台鐵、捷運即時看板；高鐵剩餘座位 | `/v2/Rail/TRA/LiveBoard`、`/v2/Rail/Metro/LiveBoard/{RailSystem}`、`/v2/Rail/THSR/AvailableSeatStatusList` | 即時 | 簡化版乘車資訊 | S |
| 公共自行車即時車位 | [177480](https://data.gov.tw/dataset/177480) | 每分 | YouBike 剩餘車位 | M |

### 新住民／外籍人士
| 名稱 | 單位 | ID | 格式 | 最後更新 | 可用情境 | 驗證 |
|---|---|---|---|---|---|---|
| 移民署服務站地點一覽表 | 移民署 | [73239](https://data.gov.tw/dataset/73239) | CSV，含英文名、WGS84＋TWD97 | 2025-12 | 雙語服務站地圖 | M |
| 移民署業務諮詢專線（含 **1990 外來人士諮詢熱線**） | 移民署 | [174237](https://data.gov.tw/dataset/174237) | CSV | 2026-09 | 多語求助專線 | M |
| 新住民學習中心據點 | 教育部終身司 | [162867](https://data.gov.tw/dataset/162867) | CSV | 2026-03 | 中文、識字課程 | M |
| 新住民家庭服務中心一覽表（112 年） | 社家署 | [160901](https://data.gov.tw/dataset/160901) | CSV（Big5） | 2023-04（偏舊） | 家庭服務中心 | M |
| 就業服務據點資訊 | 勞發署 | [24562](https://data.gov.tw/dataset/24562) | CSV、JSON | 2026-11 | 求職據點 | M |
| 穆斯林友善餐廳（中英） | 觀光署 | [41629](https://data.gov.tw/dataset/41629) | CSV | 2026-09 | 外籍穆斯林用餐 | M |

### 兒童與家長
| 名稱 | 單位 | ID | 格式 | 最後更新 | 可用情境 | 驗證 |
|---|---|---|---|---|---|---|
| 全國親子館（托育資源中心）名冊 | 社家署 | [160907](https://data.gov.tw/dataset/160907) | CSV | 2023-04 | 親子館地圖 | M |
| 依法應設置哺集乳室公共場所名單 | 國健署 | [23750](https://data.gov.tw/dataset/23750) | ODS | 每 6 月／2026-08 | 哺集乳室 | M |
| 新生兒聽力篩檢補助服務院所 | 國健署 | [56966](https://data.gov.tw/dataset/56966) | ODS | 2026-08 | 新手爸媽 | M |
| 全國社福中心通訊錄 | 社家署 | [160903](https://data.gov.tw/dataset/160903) | CSV（Big5） | 2023-04 | 弱勢家庭求助 | M |

### 安全、防災、環境
| 名稱 | 單位 | ID／端點 | 取得 | 更新 | 可用情境 | 驗證 |
|---|---|---|---|---|---|---|
| AED 位置資訊（全國 11,034、臺北 2,474 筆） | 衛福部醫事司 | [12063](https://data.gov.tw/dataset/12063) | 免，含經緯度與**開放時段** | 每日 | 最近且「現在可用」的 AED | M |
| 全國公廁建檔（含 `diaper`、等級） | 環境部 | [30794](https://data.gov.tw/dataset/30794)；`data.moenv.gov.tw/api/v2/fac_p_07` | 環境部金鑰（免費） | 每月 | 親子、無障礙廁所 | M |
| 避難收容處所點位（5,973 筆，含**適合避難弱者安置**欄） | 內政部消防署 | [73242](https://data.gov.tw/dataset/73242) | 免，含經緯度 | 2025-12 | 弱勢避難所地圖 | M |
| 鄉鎮天氣預報（臺北 F-D0047-061）、天氣特報（W-C0033-003/004） | 中央氣象署 | [9293](https://data.gov.tw/dataset/9293)、[138041](https://data.gov.tw/dataset/138041) | 氣象署授權碼 | 每 6 時 | 長者天氣、豪雨提醒 | M |
| 紫外線指數、顯著有感地震報告 | 中央氣象署 | [9039](https://data.gov.tw/dataset/9039)、[6068](https://data.gov.tw/dataset/6068) | 授權碼 | 每日／不定期 | 戶外活動提醒 | M |
| 空氣品質指標 AQI | 環境部 | [40448](https://data.gov.tw/dataset/40448)（`aqx_p_432`） | 環境部金鑰 | 每時 | 敏感族群空品警示 | M |

### 防詐、語言、圖資、其他
| 名稱 | 單位 | ID／端點 | 授權 | 可用情境 | 驗證 |
|---|---|---|---|---|---|
| 165 詐騙闢謠專區 | 警政署 | [38262](https://data.gov.tw/dataset/38262) | OGDL（最新一筆 2025-04） | 長者防詐小卡 | M |
| 165 遭停止解析涉詐網站（約 10.4 萬筆） | 警政署 | [176455](https://data.gov.tw/dataset/176455) | OGDL（到 115 年 10 月） | 「這網址安全嗎？」 | M |
| 165 假投資（博弈）網站 | 警政署 | [160055](https://data.gov.tw/dataset/160055) | OGDL | 同上 | M |
| [國語辭典公眾授權網](https://language.moe.gov.tw/001/Upload/Files/site_content/M0001/respub/index.html)（重編本、簡編本、小字典、成語典） | 教育部 | 下載檔（2026-09-29 版） | **CC BY-ND 3.0 TW（禁止改作）** | 簡易解釋、注音 | P |
| [臺灣台語常用詞辭典](https://sutian.moe.edu.tw/)（文字＋音檔） | 教育部 | 下載檔 | **CC BY-ND 3.0 TW** | 台語長者介面、語音 | P |
| 國土測繪中心 WMTS（`EMAP5_OPENDATA`；另有 `SHELTERS`、`AED` 圖層） | 國土測繪中心 | `wmts.nlsc.gov.tw/wmts`；[25108](https://data.gov.tw/dataset/25108) | OGDL | 在地化底圖，可直接接 Leaflet | P＋M |
| 村里界、鄉鎮市區界 | 國土測繪中心 | [7438](https://data.gov.tw/dataset/7438)、[7441](https://data.gov.tw/dataset/7441) | OGDL（SHP，選「TWD97 經緯度」版） | 依行政區彙整 | M |
| 中華郵政全國營業據點（含週六日服務） | 中華郵政 | [5950](https://data.gov.tw/dataset/5950) | OGDL | 假日可辦事的郵局 | M |

### 未驗證／找不到
- **長照 ABC 據點（88270）**、1966 長照特約單位：詮釋資料存在（每月、OGDL），但下載主機 ltcpap.mohw.gov.tw 連不上
- 國健署母嬰親善醫療院所（7182）：檔案已下架
- 教育部客語辭典、台灣手語線上辭典、常用手語辭典：找不到開放授權或開放資料版本
- TGOS 門牌定位／地址比對 API：需另外申請；data.gov.tw 查不到全國門牌點位開放資料

### 注意事項
1. **金鑰要賽前申請**：TDX 訪客每 IP 每日只有 20 次（測試時已收到 401），請註冊取得 Client ID/Secret、用 OAuth 換 token，並**放在後端代理**。氣象署、環境部也各需會員金鑰；data.gov.tw 連結內嵌的示範金鑰不能上線用。
2. **教育部辭典是 CC BY-ND**：可照原文使用、可商用，但**不能修改內容，也不能改授權成 AGPL**；執行時再抓或放獨立資料夾並標明原授權。
3. **座標**：多數為 WGS84；移民署檔案另有 `TgosTWD_X/Y`（EPSG:3826），別用錯欄位。
4. **舊資料與編碼**：社家署多個檔案停在 112 年版且為 Big5；部分是 ODS 要先轉檔；Demo 時請標出資料日期。

---

## 3. 臺北城市儀表板

網址：https://citydashboard.taipei/ ・ 原始碼：[taipei-doit/Taipei-City-Dashboard](https://github.com/taipei-doit/Taipei-City-Dashboard)（2026-11-07 實測 API，對照 repo commit 8523f3b）

### 概要
- 臺北大數據中心的 Vue＋Go 系統，資料由 Airflow 從 data.taipei 等來源抓進 PostgreSQL，地圖走 GeoServer。
- **授權**：程式碼 **AGPL-3.0**（與我們相同）；圖表元件 `dashboardComponent` 是 Apache-2.0（npm：`city-dashboard-component`）。資料本身請引用原始機關（多為 OGDL v1）。
- **REST API**（免 token 可 GET，但**沒有 CORS**，前端不能直呼，要經自己的後端代理）：
  - `/api/v1/dashboard/`、`/api/v1/dashboard/{index}?city=taipei`
  - `/api/v1/component/`（共 251 個元件）、`/api/v1/component/{id}`、`/api/v1/component/{id}/chart?city=taipei`
- **GeoServer WFS**（**有 CORS `*`，前端可以直接呼叫**）：`/geo_server/taipei_vioc/ows`，221 個圖層，回 GeoJSON。
- 臺北的儀表板：metro、traffic、youbike、planning、construction、**childcare 婦幼資源**、**services 為民服務**、map-layers、climate-change、**disaster-prevention 防災**、**ltc_care_tpe 健康守護**、**biz_revive_tpe 商圈活化**、food-safety、sustainable-environment。另有雙北版（metrotaipei）。

### 和主題相關的元件
| 元件（id） | 原始資料來源 | 怎麼取 | 更新 | 族群／情境 |
|---|---|---|---|---|
| 公廁分布（249） | 環境部 公廁 API（`data.moenv.gov.tw/api/v2/fac_p_28`） | WFS `moenv_public_toilet_tpe`（7,009 筆，含 type、grade、diaper），**bbox 查詢可用** | 每月 | 輪椅、親子、性別友善 |
| 友善店家（260） | 產業局商業處：友善店家清冊（中／英） | WFS `friendly_store_tpe` | 不定期 | 新住民、外籍、親子（Free WiFi、哺集乳、性別、月經友善） |
| AED 分布（261） | 衛生局：AED 設置地點 | WFS `aed_locations_taipei`（含設置位置描述） | 不定期 | 急救 |
| 育兒支持資源（150） | 社會局：親子館、定點臨托、托嬰中心等 8 個資料集 | WFS `childcare_resource_all` | 每月 | 兒童與家長 |
| 哺集乳室（155）、生育補助合約醫院（156） | 衛生局 | WFS `breastfeeding_room`（**有座標**，data.taipei 原始檔沒有）、`maternity_hospitals` | 半年 | 家長 |
| 防空避難（171） | 都發局建管處：防空避難處所清冊 | WFS `urbn_air_raid_shelter`（含 **is_accessible**、容留人數） | 不定期 | 避難、行動不便 |
| 涼適點（290） | 環保局：臺北市涼適點 | WFS `cooling_point_tpe` | 不定期 | 長者熱傷害 |
| 急診（311）、藥局（315）、醫療院所（106） | 衛生局 | WFS `emergency_medical_institutions`、`pharmacies`（chart 回 0，請用 WFS） | 每日 | 醫療 |
| 長照據點（258）、銀髮俱樂部（252） | 社會局：老人安養暨長照機構；C 級單位 | WFS `long_tern_tpe`（**不穩，≥10 筆回例外**）、`elderly_club_tpe` | 每月 | 長者 |
| 扶養比及老化指數（214）、長照指標（218）、年齡分區（216） | 主計處 | 只有 chart（時序） | 每年 | 人口結構背景 |
| 無障礙設施（251） | 停管處、市場處 | WFS 是**行政區面量**，不是點位 | 每年 | 行動不便 |
| 捷運各線擁擠程度（68／79／116／117／217） | 臺北捷運公司 | chart，**1 分鐘更新** | 即時 | 長者、行動不便避開擁擠 |

沒有新住民、視障、聽障專屬的元件。

### 微服務可以怎麼用
1. **附近友善設施**（前端直呼 WFS＋bbox，免後端）：
   `https://citydashboard.taipei/geo_server/taipei_vioc/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=taipei_vioc:moenv_public_toilet_tpe&bbox=121.51,25.04,121.52,25.05&outputFormat=application/json`
   （實測回 348 筆；`CQL_FILTER` 會被 WAF 擋，篩選要在前端做）
2. **行政區統計卡片**：後端代理 `GET /api/v1/component/{id}/chart?city=taipei`。
3. **顯示資料出處**：`GET /api/v1/component/{id}` 的 `source`、`links`、`update_freq` 可直接顯示。

### 注意事項
- **正式引用請以 data.taipei 原始資料集為準**：元件標示的機關有時和 DAG 設定不一致（如 251、260）。
- **WFS 圖層不穩**：`long_tern_tpe`、`patrol_designate_place`（避難）會回例外；上線建議抓原始檔，儀表板當備援。
- 沒有公開的使用條款或 SLA（原始碼內限流為每 60 秒 20,000 次）。
- 城市通內的「市政資訊儀表板」指向 `dashboard.gov.taipei`，**外網 DNS 查不到**，疑為內網舊入口；公開版是 citydashboard.taipei。

---

## 4. 國際與開源資源

驗證代號：F＝讀過頁面內容；API＝透過 HuggingFace／GitHub API 取得授權或檔案；C＝curl 實測回 200 或取到資料；S＝只有搜尋結果。

### 地圖與地理資料
| 名稱 | 授權 | 限制／注意 | 可用情境 | 驗證 |
|---|---|---|---|---|
| [OpenStreetMap](https://www.openstreetmap.org/copyright) | ODbL 1.0 | 必須標示「© OpenStreetMap contributors」；修改後的資料庫公開時要同樣授權 | 無障礙 POI 主要來源 | F |
| [Overpass API](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html) | 資料 ODbL | 每天約 1 萬次、1 GB；超限回 429/504 | 實測臺北：`wheelchair=*` **8,452 筆**、`toilets:wheelchair=yes` **446 筆**、`tactile_paving` **170 筆** | F＋C |
| OSM 標籤 [wheelchair](https://wiki.openstreetmap.org/wiki/Key:wheelchair)、[tactile_paving](https://wiki.openstreetmap.org/wiki/Key:tactile_paving) | — | wheelchair＝yes/limited/no/designated；另有 `toilets:wheelchair`、`ramp:wheelchair` | 篩選與圖例 | F |
| [OpenFreeMap](https://openfreemap.org/)（[條款](https://openfreemap.org/tos/)） | 程式 MIT；資料 ODbL；樣式 CC BY 4.0 | 免金鑰、無瀏覽量限制；離線下載每次 ≤3,000 圖磚／50 MB；需標示 OpenMapTiles 與 OSM | **MapLibre 底圖首選**：`https://tiles.openfreemap.org/styles/liberty`（臺北圖磚實測 200） | F＋C |
| [Protomaps / PMTiles](https://docs.protomaps.com/basemaps/downloads) | 圖磚 ODbL；程式 BSD-3；樣式 CC0 | 全球約 120 GB，用 `pmtiles extract` 裁出臺北自架 | 離線底圖、可打包進 App | F＋C |
| [MapLibre GL JS](https://github.com/maplibre/maplibre-gl-js) / [Leaflet](https://github.com/Leaflet/Leaflet) | BSD-3 / BSD-2 | 與 AGPL 相容 | 地圖前端 | API |
| tile.openstreetmap.org（[政策](https://operations.osmfoundation.org/policies/tiles/)） | ODbL Produced Work | **禁止離線、預抓**；需專屬 User-Agent；可能被封鎖 | 只適合線上瀏覽，不建議 | F |

### 無障礙與易讀標準
| 名稱 | 說明 | 驗證 |
|---|---|---|
| [WCAG 2.2](https://www.w3.org/TR/WCAG22/) | 2024-12 成為 W3C 建議；新增 2.5.8 目標尺寸、2.4.11 焦點不被遮擋等。尚無官方繁中翻譯 | F |
| [Inclusion Europe 易讀規範](https://www.inclusion-europe.eu/easy-to-read/) | 易讀版文案規則；易讀 Logo 需附指定版權文字 | F |
| [臺灣易讀參考指南：讓資訊易讀易懂](https://tneni.mohw.gov.tw/image/catalog/file/_%E8%87%BA%E7%81%A3%E6%98%93%E8%AE%80%E5%8F%83%E8%80%83%E6%8C%87%E5%8D%97_%E8%AE%93%E8%B3%87%E8%A8%8A%E6%98%93%E8%AE%80%E6%98%93%E6%87%82(2.19MB).pdf) | 衛福部網域 PDF；中文易讀寫作規範（內文與授權未確認） | C＋S |
| [數位發展部 網站無障礙規範](https://accessibility.moda.gov.tw/) | 檢測標章（網站回 403，僅附連結） | C |

### 裝置端 AI（執行時禁止雲端推論、禁用中國廠商）
| 名稱 | 授權 | 大小／限制 | WebView 可跑？ | 驗證 |
|---|---|---|---|---|
| [paraphrase-multilingual-MiniLM-L12-v2](https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2) | Apache-2.0 | int8 約 118 MB；支援 zh-tw、vi、th、id | ✅ Transformers.js（已實測，見 `tools/decision-kit`） | F＋API |
| [multilingual-e5-small](https://huggingface.co/intfloat/multilingual-e5-small) | MIT | int8 約 118 MB；輸入需加 `query: ` 前綴 | ✅ Transformers.js | API |
| [Whisper](https://github.com/openai/whisper)（[ONNX](https://huggingface.co/onnx-community/whisper-base)） | MIT／Apache-2.0 | tiny int8 decoder 約 31 MB、base 約 54 MB（encoder 另計） | ✅ Transformers.js | API |
| [whisper.cpp](https://github.com/ggml-org/whisper.cpp) | MIT | 原生 C++ | 需 Flutter 原生層 | API |
| [Android SpeechRecognizer](https://developer.android.com/reference/android/speech/SpeechRecognizer) | 平台 API | 一般版**可能傳到雲端**；需用 `createOnDeviceSpeechRecognizer`（API 31+） | 需 Flutter 原生層 | F |
| Web Speech `speechSynthesis`（[MDN](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis)） | — | **Android WebView 不支援**；iOS WebView 支援 | Android 需透過 App 呼叫系統 TTS | C |
| Web Speech `SpeechRecognition`（[MDN](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition)） | — | Chrome 會送到伺服器，**違反裝置端規定** | 不要用 | F＋C |
| [Opus-MT](https://huggingface.co/Helsinki-NLP/opus-mt-en-zh) | 多數 Apache-2.0；**zh→en 為 CC-BY-4.0** | en↔vi、en↔id、th→en、en→zh、zh→vi；**沒有 en→th**；中文輸出繁簡未確認 | ✅ Transformers.js | API |
| [tesseract.js](https://github.com/naptha/tesseract.js)（[tessdata_fast](https://github.com/tesseract-ocr/tessdata_fast)） | Apache-2.0 | 有 `chi_tra` 繁中模型 | ✅ WASM | F＋API＋C |
| [Transformers.js](https://github.com/huggingface/transformers.js) | Apache-2.0 | 推論執行環境 | — | API |
| [EmbeddingGemma-300m](https://huggingface.co/onnx-community/embeddinggemma-300m-ONNX) | **Gemma Terms（非 OSI 開源）** | 有使用限制與遠端限制權 | 可跑但**不建議** | F＋API |
| [Piper TTS](https://github.com/OHF-Voice/piper1-gpl) | GPL-3.0 | 沒有 zh_TW；zh_CN 語音資料來源不明 | **不建議** | API |

### 其他全球資料、圖示、字型
| 名稱 | 授權 | 注意 | 可用情境 | 驗證 |
|---|---|---|---|---|
| [Wikidata](https://www.wikidata.org/wiki/Wikidata:Licensing) | 結構化資料 CC0 | 可自由使用 | 地名的越南文、印尼文、泰文標籤 | F |
| [Unicode CLDR](https://github.com/unicode-org/cldr) | Unicode License V3 | 需附版權聲明 | 日期、數字、語言名稱在地化 | F |
| [OpenMoji](https://openmoji.org/faq/) | CC BY-SA 4.0 | 可商用、需標示；修改後要同授權 | 長者、兒童的圖示按鈕 | F＋API |
| [Noto Sans TC / CJK](https://github.com/notofonts/noto-cjk) | SIL OFL 1.1 | 可內嵌 | 繁中字型 | F＋C |

### 未驗證
- wheelmap.org、accessibility.moda.gov.tw 回 403
- 臺灣易讀指南只確認 PDF 存在，未讀內文與授權
- Android WebView 的 `SpeechRecognition.processLocally` 是否可用（只照 Chrome 推定）
- Opus-MT 中文輸出是簡體或繁體；flutter_tts 等外掛授權

---

## 5. 授權與合規

1. **政府開放資料（OGDL v1）**：可商用、可改作，需標示出處（資料集名稱＋提供單位＋連結）。
2. **OSM（ODbL）與 AGPL 並存**：AGPL 只涵蓋程式碼。repo 內的 OSM 衍生資料（例如臺北無障礙 POI JSON）請放獨立目錄並附 ODbL 聲明；地圖畫面是 Produced Work，需標示「© OpenStreetMap contributors」。
3. **排除（非商業或非開源）**：ARASAAC 圖卡（CC BY-NC-SA）、NLLB-200（CC-BY-NC-4.0）、accessibility.cloud／Wheelmap 免費 token（限非商業）、EmbeddingGemma（Gemma Terms）。
4. **禁用中國廠商模型**：Qwen、BGE（北京智源）、GTE、Paraformer、SenseVoice（阿里巴巴）；sherpa-onnx 開發團隊背景未查證，保守起見避開。
5. **執行時 AI 必須在裝置端**：不要用 Web Speech 的 SpeechRecognition、Workers AI、任何雲端 LLM API；README 需揭露模型名稱、版本、量化格式、推論框架、來源。
6. **地圖**：用 Leaflet／MapLibre＋OpenFreeMap 或國土測繪中心圖資，不要用 Google Maps、Mapbox。
