// src/app/api/geo-prices/route.ts
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { modelPrefix, carrier } = await req.json()
    if (!modelPrefix) {
      return NextResponse.json({ ok: false, error: 'modelPrefix is required' }, { status: 400 })
    }

    // ここはモック応答。実運用では外部検索→解析してください
    const geoUrl = `https://buy.geo-online.co.jp/search/?q=${encodeURIComponent(modelPrefix)}`
    const prices = {
      unused: '—',
      used: '—',
    }

    return NextResponse.json({ ok: true, geoUrl, prices, carrier })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'unknown' }, { status: 500 })
  }
}
