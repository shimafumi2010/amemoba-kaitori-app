
'use client'
import { useState } from 'react'

type Device = {
  model_name?: string
  capacity?: string
  color?: string
  model_number?: string
  imei?: string
  serial?: string
  battery?: string
  max_price?: number | null
  estimated_price?: number | null
  condition?: string
  notes?: string
}

export default function AssessForm() {
  const [imgBase64, setImgBase64] = useState<string | null>(null)
  const [device, setDevice] = useState<Device>({})
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState<string>('')

  async function runOCR() {
    if (!imgBase64) return
    const res = await fetch('/api/ocr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: imgBase64 })
    })
    const json = await res.json()
    // Try to parse JSON content from model
    try {
      const content = json.data || json.result || ''
      const parsed = typeof content === 'string' ? JSON.parse(content) : content
      setDevice((d) => ({ ...d, ...parsed }))
    } catch {
      // naive fallback: nothing
    }
  }

  async function fetchPrice() {
    const key = device.model_name || device.model_number
    if (!key) return
    const res = await fetch('/api/price', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: key })
    })
    const { price } = await res.json()
    setDevice((d) => ({ ...d, max_price: price }))
  }

  async function sendChatwork() {
    setSending(true)
    const body = [
      '【査定依頼】',
      `${device.model_name || ''} ${device.capacity || ''}`.trim(),
      `IMEI：${device.imei || ''}`,
      `状態：${device.condition || 'N/A'}`,
      `バッテリー：${device.battery || 'N/A'}`,
      `特記事項：${device.notes || 'なし'}`,
    ].join('\n')
    const res = await fetch('/api/chatwork', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body })
    })
    const ok = res.ok
    setMessage(ok ? 'Chatworkに送信しました' : '送信失敗')
    setSending(false)
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <h2>査定フォーム</h2>
      <p>3uToolsのスクリーンショットをアップロード → OCRで自動入力</p>
      {/* Upload box */}
      {require('./UploadBox').default({ onImage: (b64: string) => setImgBase64(b64) })}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={runOCR} disabled={!imgBase64}>OCR実行</button>
        <button onClick={fetchPrice} disabled={!device.model_name && !device.model_number}>最大価格取得</button>
        <button onClick={sendChatwork} disabled={sending}>Chatwork送信</button>
      </div>

      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr' }}>
        <label>機種名<input value={device.model_name || ''} onChange={e => setDevice({...device, model_name: e.target.value})} /></label>
        <label>容量<input value={device.capacity || ''} onChange={e => setDevice({...device, capacity: e.target.value})} /></label>
        <label>カラー<input value={device.color || ''} onChange={e => setDevice({...device, color: e.target.value})} /></label>
        <label>モデル番号<input value={device.model_number || ''} onChange={e => setDevice({...device, model_number: e.target.value})} /></label>
        <label>IMEI<input value={device.imei || ''} onChange={e => setDevice({...device, imei: e.target.value})} /></label>
        <label>シリアル<input value={device.serial || ''} onChange={e => setDevice({...device, serial: e.target.value})} /></label>
        <label>バッテリー<input value={device.battery || ''} onChange={e => setDevice({...device, battery: e.target.value})} /></label>
        <label>状態<input value={device.condition || ''} onChange={e => setDevice({...device, condition: e.target.value})} /></label>
        <label style={{ gridColumn: '1 / -1' }}>特記事項<textarea value={device.notes || ''} onChange={e => setDevice({...device, notes: e.target.value})} /></label>
        <label>最大買取価格<input value={device.max_price ?? ''} onChange={e => setDevice({...device, max_price: Number(e.target.value) || 0})} /></label>
        <label>査定額<input value={device.estimated_price ?? ''} onChange={e => setDevice({...device, estimated_price: Number(e.target.value) || 0})} /></label>
      </div>

      {message && <div>{message}</div>}
    </div>
  )
}
