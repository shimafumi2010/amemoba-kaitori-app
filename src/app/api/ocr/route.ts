import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

export const runtime = 'nodejs'
export const preferredRegion = ['hnd1', 'icn1', 'sin1', 'sfo1']

type Fields = {
  model_name?: string
  capacity?: string
  color?: string
  model_number?: string
  imei?: string
  serial?: string
  battery?: string
}
type Box = { x: number; y: number; w: number; h: number }
type Boxes = Partial<Record<'model_number' | 'imei' | 'serial', Box>>

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status })
}

export async function POST(req: NextRequest) {
  try {
    const { imageBase64 } = (await req.json()) as { imageBase64?: string }
    if (!imageBase64) return bad('imageBase64 is required', 400)

    // —— できるだけ短いプロンプト（速度優先）——
    const prompt = `
Return ONLY JSON. From the 3uTools screenshot, extract:
{
 "model_name": "e.g. iPhone 11 Pro",
 "capacity": "e.g. 64GB (normalize: remove spaces)",
 "color": "e.g. Midnight Green",
 "model_number": "e.g. MWC62 J/A",
 "imei": "15 digits",
 "serial": "alphanumeric",
 "battery": "e.g. 100%"
}
Also return rough bounding boxes (0..1) around the VALUE texts for:
{
 "model_number": {x,y,w,h},
 "imei": {x,y,w,h},
 "serial": {x,y,w,h}
}
JSON only.
`.trim()

    // Chat Completions（最短・低温度）
    const r = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      messages: [
        { role: 'system', content: 'Return JSON only.' } as any,
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageBase64 } },
          ],
        } as any,
      ],
      response_format: { type: 'json_object' },
    } as any)

    let content = r.choices?.[0]?.message?.content ?? '{}'
    const m = content.match(/\{[\s\S]*\}/)
    if (m) content = m[0]

    let parsed: any = {}
    try { parsed = JSON.parse(content) } catch {}

    const fields: Fields = {}
    if (parsed.model_name) fields.model_name = String(parsed.model_name).trim()
    if (parsed.capacity)   fields.capacity   = String(parsed.capacity).replace(/\s+/g, '').toUpperCase()
    if (parsed.color)      fields.color      = String(parsed.color).trim()
    if (parsed.model_number) fields.model_number = String(parsed.model_number).trim()
    if (parsed.imei) {
      const d = String(parsed.imei).replace(/\D+/g, '').match(/\d{15}/)?.[0]
      if (d) fields.imei = d
    }
    if (parsed.serial)     fields.serial     = String(parsed.serial).replace(/[^0-9A-Za-z]/g, '')
    if (parsed.battery) {
      const b = String(parsed.battery).match(/(\d{2,3})\s*%?/)
      if (b) fields.battery = `${b[1]}%`
    }

    const bboxes: Boxes = {}
    const bb = parsed.bboxes || parsed.bbox || {}
    for (const k of ['model_number', 'imei', 'serial']) {
      const v = bb?.[k]
      if (v && typeof v.x === 'number' && typeof v.y === 'number' && typeof v.w === 'number' && typeof v.h === 'number') {
        bboxes[k as keyof Boxes] = {
          x: Math.min(1, Math.max(0, v.x)),
          y: Math.min(1, Math.max(0, v.y)),
          w: Math.min(1, Math.max(0, v.w)),
          h: Math.min(1, Math.max(0, v.h)),
        }
      }
    }

    return NextResponse.json({ ok: true, data: fields, bboxes })
  } catch (e: any) {
    if (e?.status === 429 || /rate limit/i.test(String(e?.message))) {
      return NextResponse.json({ ok: false, error: 'RATE_LIMIT', retryAfterSeconds: 30 }, { status: 429 })
    }
    return NextResponse.json({ ok: false, error: e?.message ?? 'ocr failed' }, { status: 500 })
  }
}
