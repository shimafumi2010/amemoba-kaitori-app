export type OcrResult = {
  model_name?: string
  capacity?: string
  color?: string
  model_number?: string
  imei?: string
  serial?: string
  battery?: string
};

function luhnCheck15(imei: string): boolean {
  if (!/^\d{15}$/.test(imei)) return false;
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    let d = parseInt(imei[i], 10);
    if (i % 2 === 1) { // 偶数番目(0始まり)を2倍
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

export function normalizeIMEI(raw?: string): { value: string; valid: boolean } {
  const digits = (raw || '').replace(/\D/g, '');
  const value = digits.slice(0, 15);
  return { value, valid: luhnCheck15(value) };
}

// Apple Serial は英数字。O/Iは実物では使われない傾向が強いので安全に置換。
// Z は実際に使われ得るため置換しない（誤って 2 に変えるのを防ぐ）
export function normalizeSerial(raw?: string): { value: string; warning?: string } {
  let s = (raw || '')
    .toUpperCase()
    .replace(/Ｏ/g, 'O')
    .replace(/Ｉ/g, 'I')
    .replace(/０/g, '0')
    .replace(/１/g, '1')
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9]/g, '');

  // 安全置換（Z は触らない）
  s = s.replace(/O/g, '0').replace(/I/g, '1');

  // Z と 2 の曖昧さ検知：ほぼ数字列の中に Z が紛れ込んでいる
  const looksNumeric = s.replace(/Z/g, '2').replace(/[A-Y]/g, '').length >= Math.max(1, s.length - 2);
  const warning = (s.includes('Z') && looksNumeric)
    ? 'Serial内に「Z」があります。2と誤認の可能性があるため目視確認してください。'
    : undefined;

  return { value: s, warning };
}

export function normalizeCapacity(raw?: string): string | undefined {
  if (!raw) return undefined;
  const cap = raw.replace(/\s+/g, '').replace(/ＴＢ/gi, 'TB').replace(/ＧＢ/gi, 'GB');
  const m = cap.match(/^(\d+(?:\.\d+)?)(GB|TB)$/i) || cap.match(/^(\d+(?:\.\d+)?)/);
  if (!m) return cap;
  const num = m[1];
  const unit = (m[2] || 'GB').toUpperCase();
  return `${num}${unit}`;
}

export function normalizeBattery(raw?: string): string | undefined {
  if (!raw) return undefined;
  const m = raw.match(/(\d{2,3})\s*%?/);
  return m ? `${m[1]}%` : undefined;
}

export function normalizeModelNumber(raw?: string): string | undefined {
  if (!raw) return undefined;
  return raw
    .replace(/[Ａ-Ｚａ-ｚ０-９／]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
    .replace(/\s+/g, '');
}

// OCR結果をまとめて正規化
export function postprocessOcr(input: OcrResult): { data: OcrResult; warnings: string[] } {
  const warnings: string[] = [];
  const { value: imei, valid } = normalizeIMEI(input.imei);
  if (!valid && imei) warnings.push('IMEIの校正に失敗（Luhn NG）。画像再確認を推奨します。');

  const serialNorm = normalizeSerial(input.serial);
  if (serialNorm.warning) warnings.push(serialNorm.warning);

  const out: OcrResult = {
    model_name: input.model_name || undefined,
    capacity: normalizeCapacity(input.capacity),
    color: input.color || undefined,
    model_number: normalizeModelNumber(input.model_number),
    imei: imei || undefined,
    serial: serialNorm.value || undefined,
    battery: normalizeBattery(input.battery),
  };
  return { data: out, warnings };
}
