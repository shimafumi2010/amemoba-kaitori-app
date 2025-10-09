import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export const runtime = 'nodejs'
export const preferredRegion = ['hnd1', 'icn1', 'sin1', 'sfo1']

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status })
}

export async function POST(req: NextRequest) {
  try {
    const { imageBase64 } = await req.json()
    if (!imageBase64) return bad('imageBase64 が必要です')

    const prompt = `You are an OCR/IE agent. Extract fields from the image if present.
Return JSON with keys: imeiCandidates, serialCandidates, modelCandidates, batteryPercent, bboxes.`

    // 👇 型定義の互換性問題を回避するため as any を使用
    const res = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      messages: [
        {
          role: 'user',
          // @ts-ignore
          content: [
            { type: 'text', text: prompt },
            // @ts-ignore
            { type: 'input_image', image_url: imageBase64 },
          ],
        },
      ],
      response_format: { type: 'json_object' },
    } as any)

    const content = res.choices?.[0]?.message?.content ?? '{}'
    let parsed: any = {}
    try {
      parsed = JSON.parse(content)
    } catch {
      const jsonLike = content.match(/\{[\s\S]*\}/)?.[0]
      parsed = jsonLike ? JSON.parse(jsonLike) : {}
    }

    const fields = {
      imeiCandidates: parsed.imeiCandidates ?? [],
      serialCandidates: parsed.serialCandidates ?? [],
      modelCandidates: parsed.modelCandidates ?? [],
      batteryPercent: parsed.batteryPercent ?? null,
    }

    const bboxes = parsed.bboxes ?? {}

    return NextResponse.json({ ok: true, fields, bboxes })
  } catch (e: any) {
    console.error('/api/ocr error', e)
    return NextResponse.json({ ok: false, error: e.message ?? 'OCR失敗' }, { status: 500 })
  }
}
