import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const preferredRegion = ['hnd1', 'icn1']

const BASE_URL = 'https://amemoba.jp/kaitori'

export async function POST(req: NextRequest) {
  try {
    const { modelPrefix, carrier } = await req.json()
    if (!modelPrefix) {
      return NextResponse.json({ ok: false, error: 'modelPrefix が必要です' }, { status: 400 })
    }

    const searchUrl = `${BASE_URL}/?q=${encodeURIComponent(modelPrefix)}`
    const res = await fetch(searchUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    const html = await res.text()

    // キャリア推定（シンプル判定）
    let carrierSlug = ''
    if (carrier?.includes('docomo')) carrierSlug = 'docomo'
    else if (carrier?.includes('au')) carrierSlug = 'au'
    else if (carrier?.includes('Soft')) carrierSlug = 'softbank'
    else if (carrier?.includes('楽天')) carrierSlug = 'rakuten'

    // 検索結果内リンクを抽出（エスケープ最小限）
    const links = Array.from(html.matchAll(/href="(\/kaitori\/detail\/[^"]+)"/g)).map((m) => m[1])
    const firstLink = links.length > 0 ? `${BASE_URL}${links[0]}` : null

    return NextResponse.json({ ok: true, modelPrefix, carrierSlug, searchUrl, firstLink })
  } catch (e: any) {
    console.error('/api/amemoba-search error', e)
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
