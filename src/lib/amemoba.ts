import * as cheerio from 'cheerio'

export type AmemobaSearchResult = {
  normalizedQuery: string
  results: Array<{ title: string; url: string; priceText?: string | null }>
}

/** 文字列から価格「っぽい」部分を拾って表示用に返す（数値化はしない） */
function pickPriceText(text?: string | null): string | null {
  if (!text) return null
  const m = text.match(/([¥￥]?\s?\d[\d,]{2,7})(?:\s*円)?/)
  return m ? m[1].replace(/\s/g, '') : null
}

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

/**
 * モデル番号の「前半（半角スペース前）」を使って amemoba 検索
 * 検索結果のカードから「タイトル／URL／（あれば）価格表示」を抽出して返す
 */
export async function searchAmemobaByModelPrefix(modelNumberOrName: string): Promise<AmemobaSearchResult> {
  const prefix = (modelNumberOrName || '').trim().split(/\s+/)[0] // 半角スペース前
  const q = prefix || modelNumberOrName.trim()
  const url = `https://amemoba.com/?s=${encodeURIComponent(q)}`
  const html = await fetchText(url)
  const $ = cheerio.load(html)

  const results: Array<{ title: string; url: string; priceText?: string | null }> = []

  // 一般的な WooCommerce の検索結果カードを取りにいく
  $('ul.products li.product').each((_, el) => {
    const a = $(el).find('a').first()
    const href = a.attr('href') || ''
    const title =
      $(el).find('.woocommerce-loop-product__title').first().text().trim() ||
      a.attr('title')?.trim() ||
      a.text().trim()

    const priceText =
      pickPriceText($(el).find('.price').first().text()) ||
      pickPriceText($(el).find('bdi').first().text())

    if (href && title) results.push({ title, url: href, priceText })
  })

  // もし何も拾えなかったら、ページの主要リンクを保険で少し拾う
  if (results.length === 0) {
    $('a').slice(0, 10).each((_, el) => {
      const href = $(el).attr('href') || ''
      const title = $(el).attr('title')?.trim() || $(el).text().trim()
      if (href && title && /product|item|shop|amemoba/.test(href)) {
        results.push({ title, url: href })
      }
    })
  }

  return { normalizedQuery: q, results }
}
