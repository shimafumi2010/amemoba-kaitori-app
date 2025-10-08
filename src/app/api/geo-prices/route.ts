import { NextResponse } from 'next/server'
import * as cheerio from 'cheerio'

function toNumber(maybe: string | undefined | null) {
  if (!maybe) return undefined
  const n = Number(String(maybe).replace(/[^\d]/g, ''))
  return Number.isFinite(n) ? n : undefined
}

async function fetchText(url: string) {
  const res = await fetch(url, {
    cache: 'no-store',
    headers: {
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
      'accept-language': 'ja,en;q=0.8',
    },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
  return await res.text()
}

/**
 * できるだけ壊れにくいパーサ
 * - まず cheerio でカードを推定抽出
 * - それでダメな場合に備え、「買取カートに追加」でブロック分割して正規表現で補完
 */
export async function POST(req: Request) {
  try {
    const { query } = (await req.json()) as { query?: string }
    const raw = (query || '').trim()
    if (!raw) return NextResponse.json({ ok: false, error: 'query is required' }, { status: 400 })

    const key = raw.split(/\s+/)[0]
    const url = `https://buymobile.geo-online.co.jp/mitsumori/?search1=${encodeURIComponent(key)}&submit=`
    const html = await fetchText(url)
    const $ = cheerio.load(html)

    type Row = {
      title: string
      url?: string
      carrier?: 'docomo'|'au'|'softbank'|'simfree'
      unused?: number // 未使用
      used?: number   // 中古
    }

    const rows: Row[] = []

    // --- 1) セマンティックに拾う（カード・リストを推定） ---
    $('a, article, li, div').each((_, el) => {
      const $el = $(el)
      const text = $el.text().replace(/\s+/g, ' ').trim()
      if (!text) return

      // 候補: 「未使用」「中古」が同居しているブロック
      if (!/未使用|中古/.test(text)) return

      // 直近のリンクとタイトルらしきテキスト
      let href = $el.find('a[href]').first().attr('href') || $el.attr('href') || ''
      let title = $el.find('a').first().text().trim() || text.slice(0, 120)

      if (!title || title.length < 6) return

      if (href.startsWith('/')) href = `https://buymobile.geo-online.co.jp${href}`
      if (href && !/^https?:\/\//.test(href)) href = `https://buymobile.geo-online.co.jp${href}`

      const mNew = text.match(/未使用[^0-9]*([\d,]+)\s*円/)
      const mUsed = text.match(/中古[^0-9]*([\d,]+)\s*円/)

      if (!mNew && !mUsed) return

      const lower = title.toLowerCase()
      let carrier: Row['carrier']
      if (lower.includes('docomo')) carrier = 'docomo'
      else if (lower.includes('softbank') || lower.includes('y!')) carrier = 'softbank'
      else if (/\bau\b/.test(lower)) carrier = 'au'
      else if (title.includes('SIMフリー')) carrier = 'simfree'

      rows.push({
        title,
        url: href || undefined,
        carrier,
        unused: toNumber(mNew?.[1]),
        used: toNumber(mUsed?.[1]),
      })
    })

    // --- 2) 保険: 「買取カートに追加」で分割して正規表現抽出 ---
    if (rows.length === 0) {
      const blocks = html.split('買取カートに追加')
      for (const b of blocks) {
        const $b = cheerio.load(b)
        const lastA = $b('a[href]').last()
        let href = lastA.attr('href') || ''
        let title = lastA.text().trim()
        if (!title) {
          // タイトルらしきものが無ければ b 全文からそれっぽいテキストを拾う
          const t = $b.text().replace(/\s+/g, ' ').trim()
          title = t.slice(0, 120)
        }
        if (href.startsWith('/')) href = `https://buymobile.geo-online.co.jp${href}`

        const text = $b.text()
        const mNew = text.match(/未使用[^0-9]*([\d,]+)\s*円/)
        const mUsed = text.match(/中古[^0-9]*([\d,]+)\s*円/)

        if (!mNew && !mUsed) continue

        const lower = title.toLowerCase()
        let carrier: Row['carrier']
        if (lower.includes('docomo')) carrier = 'docomo'
        else if (lower.includes('softbank') || lower.includes('y!')) carrier = 'softbank'
        else if (/\bau\b/.test(lower)) carrier = 'au'
        else if (title.includes('SIMフリー')) carrier = 'simfree'

        rows.push({
          title,
          url: href || undefined,
          carrier,
          unused: toNumber(mNew?.[1]),
          used: toNumber(mUsed?.[1]),
        })
      }
    }

    // 重複URLでユニーク化
    const seen = new Set<string>()
    const unique = rows.filter((r) => {
      const key = (r.url || r.title) + '|' + (r.carrier || '')
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    return NextResponse.json({
      ok: true,
      query: key,
      searchUrl: url,
      results: unique,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'unknown' }, { status: 500 })
  }
}
