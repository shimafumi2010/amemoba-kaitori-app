// src/components/AssessForm.tsx
'use client'
import React, { useState, useEffect } from 'react'
import { normalizeIMEI, normalizeSerial } from '../lib/ocrPostprocess'

const STAFFS = ['島野文宏', '島野ひとみ', '中田颯', '（その他）'] as const
const ACCESSORIES = ['有', '無', ''] as const
const LOCK_YN = ['無', '有', ''] as const
const CONDITIONS = [
  { code: 'S', label: 'S（新品未使用）' },
  { code: 'A', label: 'A（交換未使用品・新品同様品）' },
  { code: 'B', label: 'B（目立つ傷なく、使用感が少ない）' },
  { code: 'C', label: 'C（目に見える傷、使用感がある）' },
  { code: 'D', label: 'D（目立つ傷、使用感が多数ある）' },
  { code: 'ジャンク', label: 'ジャンク' },
] as const
const CARRIERS = ['SoftBank', 'au(KDDI)', 'docomo', '楽天モバイル', 'SIMフリー'] as const
const RESTRICTS = ['○', '△', '×', '-'] as const

type GeoRow = {
  title: string
  url?: string
  carrier?: string
  unused?: number
  used?: number
  unusedText?: string
  usedText?: string
}

type BBox = { x: number; y: number; w: number; h: number } | null

const section: React.CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, background: '#fff' }
const label: React.CSSProperties = { fontWeight: 600, fontSize: 13 }
const box: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8 }
const row2 = { display: 'grid', gridTemplateColumns: '160px 1fr', gap: 10, alignItems: 'center' } as const
const row4 = { display: 'grid', gridTemplateColumns: '160px 1fr 160px 1fr', gap: 10, alignItems: 'center' } as const

async function cropFromBase64ByBbox(imageBase64: string, bbox: { x: number; y: number; w: number; h: number }): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const sx = Math.max(0, Math.round(bbox.x * img.width))
      const sy = Math.max(0, Math.round(bbox.y * img.height))
      const sw = Math.max(1, Math.round(bbox.w * img.width))
      const sh = Math.max(1, Math.round(bbox.h * img.height))
      const out = document.createElement('canvas')
      out.width = sw
      out.height = sh
      const ctx = out.getContext('2d')!
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)
      resolve(out.toDataURL('image/png'))
    }
    img.onerror = () => resolve(null)
    img.src = imageBase64
  })
}

/** 画像を最大幅 1400px に縮小してから base64 返す（貼り付けサイズ最適化） */
async function downscaleBase64(dataUrl: string, maxW = 1400): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const scale = img.width > maxW ? maxW / img.width : 1
      if (scale >= 1) return resolve(dataUrl)
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')!
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/jpeg', 0.9))
    }
    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
  })
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = reject
    r.readAsDataURL(file)
  })
}

