// 共通ユーティリティ：OCR後の文字列正規化・補正処理

export const onlyDigits = (s: string) => s.replace(/\D+/g, '')

export const luhnCheck = (num: string): boolean => {
  const arr = num.split('').map((d) => parseInt(d, 10))
  if (arr.length !== 15 || arr.some((n) => Number.isNaN(n))) return false
  let sum = 0
  for (let i = 0; i < 14; i++) {
    let n = arr[i]
    if (i % 2 === 1) {
      n = n * 2
      if (n > 9) n -= 9
    }
    sum += n
  }
  const checkDigit = (10 - (sum % 10)) % 10
  return checkDigit === arr[14]
}

// IMEI 正規化（OCR誤認補正込み）
export const normalizeIMEI = (raw: string): string | null => {
  const s = raw
    .replace(/[Oo]/g, '0')
    .replace(/[Il]/g, '1')
    .replace(/Z/g, '2')
    .replace(/S/g, '5')
    .replace(/B/g, '8')
  const digits = onlyDigits(s).slice(0, 15)
  return digits.length === 15 ? digits : null
}

// Apple Serial 正規化（12桁・軽微補正）
export const normalizeSerial = (raw: string): string => {
  let s = raw.trim().toUpperCase()
  s = s.replace(/O/g, '0').replace(/I/g, '1').replace(/Z(?![0-9])/g, '2')
  s = s.replace(/[^0-9A-Z]/g, '')
  return s.length >= 12 ? s.slice(0, 12) : s
}

// 候補配列から最適なIMEI/Serial/Modelを選択
export const pickBestImei = (cands?: string[]): string => {
  if (!cands || cands.length === 0) return ''
  for (const c of cands) {
    const n = normalizeIMEI(c)
    if (n && luhnCheck(n)) return n
  }
  for (const c of cands) {
    const d = onlyDigits(c)
    if (d.length === 15 && luhnCheck(d)) return d
  }
  for (const c of cands) {
    const d = onlyDigits(c)
    if (d.length === 15) return d
  }
  return ''
}

export const pickBestSerial = (cands?: string[]): string => {
  if (!cands || cands.length === 0) return ''
  for (const c of cands) {
    const s = normalizeSerial(c)
    if (s.length === 12) return s
  }
  let best = ''
  for (const c of cands) {
    const s = normalizeSerial(c)
    if (s.length > best.length) best = s
  }
  return best
}

export const pickBestModel = (cands?: string[]): string => {
  if (!cands || cands.length === 0) return ''
  const regex = /^[A-Z0-9]{5}$/
  const strong = cands.find((c) => regex.test(c.toUpperCase()))
  return (strong ?? cands[0]).toUpperCase()
}
