'use client'
import React, { useEffect, useRef, useState } from 'react'
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

export default function AssessForm(): JSX.Element {
  const [staff, setStaff] = useState('島野ひとみ')
  const [acceptedAt, setAcceptedAt] = useState(() => {
    const d = new Date()
    return d.toISOString().slice(0, 10)
  })
  const [device, setDevice] = useState({
    model_name: '', capacity: '', color: '', model_number: '', imei: '', serial: '', battery: '',
    carrier: '', restrict: ''
  })
  const [acc, setAcc] = useState('')
  const [simLock, setSimLock] = useState('')
  const [actLock, setActLock] = useState('')
  const [condition, setCondition] = useState('B')
  const [conditionNote, setConditionNote] = useState('')
  const [message, setMessage] = useState('')
  const [imgBase64, setImgBase64] = useState<string | null>(null)
  const pasteRef = useRef<HTMLDivElement>(null)

  const row = { display: 'grid', gridTemplateColumns: '160px 1fr 160px 1fr', gap: 8, alignItems: 'center' } as const
  const one = { display: 'grid', gridTemplateColumns: '160px 1fr', gap: 8, alignItems: 'center' } as const
  const section: React.CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, background: '#fff' }
  const label: React.CSSProperties = { fontWeight: 600, fontSize: 13 }
  const box: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8 }

  async function fileToBase64(file: File) {
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
        const base64 = await fileToBase64(f)
        setImgBase64(base64)
        setMessage('画像貼り付け完了。OCR実行できます。')
        e.preventDefault()
        return
      }
    }
  }

  async function runOCR() {
    if (!imgBase64) return
    setMessage('OCR中…')
    try {
      const res = await fetch('/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: imgBase64 })
      })
      const json = await res.json()
      const content = json?.result ?? json?.data ?? json?.content ?? json
      const parsed: any =
        typeof content === 'string'
          ? (() => { try { return JSON.parse(content) } catch { return {} } })()
          : content || {}

      const imeiNorm = normalizeIMEI(parsed.imei)
      const serialNorm = normalizeSerial(parsed.serial)

      setDevice(d => ({
        ...d,
        model_name: parsed.model_name ?? d.model_name,
        capacity: parsed.capacity ?? d.capacity,
        color: parsed.color ?? d.color,
        model_number: parsed.model_number ?? d.model_number,
        imei: imeiNorm || parsed.imei || d.imei,
        serial: serialNorm || parsed.serial || d.serial,
        battery: parsed.battery ?? d.battery,
      }))
      setMessage('OCR完了：必要項目を反映しました。')
    } catch (e: any) {
      setMessage(`OCR失敗: ${e?.message ?? 'unknown'}`)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 16, padding: 16, maxWidth: 900, margin: '0 auto', background: '#f6f7fb' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 22, fontWeight: 700 }}>アメモバ買取 富山店　査定受付票</div>
      </div>

      {/* 担当者 */}
      <div style={section}>
        <div style={row}>
          <div style={label}>担当者</div>
          <select value={staff} onChange={(e) => setStaff(e.target.value)} style={box}>
            {STAFFS.map(s => <option key={s}>{s}</option>)}
          </select>
          <div style={label}>受付日</div>
          <input type="date" value={acceptedAt} onChange={(e) => setAcceptedAt(e.target.value)} style={box} />
        </div>
      </div>

      {/* 3uTools画像 */}
      <div style={section}>
        <div style={one}>
          <div style={label}>3uTools画像</div>
          <div
            ref={pasteRef}
            onPaste={handlePaste}
            tabIndex={0}
            style={{
              border: '2px dashed #999', borderRadius: 10, minHeight: 120,
              display: 'grid', placeItems: 'center', background: '#fafafa', outline: 'none'
            }}
          >
            {imgBase64
              ? <img src={imgBase64} alt="preview" style={{ maxWidth: '100%', borderRadius: 6 }} />
              : <div>ここをクリック → Ctrl + V でスクショを貼り付け</div>
            }
          </div>
        </div>
        <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
          <button onClick={runOCR} disabled={!imgBase64} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd' }}>OCR実行</button>
          {message && <div style={{ alignSelf: 'center', color: '#374151' }}>{message}</div>}
        </div>
      </div>

      {/* 端末情報 */}
      <div style={section}>
        <div style={row}>
          <div style={label}>機種名</div>
          <input value={device.model_name} onChange={e => setDevice({ ...device, model_name: e.target.value })} style={box} />
          <div style={label}>容量</div>
          <input value={device.capacity} onChange={e => setDevice({ ...device, capacity: e.target.value })} style={box} />
        </div>
        <div style={{ height: 8 }} />
        <div style={row}>
          <div style={label}>カラー</div>
          <input value={device.color} onChange={e => setDevice({ ...device, color: e.target.value })} style={box} />
          <div style={label}>モデル番号</div>
          <input value={device.model_number} onChange={e => setDevice({ ...device, model_number: e.target.value })} style={box} />
        </div>
        <div style={{ height: 8 }} />
        <div style={row}>
          <div style={label}>IMEI</div>
          <input value={device.imei} onChange={e => setDevice({ ...device, imei: e.target.value })} style={box} />
          <div style={label}>シリアル</div>
          <input value={device.serial} onChange={e => setDevice({ ...device, serial: e.target.value })} style={box} />
        </div>
        <div style={{ height: 8 }} />
        <div style={row}>
          <div style={label}>バッテリー</div>
          <input value={device.battery} onChange={e => setDevice({ ...device, battery: e.target.value })} placeholder="例) 100%" style={box} />
          <div style={label}>キャリア</div>
          <select value={device.carrier} onChange={e => setDevice({ ...device, carrier: e.target.value })} style={box}>
            <option value="">選択</option>
            {CARRIERS.map(c => <option key={c}>{c}</option>)}
          </select>
          <div style={label}>利用制限</div>
          <select value={device.restrict} onChange={e => setDevice({ ...device, restrict: e.target.value })} style={box}>
            <option value="">選択</option>
            {RESTRICTS.map(r => <option key={r}>{r}</option>)}
          </select>
        </div>
      </div>

      {/* 状態・ロック系まとめ */}
      <div style={section}>
        <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr 150px 1fr 150px 1fr', gap: 8 }}>
          <div style={label}>箱・付属品</div>
          <select value={acc} onChange={e => setAcc(e.target.value)} style={box}>
            <option value="">選択</option>
            {ACCESSORIES.map(v => <option key={v}>{v}</option>)}
          </select>

          <div style={label}>SIMロック</div>
          <select value={simLock} onChange={e => setSimLock(e.target.value)} style={box}>
            <option value="">選択</option>
            {LOCK_YN.map(v => <option key={v}>{v}</option>)}
          </select>

          <div style={label}>アクティベーションロック</div>
          <select value={actLock} onChange={e => setActLock(e.target.value)} style={box}>
            <option value="">選択</option>
            {LOCK_YN.map(v => <option key={v}>{v}</option>)}
          </select>
        </div>

        <div style={{ height: 12 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={label}>状態</div>
          <select
            value={condition}
            onChange={e => setCondition(e.target.value)}
            style={{ ...box, width: 260 }}
          >
            {CONDITIONS.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
          </select>
          <input
            placeholder="例）液晶傷あり／カメラ不良"
            value={conditionNote}
            onChange={e => setConditionNote(e.target.value)}
            style={{ ...box, flex: 1, height: 60 }}
          />
        </div>
      </div>
    </div>
  )
}
