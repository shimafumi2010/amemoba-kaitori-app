# Amemoba Kaitori App (Vercel-ready)

**中古iPhone査定のMVP**：3uToolsスクショOCR → 自動入力 → 投稿文（Chatwork貼付用） → 納品書PDF雛形。

## ✅ 最短手順（全部ブラウザ）
1. ZIPを解凍 → GitHubで新規リポ作成 → ファイル一式をアップロード
2. Supabase：New Project → Settings > API でURL/anon key取得 → SQL Editorに `supabase/schema.sql` を貼って実行
3. Vercel：New Project → Import Repo → Environment Variables に
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `OPENAI_API_KEY`
   を追加 → Deploy

> ローカル：`.env.local` を作って `npm install && npm run dev`

## ページ
- `/assess`：スクショ→OCR→最大価格取得→Chatwork投稿文作成（コピー
- `/deliveries`：納品書雛形
