// src/app/api/ocr/route.ts
import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export const runtime = 'nodejs'
export const preferredRegion = ['hnd1', 'icn1', 'sin1', 'sfo1']

function bad(message: string, status = 400, extra: Record<string, any> = {}) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status })
}

let chain = Promise.resolve()
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn)
  chain = next.then(() => undefined, () => undefined)
  return next
}

export async function POST(req: NextRequest) {
  return enqueue(async () => {
    try {
      const { imageBase64 } = await req.json()
      if (!imageBase64 || typeof imageBase64 !== 'string') {
        return bad('imageBase64 が必要です')
      }

      const prompt = `You are an OCR/IE agent for screenshots from "3uTools".
Extract fields and return ONLY JSON with this exact structure:

{
  "imeiCandidates": string[],
  "serialCandidates": string[],
  "modelCandidates": string[],          // like "MWC62"
  "modelNumberFull": string|null,       // like "MWC62 J/A" if visible
  "batteryPercent": number|null,        // 0..100
  "modelName": string|null,             // e.g. "iPhone 11 Pro"
  "capacity": string|null,              // e.g. "64GB"
  "color": string|null,                 // e.g. "Midnight Green"
  "bboxes": {
    "imei": Array<{ "x": number, "y": number, "w": number, "h": number }>,
    "serial": Array<{ "x": number, "y": number, "w": number, "h": number }>
  }
}

Guidance:
- On 3uTools, the top-center header often shows "<ModelName>  <Capacity>  <Color>" as pills. Read these three explicitly.
- For modelNumberFull, prefer tokens like "MWC62 J/A" from the detail table (NOT just "MWC62").
- modelCandidates should still include the 5-char front part like "MWC62".
- Always provide "bboxes.imei" and "bboxes.serial" as arrays (empty array if not visible).
- All numbers for bboxes are normalized 0..1 relative to image size.
- Output ONLY valid JSON.`

      const res = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: imageBase64 } },
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

      const fields = {
        imeiCandidates: Array.isArray(parsed.imeiCandidates) ? parsed.imeiCandidates : [],
        serialCandidates: Array.isArray(parsed.serialCandidates) ? parsed.serialCandidates : [],
        modelCandidates: Array.isArray(parsed.modelCandidates) ? parsed.modelCandidates : [],
        modelNumberFull: typeof parsed.modelNumberFull === 'string' ? parsed.modelNumberFull : null,
        batteryPercent:
          typeof parsed.batteryPercent === 'number' && Number.isFinite(parsed.batteryPercent)
            ? Math.max(0, Math.min(100, Math.round(parsed.batteryPercent)))
            : null,
        modelName: typeof parsed.modelName === 'string' ? parsed.modelName : null,
        capacity: typeof parsed.capacity === 'string' ? parsed.capacity : null,
        color: typeof parsed.color === 'string' ? parsed.color : null,
      }

      const b = parsed?.bboxes || {}
      const bboxes = {
        imei: Array.isArray(b?.imei) ? b.imei : [],
        serial: Array.isArray(b?.serial) ? b.serial : [],
      }

      return NextResponse.json({ ok: true, fields, bboxes })
    } catch (e: any) {
      const status = typeof e?.status === 'number' ? e.status : 500
      if (status === 429) {
        const retryAfterHeader = e?.headers?.get?.('retry-after') ?? e?.response?.headers?.get?.('retry-after')
        const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) || 30 : 30
        return NextResponse.json({ ok: false, error: 'RATE_LIMIT', retryAfterSeconds }, { status: 429 })
      }
      const msg = e?.message ?? 'OCR処理でエラーが発生しました'
      return NextResponse.json({ ok: false, error: msg }, { status })
    }
  })
}
