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
  // 画像→OCR
  const [imgBase64, setImgBase64] = useState<string | null>(null)
  // 端末情報
  const [device, setDevice] = useState<Device>({})
  // お客様情報（最小）
  const [customerName, setCustomerName] = useState<string>('')
  const [customerPhone, setCustomerPhone] = useState<string>('')

  // UIメッセージ & Chatwork用テキスト
  const [message, setMessage] = useState<string>('')
  const [cwText, setCwText] = useState<string>('')

  async function runOCR() {
    if (!imgBase64) return
    const res = await fetch('/api/ocr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: imgBase64 })
    })
    const json = await res.json()
    try {
      const content = json.data || json.result || ''
      const parsed = typeof content === 'string' ? JSON.parse(content) : content
      setDevice((d) => ({ ...d, ...parsed }))
    } catch {
      setMessage('OCRの解析結果をJSONとして解釈できませんでした。必要項目を手入力してください。')
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

  function buildChatworkText() {
    const lines = [
      '【査定依頼】',
      `${device.model_name || ''} ${device.capacity || ''}`.trim(),
      `IMEI：${device.imei || ''}`,
      `状態：${device.condition || 'N/A'}`,
      `バッテリー：${device.battery || 'N/A'}`,
      `最大買取価格（参考）：${device.max_price ? `¥${device.max_price.toLocaleString()}` : 'N/A'}`,
      `査定メモ：${device.notes || 'なし'}`
    ]
    const txt = lines.join('\n')
    setCwText(txt)
    setMessage('Chatwork投稿用のテキストを作成しました。下の「コピー」から貼り付けてください。')
  }

  async function copyText() {
    if (!cwText) return
    await navigator.clipboard.writeText(cwText)
    setMessage('コピーしました。Chatworkに貼り付けてください。')
  }

  // 🔽 Supabase 保存
  async function saveToSupabase() {
    setMessage('保存中…')
    const payload = {
      customer: {
        name: customerName || 'お客様',
        phone: customerPhone || null
      },
      device: {
        model_name: device.model_name ?? null,
        model_number: device.model_number ?? null,
        imei: device.imei ?? null,
        color: device.color ?? null,
        capacity: device.capacity ?? null,
        battery: device.battery ?? null,
        condition: device.condition ?? null,
        max_price: device.max_price ?? null,
        estimated_price: device.estimated_price ?? null,
        notes: device.notes ?? null
      },
      chatwork_text: cwText || null
    }

    const res = await fetch('/api/assessments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })

    const json = await res.json()
    if (json.ok) {
      setMessage(`保存しました（assessment_id: ${json.assessment_id}）`)
    } else {
      setMessage(`保存に失敗しました：${json.error ?? 'unknown'}`)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <h2>査定フォーム</h2>
      <p>3uToolsのスクリーンショットをアップロード → OCRで自動入力</p>

      {/* アップロード */}
      {require('./UploadBox').default({ onImage: (b64: string) => setImgBase64(b64) })}

      {/* 操作ボタン */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={runOCR} disabled={!imgBase64}>OCR実行</button>
        <button onClick={fetchPrice} disabled={!device.model_name && !device.model_number}>最大価格取得</button>
        <button onClick={buildChatworkText}>Chatwork投稿文を作成</button>
        <button onClick={copyText} disabled={!cwText}>コピー</button>
        <button onClick={saveToSupabase}>保存</button>
      </div>

      {/* お客様情報 */}
      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr' }}>
        <label>お名前<input value={customerName} onChange={e => setCustomerName(e.target.value)} /></label>
        <label>電話番号<input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} /></label>
      </div>

      {/* 端末情報 */}
      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr' }}>
        <label>機種名<input value={device.model_name || ''} onChange={e => setDevice({ ...device, model_name: e.target.value })} /></label>
        <label>容量<input value={device.capacity || ''} onChange={e => setDevice({ ...device, capacity: e.target.value })} /></label>
        <label>カラー<input value={device.color || ''} onChange={e => setDevice({ ...device, color: e.target.value })} /></label>
        <label>モデル番号<input value={device.model_number || ''} onChange={e => setDevice({ ...device, model_number: e.target.value })} /></label>
        <label>IMEI<input value={device.imei || ''} onChange={e => setDevice({ ...device, imei: e.target.value })} /></label>
        <label>シリアル<input value={device.serial || ''} onChange={e => setDevice({ ...device, serial: e.target.value })} /></label>
        <label>バッテリー<input value={device.battery || ''} onChange={e => setDevice({ ...device, battery: e.target.value })} /></label>
        <label>状態<input value={device.condition || ''} onChange={e => setDevice({ ...device, condition: e.target.value })} /></label>
        <label style={{ gridColumn: '1 / -1' }}>特記事項<textarea value={device.notes || ''} onChange={e => setDevice({ ...device, notes: e.target.value })} /></label>
        <label>最大買取価格<input value={device.max_price ?? ''} onChange={e => setDevice({ ...device, max_price: Number(e.target.value) || 0 })} /></label>
        <label>査定額<input value={device.estimated_price ?? ''} onChange={e => setDevice({ ...device, estimated_price: Number(e.target.value) || 0 })} /></label>
      </div>

      {/* Chatwork投稿用テキスト */}
      {cwText && (
        <div>
          <h3>Chatwork投稿用テキスト</h3>
          <pre style={{ whiteSpace: 'pre-wrap', background: '#f7f7f7', padding: 12, borderRadius: 8 }}>{cwText}</pre>
        </div>
      )}

      {message && <div>{message}</div>}
    </div>
  )
}
