'use client'
import React, { useEffect, useState } from 'react'
import { normalizeIMEI, normalizeSerial } from '../lib/ocrPostprocess'

type Box = { x: number; y: number; w: number; h: number }
type OcrResp = {
  ok: boolean
  data?: {
    model_name?: string
    capacity?: string
    color?: string
    model_number?: string
    imei?: string
    serial?: string
    battery?: string
  }
  bboxes?: Partial<Record<'model_number' | 'imei' | 'serial', Box>>
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
async function cropFromBase64(imageBase64: string, b: Box): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const sx = Math.max(0, Math.round(b.x * img.width))
      const sy = Math.max(0, Math.round(b.y * img.height))
      const sw = Math.max(1, Math.round(b.w * img.width))
      const sh = Math.max(1, Math.round(b.h * img.height))
      const out = document.createElement('canvas')
      out.width = sw; out.height = sh
      const ctx = out.getContext('2d')!
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)
      resolve(out.toDataURL('image/png'))
    }
    img.onerror = () => resolve(null)
    img.src = imageBase64
  })
}

export default function AssessForm(): JSX.Element {
  const [imgBase64, setImgBase64] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const [model_name, setModelName] = useState('')
  const [capacity, setCapacity] = useState('')
  const [color, setColor] = useState('')
  const [model_number, setModelNumber] = useState('')
  const [imei, setImei] = useState('')
  const [serial, setSerial] = useState('')
  const [battery, setBattery] = useState('')

  const [bbModel, setBbModel] = useState<Box | null>(null)
  const [bbImei, setBbImei] = useState<Box | null>(null)
  const [bbSerial, setBbSerial] = useState<Box | null>(null)
  const [cropModel, setCropModel] = useState<string | null>(null)
  const [cropImei, setCropImei] = useState<string | null>(null)
  const [cropSerial, setCropSerial] = useState<string | null>(null)

  async function onPaste(e: React.ClipboardEvent<HTMLDivElement>) {
    const items = e.clipboardData?.items
    if (!items) return
    for (const it of items) {
      if (it.type.startsWith('image/')) {
        const f = it.getAsFile()
        if (!f) continue
        const raw = await fileToBase64(f)
        const light = await downscaleBase64(raw, 1400)
        setImgBase64(light)
        setMessage('画像貼付け完了。「機種情報取得・反映」を押してください')
        e.preventDefault()
        return
      }
    }
  }
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    const raw = await fileToBase64(f)
    const light = await downscaleBase64(raw, 1400)
    setImgBase64(light)
    setMessage('画像読み込み完了')
  }

  // —— 速度優先：一発リクエスト、最小後処理 —— //
  async function runOCR() {
    if (!imgBase64) return setMessage('先に画像を貼り付けてください')
    setLoading(true); setMessage('機種情報取得中…')
    try {
      const res = await fetch('/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: imgBase64 }),
      })
      const json = (await res.json()) as OcrResp
      if (!json.ok) {
        if (json.error === 'RATE_LIMIT') {
          setMessage(`レート制限。${json.retryAfterSeconds ?? 30}秒後に再試行してください`)
        } else {
          setMessage(`OCR失敗：${json.error || `${res.status} ${res.statusText}`}`)
        }
        return
      }

      const f = json.data || {}
      if (f.model_name) setModelName(f.model_name)
      if (f.capacity) setCapacity(f.capacity)
      if (f.color) setColor(f.color)
      if (f.model_number) setModelNumber(f.model_number)
      if (f.imei) setImei(normalizeIMEI(f.imei) || f.imei)
      if (f.serial) setSerial(normalizeSerial(f.serial) || f.serial)
      if (f.battery) setBattery(f.battery)

      const bb = json.bboxes || {}
      setBbModel(bb.model_number || null)
      setBbImei(bb.imei || null)
      setBbSerial(bb.serial || null)

      setMessage('反映完了（必要なら切り抜きを表示）')
    } catch (e: any) {
      setMessage(`通信失敗：${e?.message ?? 'unknown'}`)
    } finally {
      setLoading(false)
    }
  }

  async function runCrop() {
    if (!imgBase64) return setMessage('画像がありません')
    if (!bbModel && !bbImei && !bbSerial) return setMessage('先に「機種情報取得・反映」を実行してください')
    setMessage('切り抜き中…')
    try {
      if (bbModel) setCropModel(await cropFromBase64(imgBase64, bbModel))
      if (bbImei) setCropImei(await cropFromBase64(imgBase64, bbImei))
      if (bbSerial) setCropSerial(await cropFromBase64(imgBase64, bbSerial))
      setMessage('切り抜き完了')
    } catch (e: any) {
      setMessage(`切り抜き失敗：${e?.message ?? 'unknown'}`)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 16, padding: 16, maxWidth: 980, margin: '0 auto', background: '#f6f7fb' }}>
      <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, textAlign: 'center' }}>アメモバ買取 — 査定受付票</h2>

      {/* 画像貼付け */}
      <div style={section}>
        <div style={row2}>
          <div style={label}>3uTools画像</div>
          <div
            onPaste={onPaste}
            style={{ border: '2px dashed #cbd5e1', borderRadius: 10, minHeight: 180, display: 'grid', placeItems: 'center', color: '#6b7280', background: '#fafafa', textAlign: 'center', padding: 8 }}
          >
            {imgBase64
              ? <img src={imgBase64} alt="pasted" style={{ maxWidth: '100%', maxHeight: 260, borderRadius: 8 }} />
              : <div>ここをクリック → <b>Ctrl + V</b> で貼付け<br /><input type="file" accept="image/*" onChange={onFile} /></div>}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
          <button onClick={runOCR} disabled={!imgBase64 || loading} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #ddd', opacity: (!imgBase64 || loading) ? 0.6 : 1 }}>
            {loading ? '機種情報取得中…' : '機種情報取得・反映'}
          </button>
          <button onClick={runCrop} disabled={!imgBase64} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #ddd', opacity: (!imgBase64) ? 0.6 : 1 }}>
            画像からIMEI/シリアルを切り抜き
          </button>
          <div style={{ color: '#2563eb', fontSize: 13 }}>{message}</div>
        </div>
      </div>

      {/* 端末情報 + ②のプレビュー */}
      <div style={section}>
        <div style={row4}>
          <div style={label}>機種名</div><input style={box as any} value={model_name} onChange={(e)=>setModelName(e.target.value)} />
          <div style={label}>容量</div><input style={box as any} value={capacity} onChange={(e)=>setCapacity(e.target.value)} />
        </div>

        <div style={{ height: 8 }} />
        <div style={row4}>
          <div style={label}>カラー</div><input style={box as any} value={color} onChange={(e)=>setColor(e.target.value)} />
          <div style={label}>モデル番号</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:8, alignItems:'center' }}>
            <input style={box as any} value={model_number} onChange={(e)=>setModelNumber(e.target.value)} />
            {cropModel && <img src={cropModel} alt="model-crop" style={{ maxHeight: 40, border:'1px solid #e5e7eb', borderRadius:6 }} />}
          </div>
        </div>

        <div style={{ height: 8 }} />
        <div style={row4}>
          <div style={label}>IMEI</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:8, alignItems:'center' }}>
            <input style={box as any} value={imei} onChange={(e)=>setImei(e.target.value)} />
            {cropImei && <img src={cropImei} alt="imei-crop" style={{ maxHeight: 40, border:'1px solid #e5e7eb', borderRadius:6 }} />}
          </div>
          <div style={label}>シリアル</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:8, alignItems:'center' }}>
            <input style={box as any} value={serial} onChange={(e)=>setSerial(e.target.value)} />
            {cropSerial && <img src={cropSerial} alt="serial-crop" style={{ maxHeight: 40, border:'1px solid #e5e7eb', borderRadius:6 }} />}
          </div>
        </div>

        <div style={{ height: 8 }} />
        <div style={row4}>
          <div style={label}>バッテリー</div><input style={box as any} placeholder="例）100%" value={battery} onChange={(e)=>setBattery(e.target.value)} />
          <div /><div />
        </div>
      </div>
    </div>
  )
}
