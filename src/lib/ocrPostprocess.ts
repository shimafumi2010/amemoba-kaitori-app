export type OcrResult = {
  model_name?: string
  capacity?: string
  color?: string
  model_number?: string
  imei?: string
  serial?: string
  battery?: string
}

/* ---------- IMEI: Luhn 15桁チェック ---------- */
function luhnCheck15(imei: string): boolean {
  if (!/^\d{15}$/.test(imei)) return false
  let sum = 0
  for (let i = 0; i < 15; i++) {
    let d = parseInt(imei[i], 10)
    if (i % 2 === 1) { // 0始まり偶数位置（人間の偶数桁）が倍
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
  }
  return sum % 10 === 0
}

/** 可能なら15桁でLuhn OKのものを返す。警告メッセージも付与 */
export function normalizeIMEI(raw?: string): { value: string; valid: boolean; warning?: string } {
  const digits = (raw || '').replace(/\D/g, '')
  if (!digits) return { value: '', valid: false, warning: 'IMEIが取得できませんでした。' }

  // ちょうど15桁
  if (digits.length === 15) {
    const ok = luhnCheck15(digits)
    return { value: digits, valid: ok, warning: ok ? undefined : 'IMEI(15桁)のLuhn検証に失敗しました。' }
  }

  // 15桁より長い → 妥当な15桁の連続部分を探す
  if (digits.length > 15) {
    for (let i = 0; i <= digits.length - 15; i++) {
      const cand = digits.slice(i, i + 15)
      if (luhnCheck15(cand)) {
        return { value: cand, valid: true } // ベスト候補
      }
    }
    // 見つからない場合、先頭15桁を返しつつ警告
    return {
      value: digits.slice(0, 15),
      valid: false,
      warning: `IMEIが15桁超です（${digits.length}桁）。Luhn適合の連続15桁を見つけられませんでした。`
    }
  }

  // 15桁未満
  return {
    value: digits,
    valid: false,
    warning: `IMEIが短いです（${digits.length}桁）。15桁必要です。`
  }
}

/* ---------- Serial: 12桁英数字・安全置換＋長さ警告 ---------- */
export function normalizeSerial(raw?: string): { value: string; warning?: string } {
  let s = (raw || '')
    .toUpperCase()
    .replace(/Ｏ/g, 'O').replace(/Ｉ/g, 'I') // 全角→半角
    .replace(/０/g, '0').replace(/１/g, '1')
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9]/g, '')

  // 安全置換（O→0, I→1）。Zは据え置き（2と取り違え防止）
  s = s.replace(/O/g, '0').replace(/I/g, '1')

  const warns: string[] = []
  if (s.length !== 12) {
    warns.push(`シリアルは12桁ですが、現在${s.length}桁です。`)
  }

  // Z↔2の曖昧さ検知：ほぼ数字列にZが混じるケースを警告
  const looksNumericWithZ = s.includes('Z') && s.replace(/Z/g, '2').replace(/[A-Y]/g, '').length >= Math.max(1, s.length - 2)
  if (looksNumericWithZ) {
    warns.push('シリアル内に「Z」があります。2との誤認の可能性があるため目視確認してください。')
  }

  return { value: s, warning: warns.length ? warns.join(' ') : undefined }
}

/* ---------- その他の正規化 ---------- */
export function normalizeCapacity(raw?: string): string | undefined {
  if (!raw) return undefined
  const cap = raw.replace(/\s+/g, '').replace(/ＴＢ/gi, 'TB').replace(/ＧＢ/gi, 'GB')
  const m = cap.match(/^(\d+(?:\.\d+)?)(GB|TB)$/i) || cap.match(/^(\d+(?:\.\d+)?)/)
  if (!m) return cap
  const num = m[1]
  const unit = (m[2] || 'GB').toUpperCase()
  return `${num}${unit}`
}

export function normalizeBattery(raw?: string): string | undefined {
  if (!raw) return undefined
  const m = raw.match(/(\d{2,3})\s*%?/)
  return m ? `${m[1]}%` : undefined
}

export function normalizeModelNumber(raw?: string): string | undefined {
  if (!raw) return undefined
  return raw
    .replace(/[Ａ-Ｚａ-ｚ０-９／]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/\s+/g, '')
}

/* ---------- 総合ポストプロセス ---------- */
export function postprocessOcr(input: OcrResult): { data: OcrResult; warnings: string[] } {
  const warnings: string[] = []

  const imeiN = normalizeIMEI(input.imei)
  if (imeiN.warning) warnings.push(imeiN.warning)

  const serialN = normalizeSerial(input.serial)
  if (serialN.warning) warnings.push(serialN.warning)

  const out: OcrResult = {
    model_name: input.model_name || undefined,
    capacity: normalizeCapacity(input.capacity),
    color: input.color || undefined,
    model_number: normalizeModelNumber(input.model_number),
    imei: imeiN.value || undefined,          // 15桁以外は警告済み
    serial: serialN.value || undefined,      // 12桁以外は警告済み
    battery: normalizeBattery(input.battery),
  }

  return { data: out, warnings }
}
