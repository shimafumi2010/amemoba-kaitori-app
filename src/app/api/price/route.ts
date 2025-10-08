import { NextResponse } from 'next/server'
import { searchAmemobaByModelPrefix } from '@/lib/amemoba'

export async function POST(req: Request) {
  try {
    const { query } = (await req.json()) as { query?: string }
    const q = (query || '').trim()
    if (!q) {
      return NextResponse.json({ ok: false, error: 'query is required' }, { status: 400 })
    }

    // 価格抽出は行わず、リンク検索に特化
    const result = await searchAmemobaByModelPrefix(q)

    if (!result.results.length) {
      return NextResponse.json(
        { ok: false, error: '該当リンクが見つかりませんでした', ...result },
        { status: 404 }
      )
    }

    return NextResponse.json({ ok: true, ...result })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'unknown' }, { status: 500 })
  }
}
