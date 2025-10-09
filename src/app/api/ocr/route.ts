import { NextResponse } from 'next/server'

/**
 * OpenAI のマルチモーダルで 3uTools 画面の OCR を実施。
 * 文字値に加えて IMEI / Serial の領域(bbox)を 0〜1 の割合で返すようプロンプト。
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

    // 返却スキーマを明示（bbox は 0〜1 の比率）
    const schemaHint = `
必ず以下の JSON **だけ** を返すこと:

{
  "model_name": string|null,
  "capacity": string|null,             // "128GB" など
  "color": string|null,                // "Midnight Green" など
  "model_number": string|null,         // "MWC62 J/A" など
  "imei": string|null,                 // 15桁。数字のみ
  "serial": string|null,               // 12桁。英数字
  "battery": string|null,              // "100%" など
  "imei_bbox": {"x": number, "y": number, "w": number, "h": number} | null,
  "serial_bbox": {"x": number, "y": number, "w": number, "h": number} | null
}

制約:
- imei_bbox / serial_bbox は画像全体に対する相対比 (0〜1)。左上が (x,y)、幅 w、高さ h。
- 文字が存在しなければ null。
- 余計な説明やコードブロックなしで、JSONオブジェクトのみを返すこと。
`.trim()

    const body = {
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text:
                'これは 3uTools の端末情報スクリーンショットです。' +
                'IMEI と Serial(=シリアル番号)が載っているので、数値と領域を特定してください。' +
                '他にも機種名/容量/色/モデル番号/バッテリーも可能な範囲で抽出。' +
                '出力は JSON のみ。'
            },
            { type: 'text', text: schemaHint },
            // 画像を data URL のまま渡す
            { type: 'image_url', image_url: imageBase64 }
          ]
        }
      ],
      temperature: 0.1,
    }

    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    const data = await r.json()
    if (!r.ok) {
      return NextResponse.json(
        { ok: false, error: `OpenAI error: ${r.status} ${r.statusText}`, raw: data },
        { status: r.status }
      )
    }

    // JSON テキストをパース
    const text = data?.choices?.[0]?.message?.content ?? ''
    let parsed: any = null
    try {
      parsed = JSON.parse(text)
    } catch (e) {
      return NextResponse.json(
        { ok: false, error: 'Failed to parse OCR JSON', raw: text?.slice?.(0, 400) ?? text },
        { status: 200 }
      )
    }

    return NextResponse.json({ ok: true, data: parsed })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'unknown' }, { status: 500 })
  }
}
