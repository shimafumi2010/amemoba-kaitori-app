// src/components/AssessForm.tsx
'use client'
import React, { useEffect, useMemo, useState } from 'react'
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

type GeoRow = { title: string; url?: string; carrier?: string; unusedText?: string; usedText?: string }

type BBox = { x: number; y: number; w: number; h: number }
type MaybeBBox = BBox | null

const section: React.CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, background: '#fff' }
const label: React.CSSProperties = { fontWeight: 600, fontSize: 13 }
const box: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8 }
const row2 = { display: 'grid', gridTemplateColumns: '160px 1fr', gap: 10, alignItems: 'center' } as const
const row4 = { display: 'grid', gridTemplateColumns: '160px 1fr 160px 1fr', gap: 10, alignItems: 'center' } as const

// 3uToolsスクショ固定前提のROI（0..1正規化）
const ROI = {
  header: {
    modelName: { x: 0.12, y: 0.04, w: 0.22, h: 0.07 },
    capacity: { x: 0.35, y: 0.04, w: 0.09, h: 0.07 },
    color: { x: 0.45, y: 0.04, w: 0.22, h: 0.07 },
  },
  table: {
    salesModel: { x: 0.28, y: 0.42, w: 0.22, h: 0.06 },
    imei: { x: 0.28, y: 0.49, w: 0.22, h: 0.06 },
    serial: { x: 0.28, y: 0.56, w: 0.22, h: 0.06 },
  },
} as const

