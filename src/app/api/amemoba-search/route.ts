// src/app/api/amemoba-search/route.ts
import { NextRequest, NextResponse } from 'next/server'

const BASE = 'https://amemoba.com'

type CarrierSlug = 'softbank' | 'docomo' | 'au' | 'simfree' | 'rakuten' | ''

function toCarrierSlug(input: string | null | undefined): CarrierSlug {
  const s = (input || '').toLowerCase()
  if (!s) return ''
  if (s.startsWith('au') || s.includes('kddi')) return 'au'
  if (s.includes('softbank') || s.includes('ソフトバンク')) return 'softbank'
  if (s.includes('docomo') || s.includes('ドコモ')) return 'docomo'
  if (s.includes('sim') || s.includes('simフリー') || s.includes('simフリ')) return 'simfree'
  if (s.includes('楽天') || s.includes('rakuten')) return 'rakuten'
  return ''
}

// 検索結果HTMLの中で、リンクの近傍(±300文字)に出現する語からキャリアを推定
function carrierFromContext(html: string, idx: number): CarrierSlug {
  const start = Math.max(0, idx - 300)
  const end = Math.min(html.length, idx + 300)
  const ctx = html.slice(start, end).toLowerCase()
  if (ctx.match(/softbank|ソフトバンク/)) return 'softbank'
  if (ctx.match(/docomo|ドコモ/)) return 'docomo'
  if (ctx.match(/\bau\b|kddi/)) return 'au'
  if (ctx.match(/sim\s*free|simフリー|simフリ/)) return 'simfree'
  if (ctx.match(/rakuten|楽天/)) return 'rakuten'
  return ''
}

export async function POST(req: NextRequest) {
  try {
    const { modelPrefix, carrier } = await req.json()
    if (!modelPrefix || typeof modelPrefix !== 'string') {
      return NextResponse.json({ ok: false, error: 'modelPrefix is required' }, { status: 400 })
    }
    const targetCarrier = toCarrierSlug(carrier)

    // 1) 先頭5桁で検索（例：MWC62 J/A -> MWC62）
    const searchUrl = `${BASE}/search/?search-word=${encodeURIComponent(modelPrefix)}`
    const res = await fetch(searchUrl, {
      headers: {
        // 軽い対策（サーバ側でbot弾きされにくく）
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
        'Accept-Language': 'ja,en;q=0.9',
      },
      // タイムアウト対策はVercelのエッジ/地域に依存、ここでは標準fetch
      cache: 'no-store',
    })
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: `HTTP ${res.status} ${res.statusText}`, searchUrl },
        { status: 502 },
      )
    }
    const html = await res.text()

    // 2) 検索結果内の詳細ページリンクを収集
    //   例: /kaitori/detail/xxxxxxxx
    const linkMatches = [...html.matchAll(/href="(\/kaitori\/detail\/[^"]+)"/g)]
    const links = linkMatches.map(m => {
      const href = m[1]
      const index = (m as any).index as number | undefined
      return { href, index: typeof index === 'number' ? index : html.indexOf(href) }
    })

    // 3) 近傍テキストからキャリアを推定し、ターゲットと一致する最初のリンクを選択
    let firstLinkAbs: string | null = null
    let matchedLinkAbs: string | null = null

    for (const item of links) {
      const abs = `${BASE}${item.href}`
      if (!firstLinkAbs) firstLinkAbs = abs
      const found = carrierFromContext(html, item.index)
      if (targetCarrier && found === targetCarrier) {
        matchedLinkAbs = abs
        break
      }
    }

    return NextResponse.json({
      ok: true,
      modelPrefix,
      carrierSlug: targetCarrier,
      searchUrl,                     // まず一覧
      firstLink: matchedLinkAbs || firstLinkAbs || null, // 一致があればそれを、なければ先頭
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'unknown' }, { status: 500 })
  }
}
