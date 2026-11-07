# hello-cf：Cloudflare Workers 微服務範例

城市通微服務的 Hello World，同一份程式碼可在 Cloudflare Workers 與 Node / Docker 執行。

- 線上網址：https://townpass-hello.shawn-shaubo-hsu.workers.dev/
- 城市通入口：服務 › 更多 › 其他服務 › Hello World、分類模型測試

## 內容

| 路徑 | 說明 |
|---|---|
| `public/index.html` | Hello World：示範 `userinfo`、`location`、`notify` 雙向溝通與同網域 API |
| `public/classify/` | 分類模型測試頁：裝置端 embedding（Transformers.js），可切換「城市通功能導航」與「市政陳情分派」 |
| `src/app.js` | Hono 路由：`/api/hello`、`/api/health`、`/hf/*`（模型檔代理，避開 WebView 的 CORS 問題，只允許白名單模型） |
| `src/worker.js` / `src/node.js` | Workers 與 Node 進入點 |
| `Dockerfile` | 不依賴 Cloudflare 的執行方式（可移轉） |

## 指令

```bash
npm install
npm run dev      # 本機測試（wrangler dev，http://localhost:8787）
npm run deploy   # 部署到 Cloudflare Workers
npm start        # 以 Node 執行（http://localhost:8080）
docker build -t townpass-hello . && docker run -p 8080:8080 townpass-hello
```

## 注意

- `public/classify/catalog.json`（陳情分派，11 類）是目前線上的版本；`tools/decision-kit/data/catalog.json` 是本機調整中的版本（12 類，含菸害檢舉），尚未部署。
- 定位（`location`）在 Android 模擬器上會讓 App ANR（geolocator 在模擬器 GNSS 卡住），請用實機測試。
