import { NextResponse } from 'next/server'
import { fetchAmemobaPriceByQuery } from '@/lib/amemoba'

export async function POST(req: Request) {
  try {
    const { query } = await req.json() as { query?: string }
    const q = (query || '').trim()
    if (!q) {
      return NextResponse.json({ ok: false, error: 'query is required' }, { status: 400 })
    }

    const result = await fetchAmemobaPriceByQuery(q)

    if (result.price == null) {
      return NextResponse.json({
        ok: false,
        error: '価格が見つかりませんでした',
        ...result,
      }, { status: 404 })
    }

    return NextResponse.json({
      ok: true,
      price: result.price,
      url: result.url,
      title: result.title,
      matchedText: result.matchedText,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'unknown' }, { status: 500 })
  }
}
