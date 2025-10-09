import { NextRequest, NextResponse } from 'next/server'

const G_SEARCH = 'https://geo-online.co.jp/ec/sell/search'

export const runtime = 'nodejs'
export const preferredRegion = ['hnd1', 'icn1']

export async function POST(req: NextRequest) {
  try {
    const { modelPrefix } = await req.json()
    if (!modelPrefix) {
      return NextResponse.json({ ok: false, error: 'modelPrefix が必要です' }, { status: 400 })
    }

    const url = `${G_SEARCH}?q=${encodeURIComponent(modelPrefix)}`
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    const html = await res.text()

    // 検索結果から「未使用」「中古」の価格部分を抽出
    const used = html.match(/中古[\\s\\S]{0,10}?([0-9,]+円(〜[0-9,]+円)?)/)?.[1] ?? null
    const unused = html.match(/未使用[\\s\\S]{0,10}?([0-9,]+円(〜[0-9,]+円)?)/)?.[1] ?? null

    return NextResponse.json({
      ok: true,
      modelPrefix,
      geoUrl: url,
      prices: { unused, used },
    })
  } catch (e: any) {
    console.error('/api/geo-prices error', e)
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
