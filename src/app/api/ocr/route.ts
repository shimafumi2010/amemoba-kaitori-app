import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

// Node ランタイム指定（Vercel）
export const runtime = 'nodejs'
export const preferredRegion = ['hnd1', 'icn1', 'sin1', 'sfo1']

type OcrOut = {
  model_name?: string
  capacity?: string
  color?: string
  model_number?: string
  imei?: string
  serial?: string
  battery?: string
}
type BBox = { x: number; y: number; w: number; h: number }
type OcrBBoxes = Partial<Record<'model_number' | 'imei' | 'serial' | 'header', BBox>>

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status })
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { imageBase64?: string }
    const imageBase64 = body?.imageBase64
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return bad('imageBase64 is required', 400)
    }

    const systemPrompt =
      'You are an OCR/IE agent for used phone trade-in. Extract ONLY JSON. Japanese/English mix is common.'

    // 期待スキーマと bboxes 指示
    const userPrompt = `
3uTools のスクリーンショット画像から以下を抽出して JSON のみで返す。

必須キー:
{
 "model_name": "例: iPhone 11 Pro",
 "capacity": "例: 64GB",
 "color": "例: Midnight Green",
 "model_number": "例: MWC62 J/A",
 "imei": "15桁の数字",
 "serial": "英数字12桁程度",
 "battery": "例: 100%"
}

制約:
- battery は "85%" のように % を含める
- capacity は "256 GB" のような表記は "256GB" に正規化
- 文字の前後空白は除去

さらに、以下のテキストブロックの概形 bbox(0..1) も返す:
{
 "model_number": {x,y,w,h},
 "imei": {x,y,w,h},
 "serial": {x,y,w,h}
}
これらは「Sales Model」「IMEI」「Serial Number」の値テキストの矩形を含むように近似でよい。
出力は JSON のみ。
`.trim()

    // 型の厳格チェックを避けるため any で messages を構築
    const resp = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.1,
      messages: [
        { role: 'system', content: systemPrompt } as any,
        {
          role: 'user',
          content: [
            { type: 'text', text: userPrompt },
            { type: 'image_url', image_url: { url: imageBase64 } }
          ]
        } as any
      ],
      response_format: { type: 'json_object' }
    } as any)

    let content = resp.choices?.[0]?.message?.content ?? '{}'

    // JSON抽出（保険）
    const m = content.match(/\{[\s\S]*\}/)
    if (m) content = m[0]

    let parsed: any = {}
    try { parsed = JSON.parse(content) } catch { parsed = {} }

    // 正規化
    const out: OcrOut = {}
    if (parsed.model_name) out.model_name = String(parsed.model_name).trim()
    if (parsed.capacity) {
      const cap = String(parsed.capacity).replace(/\s+/g, '').toUpperCase()
      out.capacity = cap.replace(/ＴＢ/g, 'TB').replace(/ＧＢ/g, 'GB')
    }
    if (parsed.color) out.color = String(parsed.color).trim()
    if (parsed.model_number) {
      out.model_number = String(parsed.model_number)
        .replace(/[Ａ-Ｚａ-ｚ０-９／]/g, (s: string) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
        .replace(/\s{2,}/g, ' ')
        .trim()
    }
    if (parsed.imei) {
      const d = String(parsed.imei).replace(/\D+/g, '').match(/\d{15}/)
      if (d) out.imei = d[0]
    }
    if (parsed.serial) {
      out.serial = String(parsed.serial).replace(/[^0-9A-Za-z]/g, '').slice(0, 20)
    }
    if (parsed.battery) {
      const b = String(parsed.battery).match(/(\d{2,3})\s*%?/)
      if (b) out.battery = `${b[1]}%`
    }

    const bboxes: OcrBBoxes = {}
    const bb = parsed.bboxes || parsed.bbox || {}
    for (const k of ['model_number', 'imei', 'serial']) {
      const v = bb?.[k]
      if (v && typeof v.x === 'number' && typeof v.y === 'number' && typeof v.w === 'number' && typeof v.h === 'number') {
        // 0..1 にクランプ
        bboxes[k as keyof OcrBBoxes] = {
          x: Math.min(1, Math.max(0, v.x)),
          y: Math.min(1, Math.max(0, v.y)),
          w: Math.min(1, Math.max(0, v.w)),
          h: Math.min(1, Math.max(0, v.h))
        }
      }
    }

    return NextResponse.json({ ok: true, data: out, bboxes })
  } catch (e: any) {
    // レート制限など
    if (e?.status === 429 || /rate limit/i.test(e?.message || '')) {
      // OpenAIの「Retry-After」秒数が取れないケースもあるので固定30秒返す
      return NextResponse.json({ ok: false, error: 'RATE_LIMIT', retryAfterSeconds: 30 }, { status: 429 })
    }
    const msg = e?.message ?? 'OCR処理でエラーが発生しました'
    const status = typeof e?.status === 'number' ? e.status : 500
    return NextResponse.json({ ok: false, error: msg }, { status })
  }
}