export default function AssessForm(): JSX.Element {
  // 受付
  const [staff, setStaff] = useState('島野ひとみ')
  const [acceptedAt, setAcceptedAt] = useState(() => new Date().toISOString().slice(0, 10))

  // お客様情報（今は手入力；将来フォーム連携）
  const [customerSelect, setCustomerSelect] = useState('（最新が先頭）')
  const [customer, setCustomer] = useState({ name: '', kana: '', address: '', phone: '', birth: '' })

  // 端末
  const [device, setDevice] = useState({
    model_name: '', capacity: '', color: '', model_number: '',
    imei: '', serial: '', battery: '', carrier: '', restrict: ''
  })

  // 付属品/ロック/状態
  const [acc, setAcc] = useState(''); const [simLock, setSimLock] = useState(''); const [actLock, setActLock] = useState('')
  const [condition, setCondition] = useState('B'); const [conditionNote, setConditionNote] = useState('')

  // 価格
  const [maxPrice, setMaxPrice] = useState<number | ''>(''); const [discount, setDiscount] = useState<number | ''>(''); const [todayPrice, setTodayPrice] = useState<number>(0)

  // 競合（ゲオ）
  const [geoLoading, setGeoLoading] = useState(false)
  const [geoError, setGeoError] = useState<string | null>(null)
  const [geoResult, setGeoResult] = useState<GeoRow | null>(null)
  const [geoSearchUrl, setGeoSearchUrl] = useState<string | null>(null)

  // 画像 / OCR
  const [imgBase64, setImgBase64] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [ocrLoading, setOcrLoading] = useState(false)
  const [cropLoading, setCropLoading] = useState(false)
  const [imeiCrop, setImeiCrop] = useState<string | null>(null)
  const [serialCrop, setSerialCrop] = useState<string | null>(null)
  const [imeiBBox, setImeiBBox] = useState<BBox>(null)
  const [serialBBox, setSerialBBox] = useState<BBox>(null)

  useEffect(() => {
    const max = typeof maxPrice === 'number' ? maxPrice : Number(maxPrice || 0)
    const disc = typeof discount === 'number' ? discount : Number(discount || 0)
    setTodayPrice(Math.max(0, max - disc))
  }, [maxPrice, discount])

  /** 貼り付け（Snipping Tool → Ctrl+V） */
  async function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    const items = e.clipboardData?.items
    if (!items) return
    for (const it of items) {
      if (it.type.startsWith('image/')) {
        const f = it.getAsFile()
        if (!f) continue
        const raw = await fileToBase64(f)
        const light = await downscaleBase64(raw, 1400)
        setImgBase64(light)
        setMessage('画像貼り付け完了。「機種情報取得・反映」で文字取得 → 「画像からIMEI/シリアルを切り抜き」で切り抜き実行')
        e.preventDefault()
        return
      }
    }
  }

  // AssessForm.tsx 内の runOCRInfo を以下で置き換え
