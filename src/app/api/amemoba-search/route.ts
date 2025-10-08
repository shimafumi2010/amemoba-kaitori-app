import { NextResponse } from 'next/server'
import * as cheerio from 'cheerio'

// 取得ヘルパ
async function fetchText(url: string): Promise<string> {
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

export async function POST(req: Request) {
  try {
    const { query } = (await req.json()) as { query?: string }
    const raw = (query || '').trim()
    if (!raw) return NextResponse.json({ ok: false, error: 'query is required' }, { status: 400 })

    const key = raw.split(/\s+/)[0] // 半角スペース前（MLJH3 J/A → MLJH3）
    const searchUrl = `https://amemoba.com/search/?search-word=${encodeURIComponent(key)}`
    const html = await fetchText(searchUrl)
    const $ = cheerio.load(html)

    // 柔軟に拾う：検索リストの a 要素のうち、見出し/行タイトルっぽいものを抽出
    // タイトルに「docomo」「au」「SoftBank」「SIMフリー」などが含まれるケースを想定
    const anchors: Array<{ title: string; url: string; carrier?: string }> = []

    $('a').each((_, el) => {
      const a = $(el)
      let href = a.attr('href') || ''
      const text = a.text().trim()
      if (!href || !text) return

      // 検索結果の行は product っぽいが、URL構造が変わる可能性もあるので緩くフィルタ
      const looksLikeResult =
        /product|iphone|ipad|mac|minipc|android|amemoba|\/[a-z0-9\-]+/i.test(href) &&
        text.length >= 6

      if (!looksLikeResult) return

      // 絶対URL化
      if (href.startsWith('/')) href = `https://amemoba.com${href}`

      const lower = text.toLowerCase()
      let carrier: string | undefined
      if (lower.includes('docomo')) carrier = 'docomo'
      else if (lower.includes('softbank')) carrier = 'softbank'
      else if (lower.includes(' au ') || lower.startsWith('au ') || lower.includes(' au　') || text.includes(' au')) carrier = 'au'
      else if (text.includes('SIMフリー')) carrier = 'simfree'

      // それっぽい行のみ残す（カテゴリリンクなどは除外したい）
      if (carrier) {
        anchors.push({ title: text, url: href, carrier })
      }
    })

    // 重複排除（同じURLを1件に）
    const seen = new Set<string>()
    const results = anchors.filter((x) => {
      if (seen.has(x.url)) return false
      seen.add(x.url)
      return true
    })

    return NextResponse.json({ ok: true, key, searchUrl, results })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'unknown' }, { status: 500 })
  }
}
