# 課堂文字雲

繁體中文的即時課堂互動網站，包含講師管理頁、學生作答頁與投影頁。前端不需安裝套件；本機可先用示範模式操作，連接 Supabase 後則由雲端資料庫保存歷史場次並透過 Realtime 同步回答。

## 本機預覽

需求：Node.js 20 或更新版本。專案沒有 npm 相依套件。

在 PowerShell 進入此資料夾後執行：

```powershell
node server.mjs
```

瀏覽器開啟 `http://localhost:4173`。沒有雲端設定時會進入本機示範模式，活動和回答保存在目前瀏覽器的 localStorage；同一台電腦、同一個網址下可以另開學生作答頁和投影頁預覽。這個示範模式不會跨裝置同步。

第一次載入需要網路連線，以讀取 Supabase JavaScript SDK 與中文字型；QR Code 產生器已隨網站檔案一起提供。未設定雲端時，示範資料仍只存在本機瀏覽器。

本課堂文字雲已連接 Supabase 專案 `jrazhjyrpetwwxycnhbz`。在同一個 PowerShell 視窗設定公開連線值後，就能用雲端模式預覽：

```powershell
$env:SUPABASE_URL = "https://jrazhjyrpetwwxycnhbz.supabase.co"
$env:SUPABASE_PUBLISHABLE_KEY = "sb_publishable_pi5wAU6zR6YSGrtr_i8Ijw_k0q9wIvn"
node server.mjs
```

這兩個值是瀏覽器端公開設定，資料安全由 Supabase Auth 與 RLS 權限政策保護。請勿把 secret key 或舊版 `service_role` key 放進前端設定。

## Supabase 雲端部署狀態

Supabase 後端已部署到新加坡區域的免費專案：

- Project reference：`jrazhjyrpetwwxycnhbz`
- Project URL：`https://jrazhjyrpetwwxycnhbz.supabase.co`
- Publishable key：見上方本機設定範例；此值可放在瀏覽器端。
- 資料庫遷移：[`supabase/migrations/202610200001_initial.sql`](supabase/migrations/202610200001_initial.sql) 已透過 Dashboard SQL Editor 執行，建立活動、回答、講師列權限、Realtime publication 與伺服器防濫發資料表。
- Edge Function：`https://jrazhjyrpetwwxycnhbz.supabase.co/functions/v1/submit-response` 已部署。JWT 驗證已關閉，學生不需登入即可呼叫；函式會檢查字數、封鎖詞、重複提交與來源速率限制。

講師帳號由網站的「建立講師帳號」建立，與 Supabase Dashboard 登入帳號分開。Supabase Auth 的 Site URL 已設為正式 GitHub Pages 網址。網站目前未指定額外的 `redirectTo`，若日後新增此設定，請先把精確網址加入 Redirect URLs。若之後改用 CLI 更新函式，請使用 `npx supabase functions deploy submit-response --no-verify-jwt`；`supabase/config.toml` 已保留相同設定。

Dashboard SQL Editor 不會替 CLI 建立 migration history 記錄。若日後第一次改用 `supabase db push`，本遷移可能再次執行；檔案中的建立語句採用 `if not exists` 或 `create or replace`，可重複套用。

## GitHub Pages 前端

正式網站：https://lingwa923-crypto.github.io/classroom-word-cloud/

部署流程在 [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)。每次推送到 `main`，GitHub Actions 會執行 `node build.mjs`，產生 `dist/` 並發布至 GitHub Pages。GitHub Pages 已設定為 GitHub Actions 來源。

這個 GitHub Free 帳號需使用公開 repository 才能啟用 Pages，因此本 repository 與網站原始碼目前都是公開的。部署流程只把 Supabase URL 與 publishable key 寫入瀏覽器設定檔；這兩個值是公開前端設定。不可把 service role 或 secret key 放進前端或 workflow。

QR Code 產生器採用 MIT 授權的 qrcode-generator，授權與來源列於 [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)。

本機預覽設定範例仍在 [`.env.example`](.env.example)。

## 使用方式

- 講師登入後建立多場活動；每場可編輯問題、設定封鎖字詞、清空回答、封存或重新開啟。
- 活動會產生學生作答網址與 QR Code。QR Code 只帶作答活動識別碼，不帶登入或管理憑證。
- 學生不需登入；每個瀏覽器每場活動只能成功提交一次。資料庫也會以伺服器產生的 HMAC 摘要做重複與速率檢查。
- 含外部連結的回答先列入「待確認」，講師可放行或刪除；設定的封鎖字詞會在伺服器端拒絕。
- 投影頁從管理頁開啟，會使用已登入的講師工作階段讀取回答；它有全螢幕模式，QR Code 會留在畫面供學生掃描。
- 回答依瀏覽器繁體中文分詞計算詞頻，字體大小依出現次數調整。講師可匯出 UTF-8 CSV。

## 網站上線狀態

Supabase 雲端資料庫、學生提交函式與 GitHub Pages 前端都已部署，Supabase Auth 的 Site URL 也已更新為正式網站網址。

