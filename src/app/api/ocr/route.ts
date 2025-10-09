// src/app/api/ocr/route.ts
import { NextResponse } from 'next/server'
import OpenAI from 'openai'

export const runtime = 'nodejs'

type OcrResult = {
  model_name?: string
  capacity?: string
  color?: string
  model_number?: string
  imei?: string
  serial?: string
  battery?: string
  imei_bbox?: { x: number; y: number; w: number; h: number } | null
  serial_bbox?: { x: number; y: number; w: number; h: number } | null
}

// 数字だけ
function digitsOnly(s: string) {
  return (s || '').replace(/\D+/g, '')
}

export async function POST(req: Request) {
  try {
    // 👇 二重で JSON.parse していたバグを解消（1回だけ）
    const { imageBase64 } = (await req.json()) as { imageBase64: string }

    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return NextResponse.json({ ok: false, error: 'imageBase64 is required' }, { status: 400 })
    }

    // data URL でも外部URLでも、そのまま渡す
    const isDataUrl = imageBase64.startsWith('data:image/')
    const imageUrl = isDataUrl ? imageBase64 : imageBase64

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

    const systemPrompt =
      'あなたはリユース端末の査定ツールです。ユーザーがアップロードする3uToolsのスクリーンショットから指定のJSONだけを厳密に返して下さい。追加の説明文は不要。'

    const schemaHint = `
期待するJSONのキー:
{
  "model_name": "iPhone 11 Pro など（ヘッダー左上の機種名）",
  "capacity": "64GB など（GB/TB付きで）",
  "color": "Midnight Green など",
  "model_number": "MWC62 J/A のようにスペースやスラッシュを含むフル表記",
  "imei": "15桁の数字",
  "serial": "英数字のシリアル",
  "battery": "85% のように百分率（%付き推奨）",
  "imei_bbox": {"x":0..1,"y":0..1,"w":0..1,"h":0..1} または null,
  "serial_bbox": {"x":0..1,"y":0..1,"w":0..1,"h":0..1} または null
}

補助ヒント:
- 3uTools の表示例: Title/Device 名・SalesModel(モデル番号)・HardDiskCapacity(容量)・SerialNumber・IMEI・Battery Life など
- 表記ゆれ: 容量 "256 GB" → "256GB" に揃える, "1 TB" → "1TB"
- 取り出せないフィールドは空文字にする
`.trim()

    // 型が厳しい SDK でも通るよう any で messages を構築
    const messages: any = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'text', text: `以下の画像から、指定のJSONだけを返してください。\n${schemaHint}\n出力はJSONのみ。` },
          { type: 'image_url', image_url: { url: imageUrl } },
        ],
      },
    ]

    const resp = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages,
    })

    let content = resp.choices?.[0]?.message?.content ?? ''
    if (!content) {
      return NextResponse.json({ ok: false, error: 'Empty OCR response' }, { status: 500 })
    }

    // JSON部分だけ抽出（保険）
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (jsonMatch) content = jsonMatch[0]

    let parsed: OcrResult = {}
    try {
      parsed = JSON.parse(content) as OcrResult
    } catch {
      parsed = {}
    }

    // ---- 軽い正規化 ----
    const normalized: OcrResult = { ...parsed }

    // 容量: "256 GB" → "256GB", "1 TB" → "1TB"
    if (normalized.capacity) {
      const cap = normalized.capacity
        .replace(/\s+/g, '')
        .replace(/ＴＢ/gi, 'TB')
        .replace(/ＧＢ/gi, 'GB')
      const m = cap.match(/^(\d+(?:\.\d+)?)(GB|TB)$/i) || cap.match(/^(\d+(?:\.\d+)?)/)
      if (m) {
        const num = m[1]
        const unit = (m[2] || 'GB').toUpperCase()
        normalized.capacity = `${num}${unit}`
      }
    }

    // IMEI: 最初の15桁に整形
    if (normalized.imei) {
      const m = digitsOnly(normalized.imei).match(/(\d{15})/)
      if (m) normalized.imei = m[1]
    }

    // バッテリー: "85%" or "85" → "85%"
    if (normalized.battery) {
      const m = normalized.battery.match(/(\d{2,3})\s*%?/)
      if (m) normalized.battery = `${m[1]}%`
    }

    // モデル番号: 全角→半角, 連続空白を単一スペース（※フル表記保持）
    if (normalized.model_number) {
      normalized.model_number = normalized.model_number
        .replace(/[Ａ-Ｚａ-ｚ０-９／]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
        .replace(/\s+/g, ' ')
        .trim()
    }

    // bbox は任意。なければ null を入れる
    const imei_bbox =
      parsed?.imei_bbox && typeof parsed.imei_bbox === 'object'
        ? parsed.imei_bbox
        : null
    const serial_bbox =
      parsed?.serial_bbox && typeof parsed.serial_bbox === 'object'
        ? parsed.serial_bbox
        : null

    return NextResponse.json({ ok: true, data: normalized, imei_bbox, serial_bbox })
  } catch (e: any) {
    // OpenAIレート制限の明示返却（フロントの自動リトライ用）
    const status = typeof e?.status === 'number' ? e.status : 500
    if (status === 429) {
      // OpenAIのヘッダに Retry-After がある場合はそれを伝える
      const retryAfterSeconds = Number(e?.headers?.get?.('retry-after')) || 30
      return NextResponse.json(
        { ok: false, error: 'RATE_LIMIT', retryAfterSeconds },
        { status: 429 },
      )
    }
    const msg = e?.message || 'OCR処理エラー'
    return NextResponse.json({ ok: false, error: msg }, { status })
  }
}
