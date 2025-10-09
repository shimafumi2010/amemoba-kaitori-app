// src/app/api/ocr/route.ts
import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

export const runtime = 'nodejs'
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status })
}

/**
 * 期待する返却JSON（最小版）:
 * {
 *   ok: true,
 *   data: {
 *     model_name: string|null,     // 例: "iPhone 11 Pro"
 *     capacity: string|null,       // 例: "64GB"
 *     color: string|null,          // 例: "Midnight Green"
 *     model_number: string|null,   // 例: "MWC62 J/A"（※フルで返す）
 *     imei: string|null,           // 15桁（フォーマットはそのまま）
 *     serial: string|null,         // 12桁英数（フォーマットはそのまま）
 *     battery: string|null         // 例: "100%" など文字列でOK
 *   },
 *   imei_bbox?: {x:number,y:number,w:number,h:number}|null,    // 0..1 の正規化座標（任意）
 *   serial_bbox?: {x:number,y:number,w:number,h:number}|null   // 0..1 の正規化座標（任意）
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const { imageBase64 } = await req.json()
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return bad('imageBase64 が必要です')
    }

    const prompt = `
You are an OCR/IE agent for a 3uTools device info screenshot (always same layout).
Return ONLY JSON with exactly:

{
  "model_name": string|null,
  "capacity": string|null,
  "color": string|null,
  "model_number": string|null,
  "imei": string|null,
  "serial": string|null,
  "battery": string|null,
  "imei_bbox": {"x":number,"y":number,"w":number,"h":number}|null,
  "serial_bbox": {"x":number,"y":number,"w":number,"h":number}|null
}

Rules:
- model_name: top-left header (e.g., "iPhone 11 Pro")
- capacity: next token in header (e.g., "64GB")
- color: next token in header (e.g., "Midnight Green")
- model_number: full string including suffix (e.g., "MWC62 J/A")
- imei: 15-digit as shown (do not format)
- serial: 12 alphanum as shown
- battery: battery info as shown (e.g., "100%" or "100")
- imei_bbox/serial_bbox: approximate normalized [0..1] box around the value texts if possible; else null
- Output valid JSON only, no markdown, no trailing comments.
`.trim()

    // Vision: chat.completions + image_url（Node SDK v4 互換の書き方）
    const res = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageBase64 } },
          ],
        },
      ],
    })

    const raw = res.choices?.[0]?.message?.content ?? '{}'
    let parsed: any = {}
    try {
      parsed = JSON.parse(raw)
    } catch {
      const m = raw.match(/\{[\s\S]*\}/)?.[0]
      parsed = m ? JSON.parse(m) : {}
    }

    const data = {
      model_name: typeof parsed?.model_name === 'string' ? parsed.model_name : null,
      capacity: typeof parsed?.capacity === 'string' ? parsed.capacity : null,
      color: typeof parsed?.color === 'string' ? parsed.color : null,
      model_number: typeof parsed?.model_number === 'string' ? parsed.model_number : null,
      imei: typeof parsed?.imei === 'string' ? parsed.imei : null,
      serial: typeof parsed?.serial === 'string' ? parsed.serial : null,
      battery: typeof parsed?.battery === 'string' ? parsed.battery : (
        typeof parsed?.battery === 'number' ? String(parsed.battery) : null
      ),
    }

    const imei_bbox = parsed?.imei_bbox && typeof parsed.imei_bbox === 'object' ? parsed.imei_bbox : null
    const serial_bbox = parsed?.serial_bbox && typeof parsed.serial_bbox === 'object' ? parsed.serial_bbox : null

    return NextResponse.json({ ok: true, data, imei_bbox, serial_bbox })
  } catch (e: any) {
    const msg = e?.message || 'OCR処理エラー'
    const status = typeof e?.status === 'number' ? e.status : 500
    return NextResponse.json({ ok: false, error: msg }, { status })
  }
}
