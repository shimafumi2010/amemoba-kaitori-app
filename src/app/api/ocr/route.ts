// src/app/api/ocr/route.ts
import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export const runtime = 'nodejs'
export const preferredRegion = ['hnd1', 'icn1', 'sin1', 'sfo1']

function bad(message: string, status = 400, extra: Record<string, any> = {}) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status })
}

// ---- きわめて軽い直列化（同時1本） ----
let chain = Promise.resolve()
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn)
  chain = next.then(() => undefined, () => undefined)
  return next
}

export async function POST(req: NextRequest) {
  return enqueue(async () => {
    try {
      const { imageBase64, mode } = await req.json()
      if (!imageBase64 || typeof imageBase64 !== 'string') {
        return bad('imageBase64 が必要です')
      }

      const prompt = `You are an OCR/IE agent. Extract fields from the image if present.
- Return JSON with keys: imeiCandidates (array), serialCandidates (array), modelCandidates (array), batteryPercent (number or null), bboxes (object)
- IMEI should be 15 digits; provide multiple candidates if seen
- Apple Serial ~12 alnum; include ambiguous variants (Z/2, O/0)
- Model (front part) like MLJH3 (ignore suffix J/A)
- Battery percent as integer if shown (0-100)
- Provide approximate bounding boxes for IMEI and Serial tokens if possible (normalized 0..1)
Output only JSON.`

      // OpenAI Vision call
      const res = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: imageBase64 } }, // ← 正式フィールド
            ],
          },
        ],
        response_format: { type: 'json_object' },
      })

      const content = res.choices?.[0]?.message?.content ?? '{}'

      // Defensive JSON parse
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
        batteryPercent:
          typeof parsed.batteryPercent === 'number' && Number.isFinite(parsed.batteryPercent)
            ? Math.max(0, Math.min(100, Math.round(parsed.batteryPercent)))
            : null,
      }

      const bboxes = typeof parsed.bboxes === 'object' && parsed.bboxes ? parsed.bboxes : {}

      return NextResponse.json({ ok: true, fields, bboxes })
    } catch (e: any) {
      // 429（TPM/RPM）をフロントで扱いやすい形で返す
      const status = typeof e?.status === 'number' ? e.status : 500
      if (status === 429) {
        // Retry-After（秒）を推定
        const retryAfterHeader = e?.headers?.get?.('retry-after') ?? e?.response?.headers?.get?.('retry-after')
        const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) || 30 : 30
        return NextResponse.json(
          { ok: false, error: 'RATE_LIMIT', retryAfterSeconds },
          { status: 429 },
        )
      }
      const msg = e?.message ?? 'OCR処理でエラーが発生しました'
      return NextResponse.json({ ok: false, error: msg }, { status })
    }
  })
}
