'use client'
import React, { useEffect, useState } from 'react'
import { normalizeIMEI, normalizeSerial } from '../lib/ocrPostprocess'

type BBox = { x: number; y: number; w: number; h: number }
type OcrPayload = {
  model_name?: string
  capacity?: string
  color?: string
  model_number?: string
  imei?: string
  serial?: string
  battery?: string
}
type OcrResponse = {
  ok: boolean
  data?: OcrPayload
  bboxes?: Partial<Record<'model_number' | 'imei' | 'serial' | 'header', BBox>>
  error?: string
  retryAfterSeconds?: number
}

const section: React.CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, background: '#fff' }
const label: React.CSSProperties = { fontWeight: 600, fontSize: 13 }
const box: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8 }
const row2 = { display: 'grid', gridTemplateColumns: '160px 1fr', gap: 10, alignItems: 'center' } as const
const row4 = { display: 'grid', gridTemplateColumns: '160px 1fr 160px 1fr', gap: 10, alignItems: 'center' } as const

async function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = reject
    r.readAsDataURL(file)
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

/** base64画像の一部を bbox(0..1) で切り出す */
async function cropFromBase64(imageBase64: string, bbox: BBox): Promise<string | null> {
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

export default function AssessForm(): JSX.Element {
  // メインフォーム状態
  const [device, setDevice] = useState({
    model_name: '', capacity: '', color: '',
    model_number: '', imei: '', serial: '',
    battery: ''
  })

  // 画像 & OCR
  const [imgBase64, setImgBase64] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [ocrLoading, setOcrLoading] = useState(false)

  // bbox & 切り抜きプレビュー（「②の部分」を貼る）
  const [bboxModel, setBboxModel] = useState<BBox | null>(null)
  const [bboxImei, setBboxImei] = useState<BBox | null>(null)
  const [bboxSerial, setBboxSerial] = useState<BBox | null>(null)
  const [cropModel, setCropModel] = useState<string | null>(null)
  const [cropImei, setCropImei] = useState<string | null>(null)
  const [cropSerial, setCropSerial] = useState<string | null>(null)

  // 画像貼り付け（Snipping Tool → Ctrl+V）
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
        setMessage('画像貼り付け完了。「機種情報取得・反映」を押してください')
        e.preventDefault()
        return
      }
    }
  }

  // 画像選択（ファイル選択でもOK）
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    const raw = await fileToBase64(f)
    const light = await downscaleBase64(raw, 1400)
    setImgBase64(light)
    setMessage('画像読み込み完了。「機種情報取得・反映」を押してください')
  }

  // OCR 実行（JSONのみ返す API）
  async function runOCR() {
    if (!imgBase64 || ocrLoading) return
    setOcrLoading(true)
    setMessage('機種情報取得中…')
    try {
      const res = await fetch('/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: imgBase64 })
      })
      const text = await res.text()
      let json: OcrResponse
      try { json = JSON.parse(text) } catch {
        setMessage(`OCR失敗：応答がJSONではありません / ${text.slice(0, 140)}…`)
        return
      }
      if (!json.ok) {
        if (json.error === 'RATE_LIMIT' && typeof json.retryAfterSeconds === 'number') {
          setMessage(`OCR失敗：レート制限。${Math.ceil(json.retryAfterSeconds)}秒後に再度お試しください。`)
        } else {
          setMessage(`OCR失敗：${json.error || 'unknown'}`)
        }
        return
      }

      const p = json.data || {}

      // 安全な正規化
      const imeiNorm = normalizeIMEI(p.imei || '')
      const serialNorm = normalizeSerial(p.serial || '')

      setDevice(d => ({
        ...d,
        model_name: p.model_name ?? d.model_name,
        capacity: p.capacity ?? d.capacity,
        color: p.color ?? d.color,
        model_number: p.model_number ?? d.model_number,
        imei: imeiNorm || p.imei || d.imei,
        serial: serialNorm || p.serial || d.serial,
        battery: p.battery ?? d.battery
      }))

      // bbox 受け取り（0..1 正規化想定）
      const bb = json.bboxes || {}
      setBboxModel(bb.model_number || null)
      setBboxImei(bb.imei || null)
      setBboxSerial(bb.serial || null)

      setMessage('OCR完了：必要項目を反映しました（切り抜きは別ボタンで実行）')
    } catch (e: any) {
      setMessage(`OCR失敗：${e?.message ?? 'unknown error'}`)
    } finally {
      setOcrLoading(false)
    }
  }

  // ②の部分を切り抜いてプレビューに出す
  async function runCrop() {
    if (!imgBase64) return setMessage('先に画像を貼り付けてください')
    if (!bboxModel && !bboxImei && !bboxSerial) return setMessage('先に「機種情報取得・反映」を実行してbboxを取得してください')

    setMessage('切り抜き実行中…')
    try {
      if (bboxModel) setCropModel(await cropFromBase64(imgBase64, bboxModel))
      if (bboxImei) setCropImei(await cropFromBase64(imgBase64, bboxImei))
      if (bboxSerial) setCropSerial(await cropFromBase64(imgBase64, bboxSerial))
      setMessage('切り抜き完了：各入力欄の右にプレビューを表示しました')
    } catch (e: any) {
      setMessage(`切り抜き失敗：${e?.message ?? 'unknown error'}`)
    }
  }

  // 本日価格の簡易計算（ダミー）
  const [maxPrice, setMaxPrice] = useState<number | ''>(''); const [discount, setDiscount] = useState<number | ''>(''); const [todayPrice, setTodayPrice] = useState<number>(0)
  useEffect(() => {
    const max = typeof maxPrice === 'number' ? maxPrice : Number(maxPrice || 0)
    const disc = typeof discount === 'number' ? discount : Number(discount || 0)
    setTodayPrice(Math.max(0, max - disc))
  }, [maxPrice, discount])

  return (
    <div style={{ display: 'grid', gap: 16, padding: 16, maxWidth: 980, margin: '0 auto', background: '#f6f7fb' }}>
      <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, textAlign: 'center' }}>アメモバ買取 富山店　査定受付票</h2>

      {/* 3uTools スクショ貼付枠 */}
      <div style={section}>
        <div style={row2}>
          <div style={label}>3uTools画像</div>
          <div
            onPaste={handlePaste}
            style={{
              border: '2px dashed #cbd5e1', borderRadius: 10, minHeight: 180, display: 'grid', placeItems: 'center',
              color: '#6b7280', background: '#fafafa', textAlign: 'center', padding: 8
            }}
            title="ここに Ctrl+V でスクショを貼り付け（ファイル選択も可）"
          >
            {imgBase64
              ? <img src={imgBase64} alt="pasted" style={{ maxWidth: '100%', maxHeight: 260, borderRadius: 8 }} />
              : <div>ここをクリック → <b>Ctrl + V</b> でスクショ貼付<br /><input type="file" accept="image/*" onChange={handleFileChange} /></div>}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
          <button
            onClick={runOCR}
            disabled={!imgBase64 || ocrLoading}
            style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #ddd', opacity: (!imgBase64 || ocrLoading) ? 0.6 : 1 }}
          >
            {ocrLoading ? '機種情報取得中…' : '機種情報取得・反映'}
          </button>
          <button
            onClick={runCrop}
            disabled={!imgBase64}
            style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #ddd', opacity: (!imgBase64) ? 0.6 : 1 }}
          >
            画像からIMEI/シリアルを切り抜き
          </button>
          <div style={{ color: '#2563eb', fontSize: 13 }}>{message}</div>
        </div>
      </div>

      {/* 端末情報 + ②プレビュー */}
      <div style={section}>
        <div style={row4}>
          <div style={label}>機種名</div><input style={box as any} value={device.model_name} onChange={(e)=>setDevice({...device,model_name:e.target.value})}/>
          <div style={label}>容量</div><input style={box as any} value={device.capacity} onChange={(e)=>setDevice({...device,capacity:e.target.value})}/>
        </div>

        <div style={{ height: 8 }} />
        <div style={row4}>
          <div style={label}>カラー</div><input style={box as any} value={device.color} onChange={(e)=>setDevice({...device,color:e.target.value})}/>
          <div style={label}>モデル番号</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:8, alignItems:'center' }}>
            <input style={box as any} value={device.model_number} onChange={(e)=>setDevice({...device,model_number:e.target.value})}/>
            {cropModel && <img src={cropModel} alt="model-crop" style={{ maxHeight: 40, border:'1px solid #e5e7eb', borderRadius:6 }} />}
          </div>
        </div>

        <div style={{ height: 8 }} />
        <div style={row4}>
          <div style={label}>IMEI</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:8, alignItems:'center' }}>
            <input style={box as any} value={device.imei} onChange={(e)=>setDevice({...device,imei:e.target.value})}/>
            {cropImei && <img src={cropImei} alt="imei-crop" style={{ maxHeight: 40, border:'1px solid #e5e7eb', borderRadius:6 }} />}
          </div>
          <div style={label}>シリアル</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:8, alignItems:'center' }}>
            <input style={box as any} value={device.serial} onChange={(e)=>setDevice({...device,serial:e.target.value})}/>
            {cropSerial && <img src={cropSerial} alt="serial-crop" style={{ maxHeight: 40, border:'1px solid #e5e7eb', borderRadius:6 }} />}
          </div>
        </div>

        <div style={{ height: 8 }} />
        <div style={row4}>
          <div style={label}>バッテリー</div>
          <input style={box as any} placeholder="例）100%" value={device.battery} onChange={(e)=>setDevice({...device,battery:e.target.value})}/>
          <div/><div/>
        </div>
      </div>

      {/* 価格（参考） */}
      <div style={section}>
        <div style={row4}>
          <div style={label}>MAX買取価格</div><input style={box as any} placeholder="例）51000" value={maxPrice} onChange={(e)=>setMaxPrice(e.target.value as any)}/>
          <div style={label}>減額（合計）</div><input style={box as any} placeholder="例）3000" value={discount} onChange={(e)=>setDiscount(e.target.value as any)}/>
        </div>
        <div style={{ height: 8 }} />
        <div style={row2}><div style={label}>本日査定金額</div><input style={box as any} value={todayPrice} readOnly/></div>
      </div>
    </div>
  )
}
