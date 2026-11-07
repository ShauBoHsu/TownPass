# decision-kit：裝置端文字分類器的資料與測試

用 embedding + 範例句（kNN）判斷使用者的一句話屬於哪個服務，不需訓練；抽到題目後只要改 JSON 資料。

## 資料

| 檔案 | 說明 |
|---|---|
| `data/catalog.json` | 市政陳情分派（12 類，含分派單位、關鍵字、範例句） |
| `data/testset.json` | 陳情分派測試句（34 句） |
| `data/townpass-catalog.json` | 城市通功能導航（31 類，對應 App 內的服務與頁面） |
| `data/townpass-testset.json` | 城市通功能導航測試句（62 句） |
| `data/limits.json` | 能力邊界測試：輸入穩健度、範圍外問題、干擾類別 |

## 指令

```bash
npm install
npm run bench                                                         # 陳情分派：關鍵字 vs e5-small vs MiniLM
node bench/run.js data/townpass-catalog.json data/townpass-testset.json # 城市通功能導航
node bench/limits.js                                                  # 範例數量、類別數量、範圍外偵測、輸入穩健度
node bench/query.js "句子" ["句子2" ...]                               # 查詢單句的前 5 名
```

第一次執行會從 Hugging Face 下載模型（約 118 MB，存在 `.model-cache/`）。

## 目前結果（MiniLM，q8）

| 情境 | Top-1 | Top-3 |
|---|---|---|
| 陳情分派（12 類） | 76～79% | 91～94% |
| 城市通功能導航（31 類） | 68% | 85% |

- 每類 3 句範例即達到平台期；類別超過 15～20 類準確度明顯下降
- 範例句避免「市府」「城市通」這類通用詞，會把不相關的句子吸過去
- 台語漢字、否定句、間接描述是弱點；緊急分派不能只靠模型，需搭配關鍵字規則
- 使用模型（Xenova/paraphrase-multilingual-MiniLM-L12-v2，Apache-2.0；Xenova/multilingual-e5-small，MIT）時需於 README 揭露名稱、版本、量化格式與來源
