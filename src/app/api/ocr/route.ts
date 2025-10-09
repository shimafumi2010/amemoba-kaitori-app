import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export const runtime = 'nodejs'
export const preferredRegion = ['hnd1', 'icn1', 'sin1', 'sfo1']

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status })
}

type OcrOutFields = {
  imeiCandidates: string[]
  serialCandidates: string[]
  modelCandidates: string[]
  batteryPercent: number | null
}

export async function POST(req: NextRequest) {
  try {
    const { imageBase64 } = await req.json()
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return bad('imageBase64 が必要です')
    }

    const prompt = `You are an OCR/IE agent. Extract fields from the image if present.
- Return JSON with keys: imeiCandidates (array), serialCandidates (array), modelCandidates (array), batteryPercent (number or null), bboxes (object)
- IMEI should be 15 digits; provide multiple candidates if seen
- Apple Serial is usually 12 alnum chars; include variants if ambiguous (e.g., Z/2, O/0)
- Model (front part) usually 5 alnum like MLJH3 (ignore suffix like J/A)
- Battery percent as integer if shown (0-100)
- Provide approximate bounding boxes for IMEI and Serial tokens if possible (normalized 0..1)
Output only JSON.`

    const res = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'input_image', image_url: imageBase64 },
          ],
        },
      ],
      response_format: { type: 'json_object' },
    })

    const content = res.choices?.[0]?.message?.content ?? '{}'

    let parsed: any = {}
    try {
      parsed = JSON.parse(content)
    } catch {
      const jsonLike = content.match(/\{[\s\S]*\}/)?.[0]
      parsed = jsonLike ? JSON.parse(jsonLike) : {}
    }

    const fields: OcrOutFields = {
      imeiCandidates: Array.isArray(parsed.imeiCandidates) ? parsed.imeiCandidates : [],
      serialCandidates: Array.isArray(parsed.serialCandidates) ? parsed.serialCandidates : [],
      modelCandidates: Array.isArray(parsed.modelCandidates) ? parsed.modelCandidates : [],
      batteryPercent:
        typeof parsed.batteryPercent === 'number' && Number.isFinite(parsed.batteryPercent)
          ? Math.max(0, Math.min(100, Math.round(parsed.batteryPercent)))
          : null,
    }

    const bboxes = typeof parsed.bboxes === 'object' && parsed.bboxes ? parsed.bboxes : {}

    return NextResponse.json({ ok: true, fields, bboxes })
  } catch (e: any) {
    console.error('/api/ocr error', e)
    const msg = e?.message ?? 'OCR処理でエラーが発生しました'
    const status = typeof e?.status === 'number' ? e.status : 500
    return NextResponse.json({ ok: false, error: msg }, { status })
  }
}