async function cropFromBase64ByBbox(imageBase64: string, bbox: BBox): Promise<string | null> {
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

async function cropByROI(imageBase64: string) {
  const [modelName, capacity, color, salesModel, imei, serial] = await Promise.all([
    cropFromBase64ByBbox(imageBase64, ROI.header.modelName),
    cropFromBase64ByBbox(imageBase64, ROI.header.capacity),
    cropFromBase64ByBbox(imageBase64, ROI.header.color),
    cropFromBase64ByBbox(imageBase64, ROI.table.salesModel),
    cropFromBase64ByBbox(imageBase64, ROI.table.imei),
    cropFromBase64ByBbox(imageBase64, ROI.table.serial),
  ])
  return {
    modelName, capacity, color, salesModel, imei, serial,
  }
}

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

type SaveItem = {
  id: string
  savedAt: string
  staff: string
  acceptedAt: string
  customer: { name: string; kana: string; address: string; phone: string; birth: string }
  device: {
    model_name: string; capacity: string; color: string; model_number: string
    imei: string; serial: string; battery: string; carrier: string; restrict: string
  }
  notes: string
}

export default function AssessForm(): JSX.Element {
  const [staff, setStaff] = useState('島野ひとみ')
  const [acceptedAt, setAcceptedAt] = useState(() => new Date().toISOString().slice(0, 10))

  const [customerSelect, setCustomerSelect] = useState('（最新が先頭）')
  const [customer, setCustomer] = useState({ name: '', kana: '', address: '', phone: '', birth: '' })

  const [device, setDevice] = useState({
    model_name: '', capacity: '', color: '', model_number: '',
    imei: '', serial: '', battery: '', carrier: '', restrict: ''
  })

  const [acc, setAcc] = useState(''); const [simLock, setSimLock] = useState(''); const [actLock, setActLock] = useState('')
  const [condition, setCondition] = useState('B'); const [conditionNote, setConditionNote] = useState('')

  const [maxPrice, setMaxPrice] = useState<number | ''>(''); const [discount, setDiscount] = useState<number | ''>(''); const [todayPrice, setTodayPrice] = useState<number>(0)

  const [geoLoading, setGeoLoading] = useState(false)
  const [geoError, setGeoError] = useState<string | null>(null)
  const [geoResult, setGeoResult] = useState<GeoRow | null>(null)
  const [geoSearchUrl, setGeoSearchUrl] = useState<string | null>(null)

  const [imgBase64, setImgBase64] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [ocrLoading, setOcrLoading] = useState(false)
  const [cropLoading, setCropLoading] = useState(false)
  const [imeiCrop, setImeiCrop] = useState<string | null>(null)
  const [serialCrop, setSerialCrop] = useState<string | null>(null)
  const [imeiBBox, setImeiBBox] = useState<MaybeBBox>(null)
  const [serialBBox, setSerialBBox] = useState<MaybeBBox>(null)

  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SaveItem[]>([])

  useEffect(() => {
    const max = typeof maxPrice === 'number' ? maxPrice : Number(maxPrice || 0)
    const disc = typeof discount === 'number' ? discount : Number(discount || 0)
    setTodayPrice(Math.max(0, max - disc))
  }, [maxPrice, discount])

  useEffect(() => { setGeoResult(null) }, [device.carrier])

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

  // ROIベースで小画像に分割してから一括OCR
  async function runOCRInfo() {
    if (!imgBase64 || ocrLoading) return
    setOcrLoading(true)
    setMessage('機種情報取得中…')

    try {
      const tiles = await cropByROI(imgBase64)
      const reqTiles = [
        { key: 'modelName', imageBase64: tiles.modelName! },
        { key: 'capacity', imageBase64: tiles.capacity! },
        { key: 'color', imageBase64: tiles.color! },
        { key: 'salesModelFull', imageBase64: tiles.salesModel! },
        { key: 'imei', imageBase64: tiles.imei! },
        { key: 'serial', imageBase64: tiles.serial! },
      ].filter(t => !!t.imageBase64)

      const res = await fetch('/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'tile', tiles: reqTiles }),
      })

      // 429なら少し待って1回だけ再試行
      if (res.status === 429) {
        const json = await res.json().catch(() => ({}))
        const wait = Number(json?.retryAfterSeconds ?? 20)
        setMessage(`OCR待機中… レート制限（約 ${wait} 秒後に再試行）`)
        await new Promise(r => setTimeout(r, Math.max(1, wait) * 1000))
        const res2 = await fetch('/api/ocr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'tile', tiles: reqTiles }),
        })
        if (!res2.ok) {
          const t = await res2.text()
          setMessage(`OCR失敗：${t.slice(0, 140)}…`); setOcrLoading(false); return
        }
        const j2 = await res2.json()
        applyTileResult(j2?.tiles || {})
        return
      }

      if (!res.ok) {
        const t = await res.text()
        setMessage(`OCR失敗：${t.slice(0, 140)}…`); return
      }

      const json = await res.json()
      applyTileResult(json?.tiles || {})
    } catch (e: any) {
      setMessage(`OCR失敗：${e?.message ?? 'unknown error'}`)
    } finally {
      setOcrLoading(false)
    }
  }

  function applyTileResult(tiles: any) {
    const imeiNorm = normalizeIMEI(String(tiles.imei || '')) || ''
    const serialNorm = normalizeSerial(String(tiles.serial || '')) || ''
    const modelFull = String(tiles.salesModelFull || '').trim()
    const modelName = String(tiles.modelName || '').trim()
    const capacity = String(tiles.capacity || '').trim()
    const color = String(tiles.color || '').trim()

    setDevice((d) => ({
      ...d,
      model_name: modelName || d.model_name,
      capacity: capacity || d.capacity,
      color: color || d.color,
      model_number: modelFull || d.model_number, // フル（例：MWC62 J/A）
      imei: imeiNorm || d.imei,
      serial: serialNorm || d.serial,
    }))

    // ROI切り抜きのプレビュー（IMEI/Serial）
    if (imgBase64) {
      cropFromBase64ByBbox(imgBase64, ROI.table.imei).then((u) => setImeiCrop(u))
      cropFromBase64ByBbox(imgBase64, ROI.table.serial).then((u) => setSerialCrop(u))
      setImeiBBox(ROI.table.imei)
      setSerialBBox(ROI.table.serial)
    }

    setMessage('OCR完了：必要項目を反映しました（切り抜きは右プレビューに表示）')
  }

  async function runCrop() {
    if (!imgBase64) { setMessage('先に画像を貼り付けてください'); return }
    const hasImei = !!ROI.table.imei
    const hasSerial = !!ROI.table.serial
    if (!hasImei && !hasSerial) { setMessage('ROI未設定'); return }

    setCropLoading(true)
    setMessage('切り抜き実行中…')
    try {
      if (hasImei) {
        const url = await cropFromBase64ByBbox(imgBase64, ROI.table.imei)
        if (url) setImeiCrop(url)
      }
      if (hasSerial) {
        const url = await cropFromBase64ByBbox(imgBase64, ROI.table.serial)
        if (url) setSerialCrop(url)
      }
      setMessage('切り抜き完了：右のプレビューで確認できます')
    } catch (e: any) {
      setMessage(`切り抜き失敗：${e?.message ?? 'unknown error'}`)
    } finally {
      setCropLoading(false)
    }
  }

  const modelPrefix = useMemo(() => {
    const raw = (device.model_number || '').toUpperCase()
    const m = raw.match(/[A-Z0-9]{5}/)
    return m ? m[0] : ''
  }, [device.model_number])

  async function openAmemobaForSelectedCarrier() {
    const key = modelPrefix
    if (!key) { alert('モデル番号（先頭5桁）が取得できません'); return }
    if (!device.carrier) { alert('キャリアを選択してください'); return }

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

  async function fetchGeo() {
    const key = modelPrefix
    setGeoError(null); setGeoResult(null); setGeoLoading(true)
    try {
      const res = await fetch('/api/geo-prices', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelPrefix: key, carrier: device.carrier }),
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
      const hit: GeoRow = {
        title: json?.carrier ? `キャリア:${json.carrier}` : 'キャリア不明',
        url: json?.geoUrl ?? undefined,
        carrier: json?.carrier ?? undefined,
        unusedText: json?.prices?.unused ?? undefined,
        usedText: json?.prices?.used ?? undefined,
      }
      setGeoResult(hit)
    } catch (e: any) {
      setGeoError(e?.message ?? 'unknown')
    } finally { setGeoLoading(false) }
  }

  async function copyAndOpen(text: string, url: string) {
    try { if (text) await navigator.clipboard.writeText(text) } catch {}
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  function exportPdf() {
    const node = document.getElementById('assess-root')
    if (!node) return
    const w = window.open('', '_blank', 'noopener,noreferrer')
    if (!w) return
    w.document.write(`<html><head><title>査定受付票</title>
      <style>
        body{font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans JP", sans-serif;}
        *{box-sizing:border-box}
        .section{border:1px solid #e5e7eb;border-radius:10px;padding:12px;margin:8px 0}
        .row{display:grid;grid-template-columns:160px 1fr 160px 1fr;gap:10px;align-items:center}
        .row2{display:grid;grid-template-columns:160px 1fr;gap:10px;align-items:center}
        .label{font-weight:700;font-size:12px}
        .box{border:1px solid #d1d5db;border-radius:8px;padding:6px 10px}
        img{max-width:100%}
        @page { size: A4; margin: 12mm; }
      </style>
    </head><body>${node.innerHTML}</body></html>`)
    w.document.close()
    w.focus()
    w.print()
  }

  function saveCurrent() {
    const payload: SaveItem = {
      id: crypto.randomUUID(),
      savedAt: new Date().toISOString(),
      staff, acceptedAt,
      customer,
      device,
      notes: conditionNote,
    }
    const key = 'amemoba-assess-saves'
    const list: SaveItem[] = JSON.parse(localStorage.getItem(key) || '[]')
    list.unshift(payload)
    localStorage.setItem(key, JSON.stringify(list))
    setMessage('保存しました')
  }

  function searchSaved(q: string) {
    const key = 'amemoba-assess-saves'
    const list: SaveItem[] = JSON.parse(localStorage.getItem(key) || '[]')
    const lc = q.trim().toLowerCase()
    const hits = list.filter(it => {
      const fields = [
        it.customer.name, it.customer.kana, it.customer.phone,
        it.device.model_name, it.device.model_number, it.device.imei, it.device.serial,
      ].join(' ').toLowerCase()
      return fields.includes(lc)
    })
    setSearchResults(hits.slice(0, 30))
  }

  return (
    <div id="assess-root" style={{ display: 'grid', gap: 16, padding: 16, maxWidth: 980, margin: '0 auto', background: '#f6f7fb' }}>
      <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, textAlign: 'center' }}>アメモバ買取 富山店　査定受付票</h2>

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
            title={!imgBase64 ? 'まずスクショを貼り付けてください' : 'ROIに従って切り抜き'}
          >
            {cropLoading ? '切り抜き中…' : '画像からIMEI/シリアルを切り抜き'}
          </button>

          <button onClick={exportPdf} style={{ padding:'6px 12px', borderRadius:8, border:'1px solid #ddd' }}>
            PDF出力
          </button>

          <button onClick={saveCurrent} style={{ padding:'6px 12px', borderRadius:8, border:'1px solid #ddd' }}>
            保存
          </button>

          <div style={{ color: '#2563eb', fontSize: 13 }}>{message}</div>
        </div>
      </div>

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
              amemoba価格検索（{modelPrefix || 'キーワード未入力'} / {device.carrier || 'キャリア未選択'}）
            </button>
            <div style={{ color:'#6b7280', fontSize:12 }}>例：MWC62 J/A → 検索は「MWC62」で実施</div>
          </div>

          <div style={{ border:'1px dashed #d1d5db', borderRadius:10, padding:8 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
              <div style={{ fontWeight:700 }}>競合価格（ゲオ）</div>
              <button onClick={fetchGeo} disabled={!modelPrefix} style={{ padding:'4px 8px', borderRadius:6, border:'1px solid #ddd' }}>
                {geoLoading ? '更新中…' : '更新'}
              </button>
              {geoSearchUrl && <a href={geoSearchUrl} target="_blank" rel="noreferrer" style={{ color:'#2563eb', fontSize:12 }}>検索ページ</a>}
            </div>

            {geoError && <div style={{ color:'#b91c1c', fontSize:12 }}>取得失敗：{geoError}</div>}

            {!geoError && geoResult && (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, fontSize:14 }}>
                <div><span style={{ color:'#6b7280' }}>キャリア：</span>{geoResult.carrier || '不明'}</div>
                <div style={{ gridColumn:'1 / -1' }}>
                  <span style={{ color:'#6b7280' }}>商品：</span>
                  {geoResult.url
                    ? <a href={geoResult.url} target="_blank" rel="noreferrer" style={{ color:'#2563eb' }}>{geoResult.title}</a>
                    : geoResult.title}
                </div>
                <div><span style={{ color:'#6b7280' }}>未使用：</span>{geoResult.unusedText || '-'}</div>
                <div><span style={{ color:'#6b7280' }}>中古：</span>{geoResult.usedText || '-'}</div>
              </div>
            )}
            {!geoError && !geoResult && !geoLoading && <div style={{ color:'#6b7280', fontSize:12 }}>未取得（「更新」を押してください）</div>}
          </div>
        </div>
      </div>

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

      <div style={section}>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <div style={label}>保存データ検索</div>
          <input style={box as any} placeholder="名前/IMEI/シリアル/型番 など"
                 value={query}
                 onChange={(e)=>{ setQuery(e.target.value); searchSaved(e.target.value) }} />
        </div>
        {searchResults.length > 0 && (
          <div style={{ marginTop:8 }}>
            {searchResults.map(it => (
              <div key={it.id} style={{ borderTop:'1px solid #eee', padding:'6px 0', fontSize:13 }}>
                <div><b>{it.customer.name}</b>（{new Date(it.savedAt).toLocaleString()}）</div>
                <div style={{ color:'#6b7280' }}>{it.device.model_name} / {it.device.model_number} / IMEI: {it.device.imei}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
