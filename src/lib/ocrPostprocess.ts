export type OcrResult = {
  model_name?: string
  capacity?: string
  color?: string
  model_number?: string
  imei?: string
  serial?: string
  battery?: string
  // 追加: モデルから拾わせた候補群
  imei_candidates?: string[]
  serial_candidates?: string[]
}

/* ---------------- IMEI ユーティリティ ---------------- */

function onlyDigits(s: string): string {
  return (s || '').replace(/\D/g, '')
}

function luhn15(imei: string): boolean {
  if (!/^\d{15}$/.test(imei)) return false
  let sum = 0
  for (let i = 0; i < 15; i++) {
    let d = parseInt(imei[i], 10)
    if (i % 2 === 1) { // 0始まりの奇数位置を2倍
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
  }
  return sum % 10 === 0
}

// 候補の中から Luhn OK の15桁を最優先で採用
function selectIMEI(raw?: string, cands?: string[]): { value: string; warning?: string } {
  const list = Array.from(new Set([
    ...(cands || []).map(onlyDigits),
    onlyDigits(raw || '')
  ])).filter(Boolean)

  // 完全一致候補（15桁&Luhn OK に限定）
  for (const cand of list) {
    if (cand.length === 15 && luhn15(cand)) return { value: cand }
  }

  // 次点：15桁（Luhn NG）→ 警告付きで返す
  for (const cand of list) {
    if (cand.length === 15) return { value: cand, warning: 'IMEIは15桁だがLuhn検証で不一致。再確認を推奨。' }
  }

  // 次点：最長の数字列（14〜17桁）を返す
  const sorted = list.sort((a, b) => b.length - a.length)
  const best = sorted[0] || ''
  if (!best) return { value: '', warning: 'IMEIを抽出できませんでした。' }
  return { value: best, warning: `IMEIが15桁ではありません（${best.length}桁）。再確認してください。` }
}

/* ---------------- Serial ユーティリティ ---------------- */

// 互換グループ（誤認されやすい文字を同一視）
const EQUIV_GROUPS = [
  new Set(['0','O']),
  new Set(['1','I','L']),
  new Set(['5','S']),
  new Set(['2','Z'])
]
function equivCost(a: string, b: string): number {
  if (a === b) return 0
  for (const g of EQUIV_GROUPS) if (g.has(a) && g.has(b)) return 0.1 // ほぼ同じ扱い
  return 1
}

// 12桁を最優先、次に11/13桁…で「equiv 距離」が最小のものを採用
function selectSerial(raw?: string, cands?: string[]): { value: string; warning?: string } {
  const R = (raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  const list = Array.from(new Set([...(cands || []), R]))
    .map(s => s.toUpperCase().replace(/[^A-Z0-9]/g, ''))
    .filter(Boolean)

  if (!list.length) return { value: '', warning: 'シリアルを抽出できませんでした。' }

  const score = (cand: string): number => {
    // 長さ優先（12桁最優先 → それ以外はペナルティ）
    const lenPenalty = cand.length === 12 ? 0 : Math.abs(cand.length - 12) * 1.5
    // R が空なら長さだけで評価
    if (!R) return lenPenalty

    const A = R.split('')
    const B = cand.split('')
    const n = Math.min(A.length, B.length)
    let dist = 0
    for (let i = 0; i < n; i++) dist += equivCost(A[i], B[i])
    dist += Math.abs(A.length - B.length) // 長さ差も距離へ
    return lenPenalty + dist
  }

  const sorted = list.slice().sort((a, b) => score(a) - score(b))
  const best = sorted[0]
  const warn = best.length !== 12 ? `シリアルは12桁ですが、${best.length}桁が抽出されました。` : undefined
  return { value: best, warning: warn }
}

/* ---------------- その他 正規化 ---------------- */

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

/* ---------------- 総合ポストプロセス ---------------- */

export function postprocessOcr(input: OcrResult): { data: OcrResult; warnings: string[] } {
  const warnings: string[] = []

  const imeiSel = selectIMEI(input.imei, input.imei_candidates)
  if (imeiSel.warning) warnings.push(imeiSel.warning)

  const serialSel = selectSerial(input.serial, input.serial_candidates)
  if (serialSel.warning) warnings.push(serialSel.warning)

  const out: OcrResult = {
    model_name: input.model_name || undefined,
    capacity: normalizeCapacity(input.capacity),
    color: input.color || undefined,
    model_number: normalizeModelNumber(input.model_number),
    imei: imeiSel.value || undefined,
    serial: serialSel.value || undefined,
    battery: normalizeBattery(input.battery),
  }

  return { data: out, warnings }
}
