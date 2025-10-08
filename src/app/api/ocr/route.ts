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
      '3uToolsのスクリーンショットから端末情報を抽出して、指定のJSONだけ返してください。追加説明は不要。'

    const schemaHint = `
返すJSONの厳密スキーマ（キー以外の文字は入れないこと）:
{
  "model_name": "例: iPhone 11 Pro",
  "capacity": "例: 64GB",
  "color": "例: Midnight Green",
  "model_number": "例: MWC62J/A",
  "imei": "15桁の数字を一つ（見つからない時は空文字）",
  "serial": "英数字のシリアルを一つ（見つからない時は空文字）",
  "battery": "例: 100%",
  "imei_candidates": ["画像内で見える15桁の数字列をすべて（重複除去）"],
  "serial_candidates": ["画像内で見える8〜14文字の英数字列をなるべく（最大5件、重複除去）"]
}
`.trim()

    const messages: any = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'text', text: `以下の画像からJSONだけ返してください。\n${schemaHint}` },
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

    // 余計な文字が混ざっても {} 部分だけ抜く
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (jsonMatch) content = jsonMatch[0]

    let parsed: any = {}
    try { parsed = JSON.parse(content) } catch { parsed = {} }

    // 型を緩く受けて postprocess で整える
    const { data, warnings } = postprocessOcr(parsed as OcrResult)

    return NextResponse.json({ ok: true, data, warnings })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ ok: false, error: e?.message ?? 'unknown' }, { status: 500 })
  }
}
