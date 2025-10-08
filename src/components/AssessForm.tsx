'use client'
import React, { useRef, useState } from 'react'
import { normalizeIMEI, normalizeSerial } from '../lib/ocrPostprocess'

/* 定数 */
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

/* 型 */
type Customer = {
  name: string
  furigana?: string
  address?: string
  phone?: string
  birthday?: string
}

/* コンポーネント */
export default function AssessForm(): JSX.Element {
  // ヘッダ
  const [staff, setStaff] = useState('島野ひとみ')
  const [acceptedAt, setAcceptedAt] = useState(() => new Date().toISOString().slice(0, 10))

  // お客様（将来：フォームの最新から一覧取得して選択にする想定。今は手入力UIのみ）
  const [customer, setCustomer] = useState<Customer>({
    name: '', furigana: '', address: '', phone: '', birthday: ''
  })

  // 端末
  const [device, setDevice] = useState({
    model_name: '', capacity: '', color: '', model_number: '',
    imei: '', serial: '', battery: '',
    carrier: '', restrict: ''
  })

  // ロック・状態
  const [acc, setAcc] = useState('')
  const [simLock, setSimLock] = useState('')
  const [actLock, setActLock] = useState('')
  const [condition, setCondition] = useState('B')
  const [conditionNote, setConditionNote] = useState('')

  // OCR
  const [imgBase64, setImgBase64] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const pasteRef = useRef<HTMLDivElement>(null)

  /* 共通スタイル */
  const section: React.CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, background: '#fff' }
  const label: React.CSSProperties = { fontWeight: 600, fontSize: 13 }
  const box: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8 }

  // 2列と4列の行レイアウト（重なり防止。明示的に列幅を決めます）
  const row2 = { display: 'grid', gridTemplateColumns: '160px 1fr', gap: 10, alignItems: 'center' } as const
  const row4 = { display: 'grid', gridTemplateColumns: '160px 1fr 160px 1fr', gap: 10, alignItems: 'center' } as const

  /* 画像→Base64 */
  function fileToBase64(file: File) {
    return new Promise<string>((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(r.result as string)
      r.onerror = reject
      r.readAsDataURL(file)
    })
  }

  /* 貼り付けで画像取得 */
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

  // ===== OCR実行（強化版） =====
  async function runOCR() {
    if (!imgBase64) return
    setMessage('OCR中…')

    try {
      const res = await fetch('/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: imgBase64 })
      })

      // HTTP レベルの失敗（429等）を検出
      if (!res.ok) {
        let body = ''
        try { body = await res.text() } catch {}
        setMessage(`OCR失敗: HTTP ${res.status} ${res.statusText}${body ? ` / ${body.slice(0,180)}…` : ''}`)
        return
      }

      const json = await res.json()

      // API レベルの失敗
      if (json?.ok === false) {
        setMessage(`OCR失敗: ${json?.error || 'unknown error'}`)
        return
      }

      // 代表ペイロードを取り出し
      const payload: any = json?.data ?? json?.result ?? json?.content ?? {}

      if (!payload || typeof payload !== 'object' || Object.keys(payload).length === 0) {
        setMessage('OCR失敗: 結果が空でした（項目を読み取れませんでした）')
        return
      }

      // 正規化（stringを返します）
      const imeiNorm = normalizeIMEI(payload.imei)
      const serialNorm = normalizeSerial(payload.serial)

      setDevice(d => ({
        ...d,
        model_name: payload.model_name ?? d.model_name,
        capacity: payload.capacity ?? d.capacity,
        color: payload.color ?? d.color,
        model_number: payload.model_number ?? d.model_number,
        imei: imeiNorm || payload.imei || d.imei,
        serial: serialNorm || payload.serial || d.serial,
        battery: payload.battery ?? d.battery,
      }))

      // 警告があれば併記
      const warns = Array.isArray(json?.warnings) && json.warnings.length
        ? ` 注意: ${json.warnings.join(' / ')}`
        : ''

      setMessage('OCR完了：必要項目を反映しました。' + warns)
    } catch (e: any) {
      setMessage(`OCR失敗: ${e?.message ?? 'unknown'}`)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 16, padding: 16, maxWidth: 980, margin: '0 auto', background: '#f6f7fb' }}>
      {/* タイトル */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 22, fontWeight: 700 }}>アメモバ買取 富山店　査定受付票</div>
      </div>

      {/* ヘッダ */}
      <div style={section}>
        <div style={row4}>
          <div style={label}>担当者</div>
          <select value={staff} onChange={(e) => setStaff(e.target.value)} style={box}>
            {STAFFS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <div style={label}>受付日</div>
          <input type="date" value={acceptedAt} onChange={(e) => setAcceptedAt(e.target.value)} style={box} />
        </div>
      </div>

      {/* お客様情報（重なり解消） */}
      <div style={section}>
        <div style={row4}>
          <div style={label}>お名前</div>
          <input value={customer.name} onChange={e => setCustomer({ ...customer, name: e.target.value })} style={box} />
          <div style={label}>フリガナ</div>
          <input value={customer.furigana || ''} onChange={e => setCustomer({ ...customer, furigana: e.target.value })} style={box} />
        </div>
        <div style={{ height: 8 }} />
        <div style={row2}>
          <div style={label}>ご住所</div>
          <input value={customer.address || ''} onChange={e => setCustomer({ ...customer, address: e.target.value })} style={box} />
        </div>
        <div style={{ height: 8 }} />
        <div style={row4}>
          <div style={label}>電話番号</div>
          <input value={customer.phone || ''} onChange={e => setCustomer({ ...customer, phone: e.target.value })} style={box} />
          <div style={label}>生年月日</div>
          <input type="date" value={customer.birthday || ''} onChange={e => setCustomer({ ...customer, birthday: e.target.value })} style={box} />
        </div>
      </div>

      {/* 3uTools画像 → OCR */}
      <div style={section}>
        <div style={row2}>
          <div style={label}>3uTools画像</div>
          <div
            ref={pasteRef}
            onPaste={handlePaste}
            tabIndex={0}
            style={{
              border: '2px dashed #999', borderRadius: 10, minHeight: 140,
              display: 'grid', placeItems: 'center', background: '#fafafa', outline: 'none'
            }}
            title="ここをクリック → Ctrl + V でスクショを貼り付け（Snipping Tool可）"
          >
            {imgBase64
              ? <img src={imgBase64} alt="preview" style={{ maxWidth: '100%', borderRadius: 6 }} />
              : <div>ここをクリック → Ctrl + V でスクショを貼り付け</div>}
          </div>
        </div>
        <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
          <button onClick={runOCR} disabled={!imgBase64} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd' }}>OCR実行</button>
          {message && <div style={{ alignSelf: 'center', color: '#374151' }}>{message}</div>}
        </div>
      </div>

      {/* 端末情報 */}
      <div style={section}>
        <div style={row4}>
          <div style={label}>機種名</div>
          <input value={device.model_name} onChange={e => setDevice({ ...device, model_name: e.target.value })} style={box} />
          <div style={label}>容量</div>
          <input value={device.capacity} onChange={e => setDevice({ ...device, capacity: e.target.value })} style={box} />
        </div>
        <div style={{ height: 8 }} />
        <div style={row4}>
          <div style={label}>カラー</div>
          <input value={device.color} onChange={e => setDevice({ ...device, color: e.target.value })} style={box} />
          <div style={label}>モデル番号</div>
          <input value={device.model_number} onChange={e => setDevice({ ...device, model_number: e.target.value })} style={box} />
        </div>
        <div style={{ height: 8 }} />
        <div style={row4}>
          <div style={label}>IMEI</div>
          <input value={device.imei} onChange={e => setDevice({ ...device, imei: e.target.value })} style={box} />
          <div style={label}>シリアル</div>
          <input value={device.serial} onChange={e => setDevice({ ...device, serial: e.target.value })} style={box} />
        </div>
        <div style={{ height: 8 }} />
        <div style={row4}>
          <div style={label}>バッテリー</div>
          <input value={device.battery} onChange={e => setDevice({ ...device, battery: e.target.value })} placeholder="例) 100%" style={box} />
          <div style={label}>キャリア</div>
          <select value={device.carrier} onChange={e => setDevice({ ...device, carrier: e.target.value })} style={box}>
            <option value="">選択</option>
            {CARRIERS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <div style={label}>利用制限</div>
          <select value={device.restrict} onChange={e => setDevice({ ...device, restrict: e.target.value })} style={box}>
            <option value="">選択</option>
            {RESTRICTS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      </div>

      {/* ロック＆状態（1行 + メモ広め） */}
      <div style={section}>
        <div style={row4}>
          <div style={label}>箱・付属品</div>
          <select value={acc} onChange={e => setAcc(e.target.value)} style={box}>
            <option value="">選択</option>
            {ACCESSORIES.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
          <div style={label}>SIMロック</div>
          <select value={simLock} onChange={e => setSimLock(e.target.value)} style={box}>
            <option value="">選択</option>
            {LOCK_YN.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div style={{ height: 8 }} />
        <div style={row4}>
          <div style={label}>アクティベーションロック</div>
          <select value={actLock} onChange={e => setActLock(e.target.value)} style={box}>
            <option value="">選択</option>
            {LOCK_YN.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
          <div style={label}>状態</div>
          <select
            value={condition}
            onChange={e => setCondition(e.target.value)}
            style={{ ...box, width: '100%' }}
          >
            {CONDITIONS.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
          </select>
        </div>
        <div style={{ height: 8 }} />
        <div style={row2}>
          <div style={label}>状態メモ</div>
          <textarea
            placeholder="例）液晶傷あり／カメラ不良／FaceIDエラー など"
            value={conditionNote}
            onChange={e => setConditionNote(e.target.value)}
            style={{ ...box, height: 90, resize: 'vertical' }}
          />
        </div>
      </div>
    </div>
  )
}
