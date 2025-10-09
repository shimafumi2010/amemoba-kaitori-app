// src/app/api/ocr/route.ts
import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
export const runtime = 'nodejs'
export const preferredRegion = ['hnd1', 'icn1', 'sin1', 'sfo1']

function bad(message: string, status = 400, extra: Record<string, any> = {}) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status })
}

// 軽い直列化で429を緩和
let chain = Promise.resolve()
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn)
  chain = next.then(() => undefined, () => undefined)
  return next
}

export async function POST(req: NextRequest) {
  return enqueue(async () => {
    try {
      const body = await req.json()

      // --------- 新：タイル（ROI切り出し済みの小画像）をまとめてOCR ---------
      if (body?.mode === 'tile') {
        const tiles: Array<{ key: string; imageBase64: string }> = Array.isArray(body?.tiles) ? body.tiles : []
        if (tiles.length === 0) return bad('tiles が空です')

        const instruct =
          `You will be given several small cropped images from the same screen (3uTools).
Each image is preceded by a line "KEY: <name>".
Read the value for each key and return ONLY JSON with exactly the following keys:
{
  "modelName": string|null,       // e.g. "iPhone 11 Pro"
  "capacity": string|null,        // e.g. "64GB"
  "color": string|null,           // e.g. "Midnight Green"
  "salesModelFull": string|null,  // e.g. "MWC62 J/A"
  "imei": string|null,            // 15 digits as seen
  "serial": string|null           // 12 alnum as seen
}
Rules:
- Output only valid JSON, no extra text.
- Keep strings as they appear (do not translate).
- If you cannot read a value, use null.`

        const contents: any[] = [{ type: 'text', text: instruct }]
        for (const t of tiles) {
          contents.push({ type: 'text', text: `KEY: ${t.key}` })
          contents.push({ type: 'image_url', image_url: { url: t.imageBase64 } })
        }

        const res = await client.chat.completions.create({
          model: 'gpt-4o-mini',
          temperature: 0.1,
          messages: [{ role: 'user', content: contents }],
          response_format: { type: 'json_object' },
        })

        const raw = res.choices?.[0]?.message?.content ?? '{}'
        let data: any = {}
        try {
          data = JSON.parse(raw)
        } catch {
          const jsonLike = raw.match(/\{[\s\S]*\}/)?.[0]
          data = jsonLike ? JSON.parse(jsonLike) : {}
        }

        const out = {
          modelName: typeof data.modelName === 'string' ? data.modelName : null,
          capacity: typeof data.capacity === 'string' ? data.capacity : null,
          color: typeof data.color === 'string' ? data.color : null,
          salesModelFull: typeof data.salesModelFull === 'string' ? data.salesModelFull : null,
          imei: typeof data.imei === 'string' ? data.imei : null,
          serial: typeof data.serial === 'string' ? data.serial : null,
        }

        return NextResponse.json({ ok: true, tiles: out })
      }

      // --------- 既存：フル画像 OCR（保険） ---------
      const imageBase64 = body?.imageBase64
      if (!imageBase64 || typeof imageBase64 !== 'string') return bad('imageBase64 が必要です')

      const prompt = `You are an OCR/IE agent for a 3uTools screenshot.
Return ONLY JSON:
{
  "imeiCandidates": string[],
  "serialCandidates": string[],
  "modelCandidates": string[],
  "modelNumberFull": string|null,
  "batteryPercent": number|null,
  "modelName": string|null,
  "capacity": string|null,
  "color": string|null,
  "bboxes": { "imei": Array<{x:number,y:number,w:number,h:number}>, "serial": Array<{x:number,y:number,w:number,h:number}> }
}
- Top header shows: "<ModelName>  <Capacity>  <Color>" — read them.
- modelNumberFull example: "MWC62 J/A".
- bboxes must be normalized 0..1 and arrays (empty allowed).
- Output only JSON.`

      const res = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        messages: [
          { role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: imageBase64 } }] },
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
      return NextResponse.json({ ok: false, error: e?.message ?? 'unknown' }, { status })
    }
  })
}
