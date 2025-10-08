'use client'
import React, { useCallback, useRef, useState } from 'react'

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

export default function AssessForm(): JSX.Element {
  const [imgBase64, setImgBase64] = useState<string | null>(null)
  const [device, setDevice] = useState<Device>({})
  const [customerName, setCustomerName] = useState<string>('')
  const [customerPhone, setCustomerPhone] = useState<string>('')
  const [message, setMessage] = useState<string>('')
  const [cwText, setCwText] = useState<string>('')

  const pasteZoneRef = useRef<HTMLDivElement>(null)

  const blobToBase64 = useCallback((blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  }, [])

  const handlePaste = useCallback(async (e: React.ClipboardEvent<HTMLDivElement>) => {
    try {
      const items = e.clipboardData?.items
      if (!items || items.length === 0) return
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (!file) continue
          const base64 = await blobToBase64(file)
          setImgBase64(base64)
          setMessage('画像を貼り付けました。OCR実行できます。')
          e.preventDefault()
          return
        }
      }
      setMessage('貼り付けに画像が含まれていません。Snipping Toolでコピー後にCtrl+Vしてください。')
    } catch (err: any) {
      setMessage(`貼り付けエラー: ${err?.message || 'unknown'}`)
    }
  }, [blobToBase64])

  const handleClipboardButton = useCallback(async () => {
    try {
      // @ts-ignore
      if (!navigator.clipboard?.read) {
        setMessage('このブラウザはボタンからの画像読み取りに非対応です。Ctrl+Vで貼り付けを使ってください。')
        return
      }
      // @ts-ignore
      const items: ClipboardItem[] = await navigator.clipboard.read()
      for (const item of items) {
        for (const type of item.types) {
          if (type.startsWith('image/')) {
            const blob = await item.getType(type)
            const base64 = await blobToBase64(blob)
            setImgBase64(base64)
            setMessage('クリップボードから画像を取得しました。OCR実行できます。')
            return
          }
        }
      }
      setMessage('クリップボードに画像が見つかりません。Snipping Toolでコピー後に再実行、またはCtrl+Vで貼り付けしてください。')
    } catch (err: any) {
      setMessage(`クリップボード取得エラー: ${err?.message || 'unknown'}`)
    }
  }, [blobToBase64])

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    try {
      const file = e.dataTransfer.files?.[0]
      if (!file || !file.type.startsWith('image/')) {
        setMessage('画像ファイルをドロップしてください。')
        return
      }
      const base64 = await blobToBase64(file)
      setImgBase64(base64)
      setMessage('画像をドロップしました。OCR実行できます。')
    } catch (err: any) {
      setMessage(`ドロップエラー: ${err?.message || 'unknown'}`)
    }
  }, [blobToBase64])

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
  }, [])

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setImgBase64(reader.result as string)
      setMessage('画像を選択しました。OCR実行できます。')
    }
    reader.readAsDataURL(file)
  }

  async function runOCR() {
    if (!imgBase64) return
    setMessage('OCR中…')
    const res = await fetch('/api/ocr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: imgBase64 })
    })
    const json = await res.json()
    if (!json.ok) {
      setMessage(`OCR失敗: ${json.error || 'unknown'}`)
      return
    }
    const parsed = json.data || {}
    setDevice(d => ({ ...d, ...parsed }))
    setMessage('OCR完了：抽出した項目をフォームへ反映しました。')
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
    setDevice(d => ({ ...d, max_price: price }))
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
      <p>Snipping Toolでコピー後、下のエリアをクリックして <b>Ctrl + V</b> で貼り付けできます。</p>

      <div
        ref={pasteZoneRef}
        onPaste={handlePaste}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        tabIndex={0}
        style={{
          border: '2px dashed #999',
          borderRadius: 10,
          padding: 16,
          minHeight: 160,
          outline: 'none',
          background: '#fafafa',
          display: 'grid',
          placeItems: 'center',
          textAlign: 'center'
        }}
        aria-label="ここをクリックしてCtrl+Vで貼り付け / 画像をドロップ"
      >
        <div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>ここをクリックして Ctrl + V で貼り付け</div>
          <div style={{ fontSize: 12, color: '#555' }}>画像をドラッグ＆ドロップも可</div>
          <div style={{ marginTop: 10 }}>
            <button type="button" onClick={handleClipboardButton}>クリップボードから取得（対応ブラウザ）</button>
          </div>
          <div style={{ marginTop: 10 }}>
            <input type="file" accept="image/*" onChange={handleFileInput} />
          </div>
        </div>
      </div>

      {imgBase64 && (
        <div style={{ marginTop: 8 }}>
          <img src={imgBase64} alt="preview" style={{ maxWidth: '100%', border: '1px solid #ccc', borderRadius: 8 }} />
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={runOCR} disabled={!imgBase64}>OCR実行</button>
        <button onClick={fetchPrice} disabled={!device.model_name && !device.model_number}>最大価格取得</button>
        <button onClick={buildChatworkText}>Chatwork投稿文を作成</button>
        <button onClick={copyText} disabled={!cwText}>コピー</button>
        <button onClick={saveToSupabase}>保存</button>
      </div>

      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr' }}>
        <label>お名前<input value={customerName} onChange={e => setCustomerName(e.target.value)} /></label>
        <label>電話番号<input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} /></label>
      </div>

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

      {cwText && (
        <div>
          <h3>Chatwork投稿用テキスト</h3>
          <pre style={{ whiteSpace: 'pre-wrap', background: '#f7f7f7', padding: 12, borderRadius: 8 }}>{cwText}</pre>
        </div>
      )}

      {message && <div style={{ background: '#eef', padding: 8, borderRadius: 4 }}>{message}</div>}
    </div>
  )
}
