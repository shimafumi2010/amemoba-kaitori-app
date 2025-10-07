import { NextResponse } from 'next/server'
import OpenAI from 'openai'

export async function POST(req: Request) {
  const { imageBase64 } = await req.json()
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const prompt = `この3uToolsスクリーンショットから以下のJSONを返してください。
{
  "model_name": "",
  "capacity": "",
  "color": "",
  "model_number": "",
  "imei": "",
  "serial": "",
  "battery": ""
}`

  const res = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: imageBase64 }
        ]
      }
    ]
  })

  const content = res.choices[0].message.content
  return NextResponse.json({ data: content })
}
