import { NextResponse } from 'next/server'
import OpenAI from 'openai'

type OcrResult = {
  model_name?: string
  capacity?: string
  color?: string
  model_number?: string
  imei?: string
  serial?: string
  battery?: string
}

/**
 * 3uToolsのスクショをOpenAIに渡して、必要な項目をJSONで返す。
 * - 日本語/英語混在に対応
 * - 返却前に軽く正規化（IMEI / 容量 / バッテリー）
 */
export async function POST(req: Request) {
  try {
    const { imageBase64 } = await req.json() as { imageBase64: string }
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return NextResponse.json({ error: 'imageBase64 is required' }, { status: 400 })
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const system = [
      'あなたはリユース端末の査定ツールです。',
      'ユーザーがアップロードする3uToolsのスクリーンショットから、以下のJSONを厳密に返してください。',
      '追加の文章は禁止。キーは必ず英語のケンバンで出力。'
    ].join('\n')

    const schemaHint = `
期待するJSONのキー:
{
  "model_name": "iPhone 13 Pro など",
  "capacity": "128GB / 256GB / 512GB / 1TB など",
  "color": "Sierra Blue など",
  "model_number": "MLTE3J/A など (SalesModel / Model)",
  "imei": "15桁の数字",
  "serial": "英数字のシリアル",
  "battery": "80% のように百分率"
}

補助ヒント:
- 3uTools の表示例: Title/Device 名・SalesModel(=モデル番号)・HardDiskCapacity(=容量)・SerialNumber・IMEI・Battery Life など
- 表記ゆれ: 容量 "256 GB" → "256GB" に揃える, バッテリー "Battery Life: 85%" → "85%"
- 取り出せないフィールドは空文字にする
`

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: system },
      {
        role: 'user',
        content: [
          { type: 'text', text: `以下の画像から、指定のJSONだけを返してください。\n${schemaHint}\n出力はJSONのみ。` },
          // data URL のまま渡してOK
          { type: 'image_url', image_url: imageBase64 }
        ]
      }
    ]

    const resp = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      messages
    })

    let content = resp.choices?.[0]?.message?.content ?? ''
    if (!content) {
      return NextResponse.json({ error: 'Empty OCR response' }, { status: 500 })
    }

    // ---- JSON抽出（モデルが前後に説明文を付ける対策）----
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (jsonMatch) content = jsonMatch[0]

    let parsed: OcrResult
    try {
      parsed = JSON.parse(content) as OcrResult
    } catch {
      // どうしてもパースできない場合は空オブジェクト
      parsed = {}
    }

    // ---- 正規化 ----
    const normalized: OcrResult = { ...parsed }

    // 容量: "256 GB" → "256GB"、"1 TB"→"1TB"
    if (normalized.capacity) {
      const cap = normalized.capacity
        .replace(/\s+/g, '')
        .replace(/ＴＢ/gi, 'TB')
        .replace(/ＧＢ/gi, 'GB')
      // 末尾にGB/TBがない場合は数値だけ抽出してGB付与（安全側）
      const m = cap.match(/^(\d+(?:\.\d+)?)(GB|TB)$/i) || cap.match(/^(\d+(?:\.\d+)?)/)
      if (m) {
        const num = m[1]
        const unit = (m[2] || 'GB').toUpperCase()
        normalized.capacity = `${num}${unit}`
      }
    }

    // IMEI: 最初の15桁を採用
    if (normalized.imei) {
      const m = normalized.imei.replace(/\D/g, '').match(/(\d{15})/)
      if (m) normalized.imei = m[1]
    }

    // バッテリー: "85%" or "85" に揃える（UIで%を付けてもOK）
    if (normalized.battery) {
      const m = normalized.battery.match(/(\d{2,3})\s*%?/)
      if (m) normalized.battery = `${m[1]}%`
    }

    // モデル番号: 全角→半角, スペース削除
    if (normalized.model_number) {
      normalized.model_number = normalized.model_number
        .replace(/[Ａ-Ｚａ-ｚ０-９／]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
        .replace(/\s+/g, '')
    }

    return NextResponse.json({ ok: true, data: normalized })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ ok: false, error: e?.message ?? 'unknown' }, { status: 500 })
  }
}
