
import * as cheerio from 'cheerio'

export async function fetchAmemobaPriceByQuery(query: string): Promise<number | null> {
  const url = `https://amemoba.com/?s=${encodeURIComponent(query)}`
  const res = await fetch(url, { cache: 'no-store' })
  const html = await res.text()
  const $ = cheerio.load(html)

  // NOTE: サイトの構造次第で調整が必要です。ここでは簡易的に最初の .price を取得します。
  const priceText = $('span.price').first().text() || $('bdi').first().text()
  const m = priceText.match(/([0-9,]+)/)
  return m ? parseInt(m[1].replace(/,/g, '')) : null
}
