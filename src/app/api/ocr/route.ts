import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { postprocessOcr, OcrResult } from '../../../lib/ocrPostprocess'

export async function POST(req: Request) {
  try {
    const { imageBase64 } = (await req.json()) as { imageBase64: string }
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return NextResponse.json({ ok: false, error: 'imageBase64 is required' }, { status: 400 })
    }

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: 'OPENAI_API_KEY is missing on server' },
        { status: 500 }
      )
    }

    const client = new OpenAI({ apiKey })

    const systemPrompt =
      '3uToolsのスクリーンショットから機種情報を抽出して、指定のJSONだけ返してください。追加の説明は不要。'

    const schemaHint = `
期待するJSON:
{
  "model_name": "iPhone 13 Pro など",
  "capacity": "128GB / 256GB / 512GB / 1TB",
  "color": "Sierra Blue など",
  "model_number": "MLTE3J/A など (SalesModel)",
  "imei": "15桁の数字",
  "serial": "英数字シリアル",
  "battery": "85% のように百分率"
}
`.trim()

    const messages: any = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'text', text: `以下の画像から指定のJSONのみ返してください。\n${schemaHint}` },
          { type: 'image_url', image_url: { url: imageBase64 } }
        ]
      }
    ]

    const resp = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      messages
    })

    let content = resp.choices?.[0]?.message?.content ?? ''
    if (!content) return NextResponse.json({ ok: false, error: 'Empty OCR response' }, { status: 500 })

    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (jsonMatch) content = jsonMatch[0]

    let parsed: OcrResult = {}
    try { parsed = JSON.parse(content) as OcrResult } catch { parsed = {} }

    const { data, warnings } = postprocessOcr(parsed)

    return NextResponse.json({ ok: true, data, warnings })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ ok: false, error: e?.message ?? 'unknown' }, { status: 500 })
  }
}
