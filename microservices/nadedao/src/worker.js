// Cloudflare Workers 進入點；靜態檔由 wrangler.jsonc 的 assets 設定直接提供
import { createApp } from './app.js';

export default createApp('cloudflare-workers');