async function runOCRInfo() {
  if (!imgBase64 || ocrLoading) return
  setOcrLoading(true)
  setMessage('機種情報取得中…')

  // バックオフ 0ms, 800ms, 1600ms, 3200ms（サーバが retryAfterSeconds を返したらそれを優先）
  const delays = [0, 800, 1600, 3200]

  try {
    for (let i = 0; i < delays.length; i++) {
      if (delays[i]) await new Promise(r => setTimeout(r, delays[i]))

      const res = await fetch('/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: imgBase64, mode: 'extractInfo' }),
      })

      const text = await res.text()
      let json: any = null
      try { json = JSON.parse(text) } catch {
        setMessage(`OCR失敗：応答がJSONではありません / ${text.slice(0, 140)}…`)
        return
      }

      // 429 → サーバからの指示に従って待機 → もう一度だけ即リトライ（次のループへ）
      if (res.status === 429 || json?.error === 'RATE_LIMIT') {
        const secs = Number(json?.retryAfterSeconds ?? 30)
        setMessage(`OCR待機中… レート制限（約 ${secs} 秒後に再試行）`)
        await new Promise(r => setTimeout(r, Math.max(1, secs) * 1000))
        // ここで次のループ継続（i を進める）。最後までいったら下で失敗表示。
        continue
      }

      if (!res.ok || json?.ok === false) {
        // 他のエラーは即時エラーメッセージ
        setMessage(`OCR失敗：${json?.error || `HTTP ${res.status} ${res.statusText}`}`)
        return
      }

      // ===== 成功：新API → 既存UI項目へマッピング =====
      const fields = json.fields ?? {}
      const bboxes = json.bboxes ?? {}

      setImeiBBox(bboxes?.imei?.[0] ?? bboxes?.IMEI?.[0] ?? null)
      setSerialBBox(bboxes?.serial?.[0] ?? bboxes?.Serial?.[0] ?? null)

      const imeiNorm = normalizeIMEI((fields.imeiCandidates?.[0] ?? '') as string) || ''
      const serialNorm = normalizeSerial((fields.serialCandidates?.[0] ?? '') as string) || ''
      const modelFront = (fields.modelCandidates?.[0] ?? '').toString()
      const batteryPct = typeof fields.batteryPercent === 'number' && Number.isFinite(fields.batteryPercent)
        ? `${Math.round(Math.max(0, Math.min(100, fields.batteryPercent)))}%`
        : ''

      setDevice(d => ({
        ...d,
        model_number: modelFront || d.model_number,
        imei: imeiNorm || d.imei,
        serial: serialNorm || d.serial,
        battery: batteryPct || d.battery,
      }))

      setMessage('OCR完了：必要項目を反映しました（切り抜きは別ボタンで実行）')
      return
    }

    // ここまで来たら、全リトライ枠を使い切った
    setMessage('OCR失敗：レート制限により再試行回数を超えました。しばらくしてから実行してください。')
  } catch (e: any) {
    setMessage(`OCR失敗：${e?.message ?? 'unknown error'}`)
  } finally {
    setOcrLoading(false)
  }
}


      // ===== 新APIフォーマットを旧UI項目へマッピング =====
      const fields = json?.fields ?? {}
      const bboxes = json?.bboxes ?? {}
      // bbox は保持だけ（切り抜きは別ボタンで）
      const imeiBox = (bboxes?.imei?.[0] ?? bboxes?.IMEI?.[0] ?? null)
      const serialBox = (bboxes?.serial?.[0] ?? bboxes?.Serial?.[0] ?? null)
      setImeiBBox(imeiBox)
      setSerialBBox(serialBox)

      const imeiNorm = normalizeIMEI((fields.imeiCandidates?.[0] ?? '') as string) || ''
      const serialNorm = normalizeSerial((fields.serialCandidates?.[0] ?? '') as string) || ''
      const modelFront = (fields.modelCandidates?.[0] ?? '').toString()
      const batteryPct = typeof fields.batteryPercent === 'number' && Number.isFinite(fields.batteryPercent)
        ? `${Math.round(Math.max(0, Math.min(100, fields.batteryPercent)))}%`
        : ''

      setDevice(d => ({
        ...d,
        model_name: d.model_name,                 // OCRは任意（必要なら上書き可）
        capacity: d.capacity,
        color: d.color,
        model_number: modelFront || d.model_number,
        imei: imeiNorm || d.imei,
        serial: serialNorm || d.serial,
        battery: batteryPct || d.battery,
      }))

      setMessage('OCR完了：必要項目を反映しました（切り抜きは別ボタンで実行）')
    } catch (e: any) {
      setMessage(`OCR失敗：${e?.message ?? 'unknown error'}`)
    } finally {
      setOcrLoading(false)
    }
  }

  /** 画像からIMEI/シリアルを切り抜き（bbox → crop） */
  async function runCrop() {
    if (!imgBase64) return setMessage('先に画像を貼り付けてください')
    if (!imeiBBox && !serialBBox) return setMessage('先に「機種情報取得・反映」を実行してbboxを取得してください')
    setCropLoading(true)
    setMessage('切り抜き実行中…')
    try {
      if (imeiBBox) {
        const url = await cropFromBase64ByBbox(imgBase64, imeiBBox as any)
        if (url) setImeiCrop(url)
      }
      if (serialBBox) {
        const url = await cropFromBase64ByBbox(imgBase64, serialBBox as any)
        if (url) setSerialCrop(url)
      }
      setMessage('切り抜き完了：右のプレビューで確認できます')
    } catch (e: any) {
      setMessage(`切り抜き失敗：${e?.message ?? 'unknown error'}`)
    } finally {
      setCropLoading(false)
    }
  }

  function getModelPrefix(): string {
    const raw = (device.model_number || device.model_name || '').trim()
    if (!raw) return ''
    return raw.split(/\s+/)[0]
  }

  /** amemoba 検索 — 新APIに合わせて送信＆オープン */
  async function openAmemobaForSelectedCarrier() {
    const key = getModelPrefix()
    if (!key) return alert('モデル番号 または 機種名を入力してください')
    if (!device.carrier) return alert('キャリアを選択してください')

    setMessage(`amemoba検索中…（${key} / ${device.carrier}）`)
    try {
      const res = await fetch('/api/amemoba-search', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelPrefix: key, carrier: device.carrier }),
      })
      const json = await res.json()
      if (!res.ok || json?.ok === false) {
        setMessage(`検索失敗: ${json?.error || `${res.status} ${res.statusText}`}`)
        const fallback = `https://amemoba.com/search/?search-word=${encodeURIComponent(key)}`
        window.open(fallback, '_blank', 'noopener,noreferrer'); return
      }
      const url = json.firstLink || json.searchUrl || `https://amemoba.com/search/?search-word=${encodeURIComponent(key)}`
      window.open(url, '_blank', 'noopener,noreferrer')
      setMessage('検索完了：amemoba 検索ページを開きました')
    } catch (e: any) {
      setMessage(`検索失敗: ${e?.message ?? 'unknown'}`)
      const url = `https://amemoba.com/search/?search-word=${encodeURIComponent(key)}`
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }

  /** GEO 価格取得 — 新APIに合わせて送信 */
  async function fetchGeo() {
    const key = getModelPrefix()
    setGeoError(null); setGeoResult(null); setGeoLoading(true)
    try {
      const res = await fetch('/api/geo-prices', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelPrefix: key }),
      })
      const text = await res.text()
      let json: any = null
      try { json = JSON.parse(text) } catch {
        setGeoError(`応答がJSONではありません: HTTP ${res.status} ${res.statusText} / ${text.slice(0, 140)}…`)
        setGeoLoading(false); return
      }
      setGeoSearchUrl(json?.geoUrl ?? null)
      if (!res.ok || json?.ok === false) {
        setGeoError(json?.error || `HTTP ${res.status} ${res.statusText}`)
        setGeoLoading(false); return
      }
      const row: GeoRow = {
        title: '検索結果',
        url: json?.geoUrl ?? undefined,
        carrier: undefined,
        unusedText: json?.prices?.unused ?? undefined,
        usedText: json?.prices?.used ?? undefined,
      }
      setGeoResult(row)
    } catch (e: any) {
      setGeoError(e?.message ?? 'unknown')
    } finally { setGeoLoading(false) }
  }

  async function copyAndOpen(text: string, url: string) {
    try { if (text) await navigator.clipboard.writeText(text) } catch {}
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div style={{ display: 'grid', gap: 16, padding: 16, maxWidth: 980, margin: '0 auto', background: '#f6f7fb' }}>
      <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, textAlign: 'center' }}>アメモバ買取 富山店　査定受付票</h2>

      {/* 受付 */}
      <div style={section}>
        <div style={row4}>
          <div style={label}>担当者</div>
          <select style={box as any} value={staff} onChange={(e) => setStaff(e.target.value)}>
            {STAFFS.map(s => (<option key={s} value={s}>{s}</option>))}
          </select>
          <div style={label}>受付日</div>
          <input style={box as any} type="date" value={acceptedAt} onChange={(e) => setAcceptedAt(e.target.value)} />
        </div>
      </div>

      {/* お客様情報 */}
      <div style={section}>
        <div style={row4}>
          <div style={label}>お客様選択</div>
          <select style={box as any} value={customerSelect} onChange={(e) => setCustomerSelect(e.target.value)}>
            <option>（最新が先頭）</option>
          </select>
          <div style={{ ...label }}>（ヒント）</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>フォーム連携は今後追加。手入力でもOKです。</div>
        </div>
        <div style={{ height: 8 }} />
        <div style={row2}><div style={label}>お名前</div><input style={box as any} value={customer.name} onChange={(e)=>setCustomer({...customer,name:e.target.value})}/></div>
        <div style={row2}><div style={label}>フリガナ</div><input style={box as any} value={customer.kana} onChange={(e)=>setCustomer({...customer,kana:e.target.value})}/></div>
        <div style={row2}><div style={label}>ご住所</div><input style={box as any} value={customer.address} onChange={(e)=>setCustomer({...customer,address:e.target.value})}/></div>
        <div style={row4}>
          <div style={label}>電話番号</div><input style={box as any} value={customer.phone} onChange={(e)=>setCustomer({...customer,phone:e.target.value})}/>
          <div style={label}>生年月日</div><input style={box as any} type="date" value={customer.birth} onChange={(e)=>setCustomer({...customer,birth:e.target.value})}/>
        </div>
      </div>

      {/* 3uTools：貼付け＆OCR */}
      <div style={section}>
        <div style={row2}>
          <div style={label}>3uTools画像</div>
          <div
            onPaste={handlePaste}
            style={{ border: '2px dashed #cbd5e1', borderRadius: 10, minHeight: 180, display: 'grid', placeItems: 'center',
                     color: '#6b7280', background: '#fafafa', textAlign: 'center', padding: 8 }}
            title="ここに Ctrl+V でスクショを貼り付け"
          >
            {imgBase64
              ? <img src={imgBase64} alt="pasted" style={{ maxWidth: '100%', maxHeight: 260, borderRadius: 8 }} />
              : <div>ここをクリック → <b>Ctrl + V</b> でスクショを貼り付け</div>}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
          <button
            onClick={runOCRInfo}
            disabled={!imgBase64 || ocrLoading}
            style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #ddd', opacity: (!imgBase64 || ocrLoading) ? 0.6 : 1 }}
            title={!imgBase64 ? 'まずスクショを貼り付けてください' : '文字解析'}
          >
            {ocrLoading ? '取得中…' : '機種情報取得・反映'}
          </button>

          <button
            onClick={runCrop}
            disabled={!imgBase64 || cropLoading}
            style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #ddd', opacity: (!imgBase64 || cropLoading) ? 0.6 : 1 }}
            title={!imgBase64 ? 'まずスクショを貼り付けてください' : 'bboxに従って切り抜き'}
          >
            {cropLoading ? '切り抜き中…' : '画像からIMEI/シリアルを切り抜き'}
          </button>

          <div style={{ color: '#2563eb', fontSize: 13 }}>{message}</div>
        </div>
      </div>

      {/* 端末情報 + クロッププレビュー */}
      <div style={section}>
        <div style={row4}>
          <div style={label}>機種名</div><input style={box as any} value={device.model_name} onChange={(e)=>setDevice({...device,model_name:e.target.value})}/>
          <div style={label}>容量</div><input style={box as any} value={device.capacity} onChange={(e)=>setDevice({...device,capacity:e.target.value})}/>
        </div>
        <div style={{ height: 8 }} />
        <div style={row4}>
          <div style={label}>カラー</div><input style={box as any} value={device.color} onChange={(e)=>setDevice({...device,color:e.target.value})}/>
          <div style={label}>モデル番号</div><input style={box as any} value={device.model_number} onChange={(e)=>setDevice({...device,model_number:e.target.value})}/>
        </div>

        {imeiCrop && <div style={{ margin: '6px 0 2px 160px' }}><img src={imeiCrop} alt="imei-crop" style={{ maxHeight: 60, border: '1px solid #e5e7eb', borderRadius: 6 }}/></div>}
        <div style={row4}>
          <div style={label}>IMEI</div>
          <input style={box as any} value={device.imei} onChange={(e)=>setDevice({...device,imei:e.target.value})}/>
          <div />
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={()=>copyAndOpen(device.imei,'https://snowyskies.jp/imeiChecking/')}
                    style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #ddd' }}>
              利用制限確認
            </button>
          </div>
        </div>

        {serialCrop && <div style={{ margin: '6px 0 2px 160px' }}><img src={serialCrop} alt="serial-crop" style={{ maxHeight: 60, border: '1px solid #e5e7eb', borderRadius: 6 }}/></div>}
        <div style={row4}>
          <div style={label}>シリアル</div>
          <input style={box as any} value={device.serial} onChange={(e)=>setDevice({...device,serial:e.target.value})}/>
          <div />
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={()=>copyAndOpen(device.serial,'https://checkcoverage.apple.com/?locale=ja_JP')}
                    style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #ddd' }}>
              保証状態確認
            </button>
          </div>
        </div>

        <div style={row4}>
          <div style={label}>バッテリー</div>
          <input style={box as any} placeholder="例）100%" value={device.battery} onChange={(e)=>setDevice({...device,battery:e.target.value})}/>
          <div style={label}>キャリア</div>
          <select style={box as any} value={device.carrier} onChange={(e)=>setDevice({...device,carrier:e.target.value})}>
            <option value=""/>{CARRIERS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div style={row4}>
          <div style={label}>利用制限</div>
          <select style={box as any} value={device.restrict} onChange={(e)=>setDevice({...device,restrict:e.target.value})}>
            <option value=""/>{RESTRICTS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <div/><div/>
        </div>
      </div>

      {/* 価格・検索・競合価格（復活） */}
      <div style={section}>
        <div style={row4}>
          <div style={label}>MAX買取価格</div><input style={box as any} placeholder="例）51000" value={maxPrice} onChange={(e)=>setMaxPrice(e.target.value as any)}/>
          <div style={label}>減額（合計）</div><input style={box as any} placeholder="例）3000" value={discount} onChange={(e)=>setDiscount(e.target.value as any)}/>
        </div>
        <div style={{ height: 8 }} />
        <div style={row2}><div style={label}>本日査定金額</div><input style={box as any} value={todayPrice} readOnly/></div>

        <div style={{ height: 10 }} />
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <button onClick={openAmemobaForSelectedCarrier}
                    style={{ padding:'8px 12px', borderRadius:8, border:'1px solid #ddd' }}>
              amemoba価格検索（{getModelPrefix() || 'キーワード未入力'} / {device.carrier || 'キャリア未選択'}）
            </button>
            <div style={{ color:'#6b7280', fontSize:12 }}>例：MLJH3 J/A → MLJH3 で検索</div>
          </div>

          <div style={{ border:'1px dashed #d1d5db', borderRadius:10, padding:8 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
              <div style={{ fontWeight:700 }}>競合価格（ゲオ）</div>
              <button onClick={fetchGeo} disabled={!getModelPrefix()} style={{ padding:'4px 8px', borderRadius:6, border:'1px solid #ddd' }}>
                {geoLoading ? '更新中…' : '更新'}
              </button>
              {geoSearchUrl && <a href={geoSearchUrl} target="_blank" rel="noreferrer" style={{ color:'#2563eb', fontSize:12 }}>検索ページ</a>}
            </div>

            {geoError && <div style={{ color:'#b91c1c', fontSize:12 }}>取得失敗：{geoError}</div>}

            {!geoError && geoResult && (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6, fontSize:14 }}>
                <div><span style={{ color:'#6b7280' }}>キャリア：</span>{geoResult.carrier || '不明'}</div>
                <div><span style={{ color:'#6b7280' }}>未使用：</span>
                  {geoResult.unusedText ? `¥${geoResult.unusedText}` : (geoResult.unused ? `¥${geoResult.unused.toLocaleString()}` : '-')}
                </div>
                <div><span style={{ color:'#6b7280' }}>中古：</span>
                  {geoResult.usedText ? `¥${geoResult.usedText}` : (geoResult.used ? `¥${geoResult.used.toLocaleString()}` : '-')}
                </div>
                <div style={{ gridColumn:'1 / -1', fontSize:12 }}>
                  <span style={{ color:'#6b7280' }}>商品：</span>
                  {geoResult.url
                    ? <a href={geoResult.url} target="_blank" rel="noreferrer" style={{ color:'#2563eb' }}>{geoResult.title}</a>
                    : geoResult.title}
                </div>
              </div>
            )}
            {!geoError && !geoResult && !geoLoading && <div style={{ color:'#6b7280', fontSize:12 }}>未取得（「更新」を押してください）</div>}
          </div>
        </div>
      </div>

      {/* 付属品/ロック/状態 */}
      <div style={section}>
        <div style={row4}>
          <div style={label}>箱・付属品</div>
          <select style={box as any} value={acc} onChange={(e)=>setAcc(e.target.value)}>
            {ACCESSORIES.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <div style={label}>SIMロック</div>
          <select style={box as any} value={simLock} onChange={(e)=>setSimLock(e.target.value)}>
            {LOCK_YN.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>

        <div style={{ height: 8 }} />
        <div style={row4}>
          <div style={label}>アクティベーションロック</div>
          <select style={box as any} value={actLock} onChange={(e)=>setActLock(e.target.value)}>
            {LOCK_YN.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <div style={label}>状態</div>
          <select style={box as any} value={condition} onChange={(e)=>setCondition(e.target.value)}>
            {CONDITIONS.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
          </select>
        </div>

        <div style={{ height: 8 }} />
        <div style={row2}>
          <div style={label}>特記事項</div>
          <textarea style={{ ...box, height: 88, resize: 'vertical' } as any}
                    placeholder="例）液晶傷あり、Face ID不良 など"
                    value={conditionNote} onChange={(e)=>setConditionNote(e.target.value)} />
        </div>
      </div>
    </div>
  )
}
