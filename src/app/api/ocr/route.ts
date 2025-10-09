// src/app/api/ocr/route.ts
import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export const runtime = 'nodejs'
export const preferredRegion = ['hnd1', 'icn1', 'sin1', 'sfo1']

function bad(message: string, status = 400, extra: Record<string, any> = {}) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status })
}

// 軽い直列化（多重叩き抑制）
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

      // 3uToolsの上部バッジ（機種名 / 容量 / カラー）も抽出させる
      const prompt = `You are an OCR/IE agent for screenshots from "3uTools".
Extract the following if visible and return JSON ONLY with this exact shape:

{
  "imeiCandidates": string[],            // 15-digit numeric candidates
  "serialCandidates": string[],          // 12-char alnum candidates
  "modelCandidates": string[],           // e.g. MLJH3, MWC62
  "batteryPercent": number|null,         // 0..100
  "modelName": string|null,              // e.g. "iPhone 11 Pro"
  "capacity": string|null,               // e.g. "64GB"
  "color": string|null,                  // e.g. "Midnight Green"
  "bboxes": {                            // optional; normalized 0..1
    "imei"?: Array<{x:number,y:number,w:number,h:number}>,
    "serial"?: Array<{x:number,y:number,w:number,h:number}>
  }
}

Guidance:
- On 3uTools, the top center header often shows "<ModelName>  <Capacity>  <Color>" as pills/badges. Read them.
- For modelCandidates, return front part like "MWC62" if visible (ignore suffix like "J/A").
- If a value is not present, use null or [].
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
        modelName: typeof parsed.modelName === 'string' ? parsed.modelName : null,
        capacity: typeof parsed.capacity === 'string' ? parsed.capacity : null,
        color: typeof parsed.color === 'string' ? parsed.color : null,
      }

      const bboxes = typeof parsed.bboxes === 'object' && parsed.bboxes ? parsed.bboxes : {}

      return NextResponse.json({ ok: true, fields, bboxes })
    } catch (e: any) {
      const status = typeof e?.status === 'number' ? e.status : 500
      if (status === 429) {
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
