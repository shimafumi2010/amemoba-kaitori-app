'use client'
import React, { useRef, useState, useEffect } from 'react'
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

/** 軽量化：最大幅 1400px まで縮小して base64 返す */
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
      // PNGだとサイズが大きいので JPEG 0.9
      resolve(canvas.toDataURL('image/jpeg', 0.9))
    }
    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
  })
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

  const [maxPrice, setMaxPrice] = useState<number | ''>(''); const [discount, setDiscount] = useState<number | ''>('')
  const [todayPrice, setTodayPrice] = useState<number>(0)

  const [geoLoading, setGeoLoading] = useState(false)
  const [geoError, setGeoError] = useState<string | null>(null)
  const [geoResult, setGeoResult] = useState<GeoRow | null>(null)
  const [geoSearchUrl, setGeoSearchUrl] = useState<string | null>(null)

  const [imgBase64, setImgBase64] = useState<string | null>(null)
  const [imeiCrop, setImeiCrop] = useState<string | null>(null)
  const [serialCrop, setSerialCrop] = useState<string | null>(null)

  const [message, setMessage] = useState('')
  const [ocrLoading, setOcrLoading] = useState(false)

  useEffect(() => {
    const max = typeof maxPrice === 'number' ? maxPrice : Number(maxPrice || 0)
    const disc = typeof discount === 'number' ? discount : Number(discount || 0)
    setTodayPrice(Math.max(0, max - disc))
  }, [maxPrice, discount])

  function fileToBase64(file: File) {
    return new Promise<string>((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(r.result as string)
      r.onerror = reject
      r.readAsDataURL(file)
    })
  }

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
        setMessage('画像貼り付け完了。「OCR実行」を押してください。')
        e.preventDefault()
        return
      }
    }
  }

  /** フロント側の明示タイムアウト（35s） */
  async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 35000) {
    const controller = new AbortController()
    const id = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url, { ...init, signal: controller.signal })
      return res
    } finally {
      clearTimeout(id)
    }
  }

  /** OCR実行（API側は内部リトライ済み） */
  async function runOCR() {
    if (!imgBase64 || ocrLoading) return
    setOcrLoading(true)
    setMessage('OCR中…（最大35秒）')
    try {
      const res = await fetchWithTimeout('/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: imgBase64 }),
      }, 35_000)

      const text = await res.text()
      let json: any = null
      try { json = JSON.parse(text) } catch {
        setMessage(`OCR失敗：応答がJSONではありません / ${text.slice(0, 140)}…`)
        return
      }

      if (json?.ok === false) {
        setMessage(`OCR失敗：${json?.error || 'unknown'}`)
        return
      }

      const p: any = json?.data ?? {}
      const imeiNorm = normalizeIMEI(p.imei)
      const serialNorm = normalizeSerial(p.serial)

      setDevice(d => ({
        ...d,
        model_name: p.model_name ?? d.model_name,
        capacity: p.capacity ?? d.capacity,
        color: p.color ?? d.color,
        model_number: p.model_number ?? d.model_number,
        imei: imeiNorm || p.imei || d.imei,
        serial: serialNorm || p.serial || d.serial,
        battery: p.battery ?? d.battery,
      }))

      if (p?.imei_bbox && imgBase64) {
        const url = await cropFromBase64ByBbox(imgBase64, p.imei_bbox)
        if (url) setImeiCrop(url)
      }
      if (p?.serial_bbox && imgBase64) {
        const url = await cropFromBase64ByBbox(imgBase64, p.serial_bbox)
        if (url) setSerialCrop(url)
      }

      setMessage('OCR完了：抽出＋自動クロップを反映しました。')
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        setMessage('OCR失敗：タイムアウトしました（回線状況やレート制限が原因の可能性）')
      } else {
        setMessage(`OCR失敗：${e?.message ?? 'unknown error'}`)
      }
    } finally {
      setOcrLoading(false)
    }
  }

  function getModelPrefix(): string {
    const raw = (device.model_number || device.model_name || '').trim()
    if (!raw) return ''
    return raw.split(/\s+/)[0]
  }

  async function copyAndOpen(text: string, url: string) {
    try { if (text) await navigator.clipboard.writeText(text) } catch {}
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  // ※ 価格UIやゲオ等は既存のファイル構成に合わせて残してください（このファイルではOCR部分のみ強化）

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

      {/* 3uTools画像 貼付け & OCR */}
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
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
          <button
            onClick={runOCR}
            disabled={!imgBase64 || ocrLoading}
            style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #ddd', opacity: (!imgBase64 || ocrLoading) ? 0.6 : 1 }}
            title={!imgBase64 ? 'まずスクショを貼り付けてください' : 'OCRを実行'}
          >
            {ocrLoading ? 'OCR実行中…' : 'OCR実行'}
          </button>

          {ocrLoading && (
            <span style={{ fontSize: 13, color: '#2563eb' }}>
              解析中です（最大35秒）。続く場合は一度停止してから再度お試しください。
            </span>
          )}

          {!ocrLoading && <div style={{ color: '#2563eb', fontSize: 13 }}>{message}</div>}
        </div>
      </div>

      {/* 端末情報（クロッププレビュー付き） */}
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

      {/* （価格・ゲオ等のブロックは、あなたの最新版に合わせて残してください） */}
    </div>
  )
}
