
import { NextResponse } from 'next/server'

// 画像保存などを行う場合の拡張ポイント（現状はエコー）
export async function POST(req: Request) {
  const data = await req.json()
  return NextResponse.json({ ok: true, data })
}
