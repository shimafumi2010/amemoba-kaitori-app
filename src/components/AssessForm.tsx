// src/components/AssessForm.tsx
'use client'
import React from 'react'

type BBox = { x: number; y: number; w: number; h: number }
type BBoxMap = Record<string, BBox[]>
type OcrFields = {
  imeiCandidates?: string[]
  serialCandidates?: string[]
  modelCandidates?: string[]
  batteryPercent?: number | null
}

const STAFFS = ['島野文宏', '島野ひとみ', '中田颯', '（その他）'] as const
const CARRIERS = ['docomo', 'au', 'SoftBank', '楽天モバイル', 'SIMフリー'] as const
const CONDITIONS = ['S（新品未使用）', 'A（新品同等/交換未使用）', 'B（良品）', 'C（並品）', 'D（傷多め）', 'ジャンク'] as const
const RESTRICTS = ['○', '△', '×', '-'] as const
const ACCESSORIES = ['箱', 'ケーブル', 'アダプタ', 'イヤホン', 'SIMピン', '説明書'] as const

export default function AssessForm() {
  // --- OCR / 画像関連 ---
  const [imageBase64, setImageBase64] = React.useState<string | null>(null)
  const [bboxMap, setBboxMap] = React.useState<BBoxMap>({})
  const [isExtracting, setIsExtracting] = React.useState(false)
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null)

  // --- 基本情報 ---
  const [staff, setStaff] = React.useState<string>(STAFFS[0])
  const [receivedAt, setReceivedAt] = React.useState<string>(() => {
    const dt = new Date()
    const yyyy = dt.getFullYear()
    const mm = String(dt.getMonth() + 1).padStart(2, '0')
    const dd = String(dt.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  })
  const [customerName, setCustomerName] = React.useState<string>('')
  const [customerPhone, setCustomerPhone] = React.useState<string>('')

  // --- 端末情報 ---
  const [carrier, setCarrier] = React.useState<string>(CARRIERS[0])
  const [model, setModel] = React.useState<string>('') // 例：MLJH3 J/A → MLJH3
  const [imei, setImei] = React.useState<string>('')
  const [serial, setSerial] = React.useState<string>('')
  const [batteryPct, setBatteryPct] = React.useState<string>('') // 数字文字列
  const [restrict, setRestrict] = React.useState<string>(RESTRICTS[3]) // -
  const [warrantyNote, setWarrantyNote] = React.useState<string>('') // Apple保証等
  const [condition, setCondition] = React.useState<string>(CONDITIONS[2])
  const [accessories, setAccessories] = React.useState<string[]>([])
  const [notes, setNotes] = React.useState<string>('')

  // --- 価格情報（取得結果の参照リンク等） ---
  const [amemobaUrl, setAmemobaUrl] = React.useState<string | null>(null)
  const [amemobaFirst, setAmemobaFirst] = React.useState<string | null>(null)
  const [geoUrl, setGeoUrl] = React.useState<string | null>(null)
  const [geoUnused, setGeoUnused] = React.useState<string | null>(null)
  const [geoUsed, setGeoUsed] = React.useState<string | null>(null)

  // --- 社内査定金額 ---
  const [offerPrice, setOfferPrice] = React.useState<string>('') // 提示額
  const [maxPrice, setMaxPrice] = React.useState<string>('') // 目安 MAX
  const [deductions, setDeductions] = React.useState<string>('') // 減額理由サマリ

  // --- クリップボード / ウィンドウ操作可能か ---
  const canClipboard = typeof navigator !== 'undefined' && !!navigator.clipboard?.writeText
  const canOpen = typeof window !== 'undefined' && !!window.open

  // 画像ペースト
  React.useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (const it of items) {
        if (it.type.indexOf('image') !== -1) {
          const file = it.getAsFile()
          if (!file) continue
          const reader = new FileReader()
          reader.onload = () => {
            setImageBase64(reader.result as string)
            setErrorMsg(null)
          }
          reader.readAsDataURL(file)
          break
        }
      }
    }
    window.addEventListener('paste', onPaste as any)
    return () => window.removeEventListener('paste', onPaste as any)
  }, [])

  // 共通 fetch（Timeout付き）
  async function safeJsonFetch(path: string, body: any, timeoutMs = 25000) {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      if (!res.ok) throw new Error(await res.text())
      return await res.json()
    } finally {
      clearTimeout(t)
    }
  }

  // OCR → 即反映
  const handleExtractAndPopulate = async () => {
    if (isExtracting) return
    setIsExtracting(true)
    setErrorMsg(null)
    try {
      if (!imageBase64) throw new Error('画像を貼り付けてください（Ctrl+V）。')
      const json = await safeJsonFetch('/api/ocr', { imageBase64, mode: 'extractInfo' }, 30000)
      if (!json?.ok) throw new Error(json?.error ?? 'OCRに失敗しました。')
      const fields: OcrFields = json.fields ?? {}
      const bboxes: BBoxMap = json.bboxes ?? {}
      setBboxMap(bboxes)

      // 候補から即反映（必要に応じて手入力で修正可能）
      if (fields.imeiCandidates?.[0]) setImei(pickBestImei(fields.imeiCandidates))
      if (fields.serialCandidates?.[0]) setSerial(pickBestSerial(fields.serialCandidates))
      if (fields.modelCandidates?.[0]) setModel(pickBestModel(fields.modelCandidates))
      if (typeof fields.batteryPercent === 'number') setBatteryPct(String(fields.batteryPercent))
    } catch (e: any) {
      setErrorMsg(e?.message ?? '処理に失敗しました。')
    } finally {
      setIsExtracting(false)
    }
  }

  // モデルの前半（5文字・英数のみ）を抽出
  const modelPrefix = React.useMemo(() => {
    const five = (model || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5)
    return five.length === 5 ? five : ''
  }, [model])

  // Amemoba 検索
  const handleAmemobaSearch = async () => {
    if (!modelPrefix) return setErrorMsg('モデル番号の前半（例：MLJH3）を入力してください。')
    try {
      const resp = await safeJsonFetch('/api/amemoba-search', { modelPrefix, carrier }, 20000)
      if (!resp.ok) throw new Error(resp.error || '検索に失敗しました')
      setAmemobaUrl(resp.searchUrl || null)
      setAmemobaFirst(resp.firstLink || null)
      if (resp.firstLink && canOpen) window.open(resp.firstLink, '_blank', 'noopener,noreferrer')
    } catch (e: any) {
      setErrorMsg(e.message)
    }
  }

  // ゲオ価格取得
  const handleGeoPrices = async () => {
    if (!modelPrefix) return setErrorMsg('モデル番号の前半（例：MLJH3）を入力してください。')
    try {
      const resp = await safeJsonFetch('/api/geo-prices', { modelPrefix }, 20000)
      if (!resp.ok) throw new Error(resp.error || 'ゲオ価格取得に失敗しました')
      setGeoUrl(resp.geoUrl || null)
      setGeoUnused(resp.prices?.unused ?? null)
      setGeoUsed(resp.prices?.used ?? null)
    } catch (e: any) {
      setErrorMsg(e.message)
    }
  }

  // 利用制限/保証 ショートカット
  const openRestrictCheck = async () => {
    if (imei && canClipboard) await navigator.clipboard.writeText(imei)
    if (canOpen) window.open('https://snowyskies.jp/imeiChecking/', '_blank', 'noopener,noreferrer')
  }
  const openWarrantyCheck = async () => {
    if (serial && canClipboard) await navigator.clipboard.writeText(serial)
    if (canOpen) window.open('https://checkcoverage.apple.com/?locale=ja_JP', '_blank', 'noopener,noreferrer')
  }

  // Chatwork貼り付け用テンプレ
  const handleCopyChatwork = async () => {
    const lines = [
      '【査定受付】',
      `担当者: ${staff}`,
      `受付日: ${receivedAt}`,
      `お客様: ${customerName || '-'}  / TEL: ${customerPhone || '-'}`,
      `キャリア: ${carrier}  / モデル: ${model || '-'}  / IMEI: ${imei || '-'}  / Serial: ${serial || '-'}`,
      `バッテリー: ${batteryPct ? batteryPct + '%' : '-'}`,
      `状態: ${condition} / 利用制限: ${restrict} / 保証: ${warrantyNote || '-'}`,
      `付属品: ${accessories.length ? accessories.join(' / ') : '-'}`,
      `メモ: ${notes || '-'}`,
      `---`,
      `参考: Amemoba ${amemobaFirst || amemobaUrl || '-'} / GEO ${geoUrl || '-'}`,
      `GEO未使用: ${geoUnused || '-'} / GEO中古: ${geoUsed || '-'}`,
      `提示額: ${offerPrice || '-'} / MAX目安: ${maxPrice || '-'} / 減額理由: ${deductions || '-'}`,
    ]
    const text = lines.join('\n')
    if (canClipboard) {
      await navigator.clipboard.writeText(text)
      alert('Chatwork用の文面をコピーしました。')
    } else {
      console.log(text)
      alert('クリップボード未対応の環境です。コンソールに出力しました。')
    }
  }

  // OCR候補から最適化（簡易）
  function onlyDigits(s: string) { return s.replace(/\D+/g, '') }
  function luhnCheck(num: string): boolean {
    const arr = num.split('').map((d) => parseInt(d, 10))
    if (arr.length !== 15 || arr.some((n) => Number.isNaN(n))) return false
    let sum = 0
    for (let i = 0; i < 14; i++) {
      let n = arr[i]
      if (i % 2 === 1) { n = n * 2; if (n > 9) n = n - 9 }
      sum += n
    }
    const checkDigit = (10 - (sum % 10)) % 10
    return checkDigit === arr[14]
  }
  function normalizeIMEI(raw: string): string | null {
    const s = raw.replace(/[Oo]/g, '0').replace(/[Il]/g, '1').replace(/Z/g, '2').replace(/S/g, '5').replace(/B/g, '8')
    const digits = onlyDigits(s).slice(0, 15)
    return digits.length === 15 ? digits : null
  }
  function normalizeSerial(raw: string): string {
    let s = raw.trim().toUpperCase()
    s = s.replace(/O/g, '0').replace(/I/g, '1').replace(/Z(?![0-9])/g, '2')
    s = s.replace(/[^0-9A-Z]/g, '')
    return s.length >= 12 ? s.slice(0, 12) : s
  }
  function pickBestImei(cands?: string[]): string {
    if (!cands || cands.length === 0) return ''
    for (const c of cands) { const n = normalizeIMEI(c); if (n && luhnCheck(n)) return n }
    for (const c of cands) { const d = onlyDigits(c); if (d.length === 15 && luhnCheck(d)) return d }
    for (const c of cands) { const d = onlyDigits(c); if (d.length === 15) return d }
    return ''
  }
  function pickBestSerial(cands?: string[]): string {
    if (!cands || cands.length === 0) return ''
    for (const c of cands) { const s = normalizeSerial(c); if (s.length === 12) return s }
    let best = ''
    for (const c of cands) { const s = normalizeSerial(c); if (s.length > best.length) best = s }
    return best
  }
  function pickBestModel(cands?: string[]): string {
    if (!cands || cands.length === 0) return ''
    const regex = /^[A-Z0-9]{5}$/
    const strong = cands.find((c) => regex.test(c.toUpperCase()))
    return (strong ?? cands[0]).toUpperCase()
  }

  // 付属品トグル
  const toggleAccessory = (key: string) => {
    setAccessories((prev) =>
      prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* 操作ガイド */}
      <div className="rounded-lg border bg-white p-4">
        <div className="text-sm text-gray-600">
          画像は <b>Snipping Tool → Ctrl+V</b> で貼り付け → <b>機種情報取得・反映</b> を押下。
          取得後、必要に応じて手修正してください。
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className="rounded-md bg-black px-3 py-2 text-white disabled:opacity-60"
            onClick={handleExtractAndPopulate}
            disabled={isExtracting || !imageBase64}
          >
            {isExtracting ? '機種情報取得中…' : '機種情報取得・反映'}
          </button>
          <button
            className="rounded-md border px-3 py-2"
            onClick={openRestrictCheck}
            title="IMEIをコピーして利用制限確認サイトを開きます"
          >
            利用制限確認（IMEI→コピー）
          </button>
          <button
            className="rounded-md border px-3 py-2"
            onClick={openWarrantyCheck}
            title="SerialをコピーしてApple保証確認サイトを開きます"
          >
            保証状態確認（Serial→コピー）
          </button>
          <button
            className="rounded-md border px-3 py-2"
            onClick={handleCopyChatwork}
            title="Chatworkへ貼り付ける用のテンプレをコピー"
          >
            Chatworkテンプレをコピー
          </button>
        </div>
        {errorMsg && <div className="mt-3 text-sm text-red-600">{errorMsg}</div>}
      </div>

      {/* 基本情報 */}
      <section className="rounded-lg border bg-white p-4">
        <h3 className="mb-3 text-base font-semibold">基本情報</h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">担当者</span>
            <select className="rounded border p-2" value={staff} onChange={(e) => setStaff(e.target.value)}>
              {STAFFS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">受付日</span>
            <input type="date" className="rounded border p-2" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} />
          </label>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">お名前</span>
            <input className="rounded border p-2" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 md:col-span-2">
            <span className="text-xs text-gray-500">電話番号</span>
            <input className="rounded border p-2" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
          </label>
        </div>
      </section>

      {/* 端末情報 */}
      <section className="rounded-lg border bg白 p-4">
        <h3 className="mb-3 text-base font-semibold">端末情報</h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <label className="flex flex-col gap-1 md:col-span-1">
            <span className="text-xs text-gray-500">キャリア</span>
            <select className="rounded border p-2" value={carrier} onChange={(e) => setCarrier(e.target.value)}>
              {CARRIERS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 md:col-span-1">
            <span className="text-xs text-gray-500">モデル番号（前半）</span>
            <input className="rounded border p-2 uppercase" value={model} onChange={(e) => setModel(e.target.value)} placeholder="例: MLJH3" />
          </label>
          <label className="flex flex-col gap-1 md:col-span-1">
            <span className="text-xs text-gray-500">IMEI（15桁）</span>
            <input className="rounded border p-2" value={imei} onChange={(e) => setImei(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 md:col-span-1">
            <span className="text-xs text-gray-500">シリアル（12桁）</span>
            <input className="rounded border p-2" value={serial} onChange={(e) => setSerial(e.target.value)} />
          </label>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
          <label className="flex flex-col gap-1 md:col-span-1">
            <span className="text-xs text-gray-500">バッテリー（%）</span>
            <input className="rounded border p-2" value={batteryPct} onChange={(e) => setBatteryPct(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 md:col-span-1">
            <span className="text-xs text-gray-500">利用制限</span>
            <select className="rounded border p-2" value={restrict} onChange={(e) => setRestrict(e.target.value)}>
              {RESTRICTS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 md:col-span-2">
            <span className="text-xs text-gray-500">保証メモ（Apple保証など）</span>
            <input className="rounded border p-2" value={warrantyNote} onChange={(e) => setWarrantyNote(e.target.value)} />
          </label>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="flex flex-col gap-1 md:col-span-1">
            <span className="text-xs text-gray-500">状態</span>
            <select className="rounded border p-2" value={condition} onChange={(e) => setCondition(e.target.value)}>
              {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <div className="md:col-span-2">
            <div className="mb-1 text-xs text-gray-500">付属品</div>
            <div className="flex flex-wrap gap-2">
              {ACCESSORIES.map((a) => (
                <button
                  key={a}
                  type="button"
                  className={`rounded border px-2 py-1 text-sm ${accessories.includes(a) ? 'bg-black text-white' : 'bg-white'}`}
                  onClick={() => toggleAccessory(a)}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">特記事項</span>
            <textarea className="min-h-[80px] rounded border p-2" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
        </div>
      </section>

      {/* 参考価格ブロック */}
      <section className="rounded-lg border bg-white p-4">
        <h3 className="mb-3 text-base font-semibold">価格（参考）</h3>
        <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-3">
          <button className="rounded-md border px-3 py-2" onClick={handleAmemobaSearch} disabled={!modelPrefix}>
            amemoba価格検索（{modelPrefix || '―――'} / {carrier}）
          </button>
          <button className="rounded-md border px-3 py-2" onClick={handleGeoPrices} disabled={!modelPrefix}>
            ゲオ価格（{modelPrefix || '―――'}）
          </button>
          <div className="self-center text-sm text-gray-500">
            ※ amemoba は対象ページを開いて確認／ゲオは一覧から価格文字列抽出
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded border p-3">
            <div className="text-sm font-semibold">amemoba</div>
            <div className="mt-1 text-sm">
              検索URL: {amemobaUrl ? <a href={amemobaUrl} target="_blank" className="text-blue-600 underline">開く</a> : '-'}
            </div>
            <div className="mt-1 text-sm">
              推定リンク: {amemobaFirst ? <a href={amemobaFirst} target="_blank" className="text-blue-600 underline">詳細</a> : '-'}
            </div>
          </div>
          <div className="rounded border p-3">
            <div className="text-sm font-semibold">GEO（参考）</div>
            <div className="mt-1 text-sm">URL: {geoUrl ? <a href={geoUrl} target="_blank" className="text-blue-600 underline">開く</a> : '-'}</div>
            <div className="mt-1 text-sm">未使用: {geoUnused ?? '-'}</div>
            <div className="mt-1 text-sm">中古: {geoUsed ?? '-'}</div>
          </div>
        </div>
      </section>

      {/* 社内査定金額 */}
      <section className="rounded-lg border bg-white p-4">
        <h3 className="mb-3 text-base font-semibold">社内査定</h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">提示額（円）</span>
            <input className="rounded border p-2" value={offerPrice} onChange={(e) => setOfferPrice(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">MAX目安（円）</span>
            <input className="rounded border p-2" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 md:col-span-1">
            <span className="text-xs text-gray-500">減額理由（簡潔に）</span>
            <input className="rounded border p-2" value={deductions} onChange={(e) => setDeductions(e.target.value)} placeholder="バッテリー劣化/傷/付属品無し 等" />
          </label>
        </div>
      </section>

      {/* OCR bbox デバッグ / プレビュー（任意） */}
      {Object.keys(bboxMap).length > 0 && (
        <section className="rounded-lg border bg-white p-4">
          <h3 className="mb-3 text-base font-semibold">OCR 抽出領域（デバッグ）</h3>
          <details>
            <summary className="cursor-pointer text-sm">bboxes を表示</summary>
            <pre className="mt-2 max-h-64 overflow-auto rounded border bg-gray-50 p-2 text-xs">
              {JSON.stringify(bboxMap, null, 2)}
            </pre>
          </details>
        </section>
      )}
    </div>
  )
}
