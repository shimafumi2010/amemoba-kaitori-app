// src/lib/ocrPostprocess.ts

/** 数字のみ抽出 */
function digitsOnly(s: string) {
  return (s || '').replace(/\D+/g, '')
}

/** IMEI: Luhn 15桁チェック */
function luhn15(imei: string) {
  if (!/^\d{15}$/.test(imei)) return false
  let sum = 0
  for (let i = 0; i < 14; i++) {
    let n = Number(imei[i])
    if (i % 2 === 1) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
  }
  const cd = (10 - (sum % 10)) % 10
  return cd === Number(imei[14])
}

/** OCR/テキスト誤認を補正 → 15桁化 → Luhn */
export function normalizeIMEI(raw?: string | null): string | '' {
  if (!raw) return ''
  const fixed = raw
    .replace(/[Oo]/g, '0')
    .replace(/[Il]/g, '1')
    .replace(/Z/g, '2')
    .replace(/S/g, '5')
    .replace(/B/g, '8')
  const d = digitsOnly(fixed)
  if (d.length === 15 && luhn15(d)) return d
  if (d.length === 15) return d
  return ''
}

/** Apple Serial: 12桁英数を想定、O↔0 / I↔1 / Z↔2 を軽補正 */
export function normalizeSerial(raw?: string | null): string | '' {
  if (!raw) return ''
  let s = raw.trim().toUpperCase()
  s = s
    .replace(/O/g, '0')
    .replace(/I/g, '1')
    .replace(/Z/g, '2')
    .replace(/[^0-9A-Z]/g, '')
  if (s.length >= 12) return s.slice(0, 12)
  return s
}
