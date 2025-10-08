'use client'
import React, { useEffect, useRef, useState } from 'react'
import { normalizeIMEI, normalizeSerial } from '../lib/ocrPostprocess'

type Customer = {
  name: string
  furigana?: string
  address?: string
  phone?: string
  birthday?: string // YYYY-MM-DD
}

type Device = {
  model_name?: string
  capacity?: string
  color?: string
  model_number?: string
  imei?: string
  serial?: string
  battery?: string
}

type SelectValue = '有' | '無' | ''
type ConditionValue = 'S' | 'A' | 'B' | 'C' | 'D' | 'ジャンク' | ''

const STAFFS = ['島野文宏', '島野ひとみ', '中田颯', '（その他）'] as const
const ACCESSORIES: SelectValue[] = ['有', '無', '']
const LOCK_YN: SelectValue[] = ['無', '有', '']
const CONDITIONS: ConditionValue[] = ['S', 'A', 'B', 'C', 'D', 'ジャンク', '']

export default function AssessForm(): JSX.Element {
  // ヘッダ
  const [staff, setStaff] = useState<typeof STAFFS[number]>('島野ひとみ')
  const [acceptedAt, setAcceptedAt] = useState<string>(() => {
    const d = new Date()
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  })

  // お客様
  const [customer, setCustomer] = useState<Customer>({
    name: '', furigana: '', address: '', phone: '', birthday: ''
  })

  // 端末
  const [device, setDevice] = useState<Device>({
    model_name: '', capacity: '', color: '', model_number: '', imei: '', serial: '', battery: ''
  })

  // 選択系
  const [acc, setAcc] = useState<SelectValue>('') // 箱・付属品
  const [simLock, setSimLock] = useState<SelectValue>('') // SIMロック
  const [actLock, setActLock] = useState<SelectValue>('') // アクティベーションロック
  const [condition, setCondition] = useState<ConditionValue>('B')
  const [conditionNote, setConditionNote] = useState('') // 状態の右空白

  // 金額
  const [maxPrice, setMaxPrice] = useState<number | ''>('')
  const [estimatedPrice, setEstimatedPrice] = useState<number | ''>('')

  // OCR用
  const [imgBase64, setImgBase64] = useState<string | null>(null)
  const [message, setMessage] = useState<string>('')
  const pasteRef = useRef<HTMLDivElement>(null)

  // 共通UIスタイル
  const row = { display: 'grid', gridTemplateColumns: '160px 1fr 160px 1fr', gap: 8, alignItems: 'center' } as const
  const one = { display: 'grid', gridTemplateColumns: '160px 1fr', gap: 8, alignItems: 'center' } as const
  const section: React.CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, background: '#fff' }
  const label: React.CSSProperties = { fontWeight: 600, fontSize: 13 }
  const box: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8 }

  // 便利関数
  async function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
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

  async function copyAndOpen(text: string | undefined, url: string, emptyMsg: string) {
    const v = (text || '').trim()
    if (!v) {
      alert(emptyMsg)
      return
    }
    try {
      await navigator.clipboard.writeText(v)
      window.open(url, '_blank', 'noopener')
    } catch {
      window.open(url, '_blank', 'noopener')
    }
  }

  async function fetchMaxPrice() {
    const key = device.model_number || device.model_name
    if (!key) {
      alert('機種名またはモデル番号を入力してください')
      return
    }
    const res = await fetch('/api/price', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: key })
    })
    const data = await res.json()
    if (data?.price != null) setMaxPrice(Number(data.price))
    else alert('価格取得に失敗しました')
  }

  // ===== OCR実行 =====
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
      if (!json.ok) {
        setMessage(`OCR失敗: ${json.error || 'unknown'}`)
        return
      }

      // APIの返しの形に幅を持たせる
      const content = json?.result ?? json?.data ?? json?.content ?? json
      const parsed: any =
        typeof content === 'string'
          ? (() => { try { return JSON.parse(content) } catch { return {} } })()
          : content || {}

      // ★ 正規化（normalizeIMEI / normalizeSerial は string を返す）
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
      {/* タイトル */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 22, fontWeight: 700 }}>アメモバ買取 富山店　査定受付票</div>
      </div>

      {/* ヘッダ */}
      <div style={section}>
        <div style={row}>
          <div style={label}>担当者</div>
          <select value={staff} onChange={(e) => setStaff(e.target.value as any)} style={box}>
            {STAFFS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <div style={label}>受付日</div>
          <input type="date" value={acceptedAt} onChange={(e) => setAcceptedAt(e.target.value)} style={box} />
        </div>
      </div>

      {/* お客様情報 */}
      <div style={section}>
        <div style={{ ...row, gridTemplateColumns: '160px 1fr 160px 1fr' }}>
          <div style={label}>お名前</div>
          <input value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} style={box} />
          <div style={label}>フリガナ</div>
          <input value={customer.furigana || ''} onChange={(e) => setCustomer({ ...customer, furigana: e.target.value })} style={box} />
        </div>
        <div style={{ height: 8 }} />
        <div style={one}>
          <div style={label}>ご住所</div>
          <input value={customer.address || ''} onChange={(e) => setCustomer({ ...customer, address: e.target.value })} style={box} />
        </div>
        <div style={{ height: 8 }} />
        <div style={row}>
          <div style={label}>電話番号</div>
          <input value={customer.phone || ''} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} style={box} />
          <div style={label}>生年月日</div>
          <input type="date" value={customer.birthday || ''} onChange={(e) => setCustomer({ ...customer, birthday: e.target.value })} style={box} />
        </div>
      </div>

      {/* 3uTools貼り付け → OCR */}
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
            title="ここをクリックして Ctrl+V で貼り付け（Snipping Tool可）"
          >
            {imgBase64
              ? <img src={imgBase64} alt="preview" style={{ maxWidth: '100%', borderRadius: 6 }} />
              : <div>ここをクリック → Ctrl + V でスクショを貼り付け</div>
            }
          </div>
        </div>
        <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
          <button onClick={runOCR} disabled={!imgBase64} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd' }}>OCR実行</button>
          {message && <div style={{ alignSelf:'center', color:'#374151' }}>{message}</div>}
        </div>
      </div>

      {/* 端末情報（OCR反映先） */}
      <div style={section}>
        <div style={row}>
          <div style={label}>機種名</div>
          <input value={device.model_name || ''} onChange={(e) => setDevice({ ...device, model_name: e.target.value })} style={box} />
          <div style={label}>容量</div>
          <input value={device.capacity || ''} onChange={(e) => setDevice({ ...device, capacity: e.target.value })} style={box} />
        </div>
        <div style={{ height: 8 }} />
        <div style={row}>
          <div style={label}>カラー</div>
          <input value={device.color || ''} onChange={(e) => setDevice({ ...device, color: e.target.value })} style={box} />
          <div style={label}>モデル番号</div>
          <input value={device.model_number || ''} onChange={(e) => setDevice({ ...device, model_number: e.target.value })} style={box} />
        </div>
        <div style={{ height: 8 }} />

        {/* IMEI + 利用制限確認 */}
        <div style={row}>
          <div style={label}>IMEI</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={device.imei || ''}
              onChange={(e) => setDevice({ ...device, imei: e.target.value })}
              style={{ ...box, flex: 1 }}
            />
            <button
              type="button"
              onClick={() =>
                copyAndOpen(device.imei, 'https://snowyskies.jp/imeiChecking/', 'IMEI を入力してください')
              }
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', whiteSpace: 'nowrap' }}
              title="IMEIをコピーして、利用制限サイトを別タブで開きます"
            >
              利用制限確認
            </button>
          </div>

          {/* シリアル + 保証状態確認 */}
          <div style={label}>シリアル</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={device.serial || ''}
              onChange={(e) => setDevice({ ...device, serial: e.target.value })}
              style={{ ...box, flex: 1 }}
            />
            <button
              type="button"
              onClick={() =>
                copyAndOpen(
                  device.serial,
                  'https://checkcoverage.apple.com/?locale=ja_JP',
                  'シリアル番号を入力してください'
                )
              }
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', whiteSpace: 'nowrap' }}
              title="シリアルをコピーして、Apple保証確認ページを別タブで開きます"
            >
              保証状態確認
            </button>
          </div>
        </div>

        <div style={{ height: 8 }} />
        <div style={one}>
          <div style={label}>バッテリー</div>
          <input value={device.battery || ''} onChange={(e) => setDevice({ ...device, battery: e.target.value })} placeholder="例) 100%" style={box} />
        </div>
      </div>

      {/* 選択系 */}
      <div style={section}>
        <div style={row}>
          <div style={label}>箱・付属品</div>
          <select value={acc} onChange={(e) => setAcc(e.target.value as SelectValue)} style={box}>
            {ACCESSORIES.map(v => <option key={v} value={v}>{v || '選択'}</option>)}
          </select>
          <div style={label}>SIMロック</div>
          <select value={simLock} onChange={(e) => setSimLock(e.target.value as SelectValue)} style={box}>
            {LOCK_YN.map(v => <option key={v} value={v}>{v || '選択'}</option>)}
          </select>
        </div>
        <div style={{ height: 8 }} />
        <div style={row}>
          <div style={label}>アクティベーションロック</div>
          <select value={actLock} onChange={(e) => setActLock(e.target.value as SelectValue)} style={box}>
            {LOCK_YN.map(v => <option key={v} value={v}>{v || '選択'}</option>)}
          </select>
          <div style={label}>状態</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <select value={condition} onChange={(e) => setCondition(e.target.value as ConditionValue)} style={{ ...box, width: 140 }}>
              {CONDITIONS.map(v => <option key={v} value={v}>{v || '選択'}</option>)}
            </select>
            <input
              placeholder="例）液晶傷あり／カメラ不良"
              value={conditionNote}
              onChange={(e) => setConditionNote(e.target.value)}
              style={{ ...box, flex: 1 }}
            />
          </div>
        </div>
      </div>

      {/* 金額 */}
      <div style={section}>
        <div style={row}>
          <div style={label}>MAX買取価格</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              value={maxPrice === '' ? '' : maxPrice}
              onChange={(e) => setMaxPrice(e.target.value ? Number(e.target.value) : '')}
              inputMode="numeric"
              style={{ ...box, width: 240 }}
              placeholder="例) 51000"
            />
            <button onClick={fetchMaxPrice} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd' }}>自動取得（アメモバ）</button>
          </div>

          <div style={label}>査定金額</div>
          <input
            value={estimatedPrice === '' ? '' : estimatedPrice}
            onChange={(e) => setEstimatedPrice(e.target.value ? Number(e.target.value) : '')}
            inputMode="numeric"
            style={box}
            placeholder="例) 48000"
          />
        </div>
      </div>

      {/* 印刷（暫定） */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          onClick={() => window.print()}
          style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #ddd', background: '#fff' }}
        >
          この画面を印刷（暫定）
        </button>
      </div>
    </div>
  )
}
