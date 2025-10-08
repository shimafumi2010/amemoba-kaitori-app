import * as cheerio from 'cheerio'

// 価格の「数字だけ」を取り出す
function pickPriceNumber(text?: string | null): number | null {
  if (!text) return null
  const m = text.replace(/[,\s円¥￥]/g, '').match(/(\d{3,7})/)
  return m ? parseInt(m[1], 10) : null
}

export type AmemobaPrice = {
  price: number | null
  url?: string
  title?: string
  matchedText?: string
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    // キャッシュせず都度取得
    cache: 'no-store',
    headers: {
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'accept-language': 'ja,en;q=0.8',
    },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
  return await res.text()
}

/**
 * アメモバのサイト検索から「最大買取価格（サイト上の金額）」っぽい値を抽出
 * - /?s= クエリの最上位ヒットのカード or 商品詳細の価格領域をパース
 * - 取れなければページ全体から金額っぽい最初の数値を拾う
 */
export async function fetchAmemobaPriceByQuery(query: string): Promise<AmemobaPrice> {
  const searchUrl = `https://amemoba.com/?s=${encodeURIComponent(query)}`
  const html = await fetchText(searchUrl)
  let $ = cheerio.load(html)

  // 1) 検索結果（カード一覧）から最初のカードの価格を拾う
  const firstCard = $('.products .product, ul.products li.product').first()
  if (firstCard.length) {
    const priceText =
      firstCard.find('.price').first().text() ||
      firstCard.find('bdi').first().text() ||
      firstCard.text()
    const price = pickPriceNumber(priceText)

    // 可能ならカードのリンク先へ（詳細ページも確認して上書き）
    const href = firstCard.find('a').attr('href')
    const title = firstCard.find('.woocommerce-loop-product__title, h2, h3').first().text().trim()

    if (href) {
      try {
        const pdHtml = await fetchText(href)
        const $$ = cheerio.load(pdHtml)
        const pdPriceText =
          $$('p.price').first().text() ||
          $$('span.price').first().text() ||
          $$('bdi').first().text()
        const pdPrice = pickPriceNumber(pdPriceText)
        if (pdPrice) {
          return { price: pdPrice, url: href, title: title || $$('h1').first().text().trim(), matchedText: pdPriceText.trim() }
        }
      } catch {
        /* 検索結果から取れた値だけ返す */
      }
    }

    if (price) {
      return { price, url: href || searchUrl, title: title || query, matchedText: priceText.trim() }
    }
  }

  // 2) 詳細ページに直接飛んだ（検索が1件ヒットなど）ケース
  const pdPriceText2 =
    $('p.price').first().text() ||
    $('span.price').first().text() ||
    $('bdi').first().text()
  const pdPrice2 = pickPriceNumber(pdPriceText2)
  if (pdPrice2) {
    const title = $('h1').first().text().trim() || $('title').text().trim()
    return { price: pdPrice2, url: searchUrl, title, matchedText: pdPriceText2.trim() }
  }

  // 3) どうしても見つからない場合はページ全体から数字を拾う（保険）
  const anyPrice = pickPriceNumber($('body').text())
  return { price: anyPrice, url: searchUrl, title: query }
}
