# 課堂文字雲

繁體中文的即時課堂互動網站，包含講師管理頁、學生作答頁與投影頁。前端不需安裝套件；本機可先用示範模式操作，連接 Supabase 後則由雲端資料庫保存歷史場次並透過 Realtime 同步回答。

## 本機預覽

需求：Node.js 20 或更新版本。專案沒有 npm 相依套件。

在 PowerShell 進入此資料夾後執行：

```powershell
node server.mjs
```

瀏覽器開啟 `http://localhost:4173`。沒有雲端設定時會進入本機示範模式，活動和回答保存在目前瀏覽器的 localStorage；同一台電腦、同一個網址下可以另開學生作答頁和投影頁預覽。這個示範模式不會跨裝置同步。

第一次載入需要網路連線，以讀取 Supabase JavaScript SDK、QR Code 產生器與中文字型；未設定雲端時，示範資料仍只存在本機瀏覽器。

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

講師帳號由網站的「建立講師帳號」建立，與 Supabase Dashboard 登入帳號分開。正式前端網址確定後，請把它設為 Supabase Auth 的 Site URL，並加入 Redirect URLs。若之後改用 CLI 更新函式，請使用 `npx supabase functions deploy submit-response --no-verify-jwt`；`supabase/config.toml` 已保留相同設定。

Dashboard SQL Editor 不會替 CLI 建立 migration history 記錄。若日後第一次改用 `supabase db push`，本遷移可能再次執行；檔案中的建立語句採用 `if not exists` 或 `create or replace`，可重複套用。

## 雲端部署前端

網站是靜態檔案，可部署到 Netlify、Vercel 或其他靜態主機。以 Netlify 為例：

1. 將專案資料夾放進自己的 Git repository。
2. 在 Netlify 新增網站並選擇該 repository。
3. Build command 設為 `node build.mjs`，Publish directory 設為 `dist`。
4. 在網站環境變數加入 `SUPABASE_URL` 和 `SUPABASE_PUBLISHABLE_KEY`，再重新部署。
5. 到 Supabase Auth 設定正式網站的 Site URL / Redirect URLs。

環境變數範例也在 [`.env.example`](.env.example)。`build.mjs` 只把 URL 和公開的 publishable key 寫進部署檔；不要將任何 service role 或 secret key 設成前端環境變數。

## 使用方式

- 講師登入後建立多場活動；每場可編輯問題、設定封鎖字詞、清空回答、封存或重新開啟。
- 活動會產生學生作答網址與 QR Code。QR Code 只帶作答活動識別碼，不帶登入或管理憑證。
- 學生不需登入；每個瀏覽器每場活動只能成功提交一次。資料庫也會以伺服器產生的 HMAC 摘要做重複與速率檢查。
- 含外部連結的回答先列入「待確認」，講師可放行或刪除；設定的封鎖字詞會在伺服器端拒絕。
- 投影頁從管理頁開啟，會使用已登入的講師工作階段讀取回答；它有全螢幕模式，QR Code 會留在畫面供學生掃描。
- 回答依瀏覽器繁體中文分詞計算詞頻，字體大小依出現次數調整。講師可匯出 UTF-8 CSV。

## 尚需完成的網站上線設定

Supabase 雲端資料庫與學生提交函式已部署；前端網站尚未發布到 Netlify、Vercel 或其他靜態主機。發布後設定 `SUPABASE_URL` 與 `SUPABASE_PUBLISHABLE_KEY`，並更新 Supabase Auth 的 Site URL / Redirect URLs，即可讓講師登入並跨裝置即時同步。

