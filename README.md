# Amemoba Kaitori App (MVP)

中古iPhone査定フローのMVP。3uToolsスクショOCR → 自動入力 → 投稿文作成（Chatwork貼付用） → 納品書PDFの雛形。

## かんたん導入（全部ブラウザだけ）

### 1) GitHubにこのファイル一式をアップ
- このZIPを解凍 → GitHubで新規リポ作成 → Web UIからアップロード or `github.dev` でドラッグ&ドロップ

### 2) Supabaseを作成（Studioはブラウザ）
- https://supabase.com → New Project
- Settings > API で `Project URL / anon key` を控える
- Studio左メニュー **SQL Editor** に `supabase/schema.sql` を貼って実行（テーブル作成）

### 3) Vercelでデプロイ
- https://vercel.com → New Project → Import GitHub Repo
- **Environment Variables** に以下を登録（.envは不要）  
  - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `OPENAI_API_KEY`
- Deploy → 公開URLが発行されます

> ローカルで動かす場合：`.env.local` を作って `npm install && npm run dev`

---

## ページ構成
- `/` トップ/導線
- `/assess` 査定入力（3uToolsスクショ→OCR→フォーム自動入力、価格取得、**Chatwork投稿文作成（コピー）**）
- `/deliveries` 納品書リスト（雛形）

---

## 補足
- OCRはOpenAI Vision（`gpt-4o-mini`）を使用。精度・請求はプランに依存
- amemoba価格取得は `amemoba.com/?s=...` の簡易スクレイプ（サイト構造変更に注意）
- 本番運用ではレート制限/エラー処理・監査ログ等を追加してください
