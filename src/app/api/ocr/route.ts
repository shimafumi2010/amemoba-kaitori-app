import { NextResponse } from 'next/server'

/**
 * OpenAI Vision OCR（3uTools用）
 * - 429/5xx に対して指数バックオフで再試行
 * - レスポンスは常に JSON（フロントで安全パース）
 */
export async function POST(req: Request) {
  try {
    const { imageBase64 } = await req.json()
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: 'OPENAI_API_KEY is not set' }, { status: 500 })
    }
    if (!imageBase64) {
      return NextResponse.json({ ok: false, error: 'imageBase64 is required' }, { status: 400 })
    }

    const schemaHint = `
必ず以下の JSON **だけ** を返すこと:

{
  "model_name": string|null,
  "capacity": string|null,
  "color": string|null,
  "model_number": string|null,
  "imei": string|null,
  "serial": string|null,
  "battery": string|null,
  "imei_bbox": {"x": number, "y": number, "w": number, "h": number} | null,
  "serial_bbox": {"x": number, "y": number, "w": number, "h": number} | null
}

制約:
- imei_bbox / serial_bbox は画像全体に対する相対比 (0〜1)。
- JSON以外の出力（説明、コードブロック、余計な文字）は一切禁止。
`.trim()

    const body = {
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'これは 3uTools の端末情報スクリーンショットです。指定のJSONスキーマで抽出してください。' },
            { type: 'text', text: schemaHint },
            { type: 'image_url', image_url: imageBase64 }
          ]
        }
      ],
      temperature: 0.1,
    }

    // --- 指数バックオフ付きリトライ ---
    async function callOpenAIWithRetry(maxAttempts = 4) {
      let lastErr: any = null
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const r = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
          })
          const data = await r.json().catch(() => ({}))
          if (r.ok) return data

          // 429 or 5xx → リトライ
          if (r.status === 429 || r.status >= 500) {
            lastErr = { status: r.status, data }
            const retryAfter = Number(r.headers.get('retry-after') || 0)
            const backoff = retryAfter > 0 ? retryAfter * 1000 : Math.min(1500 * Math.pow(2, attempt - 1), 8000)
            await new Promise(res => setTimeout(res, backoff))
            continue
          }
          // それ以外は即エラー
          return Promise.reject({ status: r.status, data })
        } catch (e: any) {
          lastErr = e
          // ネットワーク系も少し待って再試行
          const backoff = Math.min(1500 * Math.pow(2, attempt - 1), 8000)
          await new Promise(res => setTimeout(res, backoff))
        }
      }
      throw lastErr ?? new Error('OpenAI retry exceeded')
    }

    const data = await callOpenAIWithRetry()

    const text = data?.choices?.[0]?.message?.content ?? ''
    let parsed: any = null
    try {
      parsed = JSON.parse(text)
    } catch (e) {
      return NextResponse.json(
        { ok: false, error: 'Failed to parse OCR JSON', raw: (typeof text === 'string' ? text.slice(0, 400) : text) },
        { status: 200 }
      )
    }

    return NextResponse.json({ ok: true, data: parsed })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'unknown' }, { status: 200 })
  }
}
