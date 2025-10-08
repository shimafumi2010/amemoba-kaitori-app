'use client'
import React, { useEffect, useMemo, useState } from 'react'

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
const LOCK_YN: SelectValue[] = ['無', '有', ''] // デフォは「無」側が左
const CONDITIONS: ConditionValue[] = ['S', 'A', 'B', 'C', 'D', 'ジャンク', '']

export default function AssessPage(): JSX.Element {
  // 1) ヘッダ
  const [staff, setStaff] = useState<typeof STAFFS[number]>('島野ひとみ')
  const [acceptedAt, setAcceptedAt] = useState<string>(() => {
    const d = new Date()
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  })

  // 2) お客様（Googleフォーム反映想定）
  const [customer, setCustomer] = useState<Customer>({
    name: '',
    furigana: '',
    address: '',
    phone: '',
    birthday: ''
  })

  // 3) 端末
  const [device, setDevice] = useState<Device>({
    model_name: '',
    capacity: '',
    color: '',
    model_number: '',
    imei: '',
    serial: '',
    battery: ''
  })

  // 4) 選択系
  const [acc, setAcc] = useState<SelectValue>('') // 箱・付属品
  const [simLock, setSimLock] = useState<SelectValue>('') // SIMロック
  const [actLock, setActLock] = useState<SelectValue>('') // アクティベーションロック
  const [condition, setCondition] = useState<ConditionValue>('B')
  const [conditionNote, setConditionNote] = useState('') // 状態の右空白

  // 5) 価格
  const [maxPrice, setMaxPrice] = useState<number | ''>('')
  const [estimatedPrice, setEstimatedPrice] = useState<number | ''>('')

  // 6) 利用制限 iFrame
  const imeiCheckerSrc = useMemo(() => {
    // サイト側の仕様で直接IMEIセットはできない想定なので、表示＋コピーで運用。
    // （クエリが効くようならここで ?imei=xxx を付ければOK）
    return `https://snowyskies.jp/imeiChecking/`
    // 強制再読み込みしたい時用に `?t=${Date.now()}` を付けてもOK
  }, [])

  // ▼ Googleフォームからの自動反映（例：電話番号で検索）
  //   ※ まだAPI未実装なのでボタンだけ用意。後で /api/customer/by-phone に繋ぎます。
  async function loadFromGoogleForm() {
    if (!customer.phone) {
      alert('電話番号を入力してください（Googleフォームから検索します）')
      return
    }
    try {
      // 将来実装：/api/customer/by-phone?phone=...
      // const res = await fetch(`/api/customer/by-phone?phone=${encodeURIComponent(customer.phone)}`)
      // const json = await res.json()
      // setCustomer({ ...customer, ...json.customer })
      alert('（ダミー）Googleフォーム検索は次のステップで繋ぎます。今は手入力で進めてください。')
    } catch (e: any) {
      alert('Googleフォームからの取得に失敗しました')
    }
  }

  // ▼ アメモバ 最大買取価格 取得
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
    if (data?.price != null) {
      setMaxPrice(Number(data.price))
    } else {
      alert('価格取得に失敗しました')
    }
  }

  // スタイル：A4意識（画面でも印刷でも崩れにくいように）
  const row = { display: 'grid', gridTemplateColumns: '160px 1fr 160px 1fr', gap: 8, alignItems: 'center' } as const
  const one = { display: 'grid', gridTemplateColumns: '160px 1fr', gap: 8, alignItems: 'center' } as const
  const section: React.CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, background: '#fff' }
  const label: React.CSSProperties = { fontWeight: 600, fontSize: 13 }
  const box: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8 }

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
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={customer.phone || ''} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} style={{ ...box, flex: 1 }} />
            <button onClick={loadFromGoogleForm} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd' }}>Googleフォームから反映</button>
          </div>
          <div style={label}>生年月日</div>
          <input type="date" value={customer.birthday || ''} onChange={(e) => setCustomer({ ...customer, birthday: e.target.value })} style={box} />
        </div>
      </div>

      {/* 端末情報 */}
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
        <div style={row}>
          <div style={label}>IMEI</div>
          <input value={device.imei || ''} onChange={(e) => setDevice({ ...device, imei: e.target.value })} style={box} />
          <div style={label}>シリアル</div>
          <input value={device.serial || ''} onChange={(e) => setDevice({ ...device, serial: e.target.value })} style={box} />
        </div>
        <div style={{ height: 8 }} />
        <div style={one}>
          <div style={label}>バッテリー</div>
          <input value={device.battery || ''} onChange={(e) => setDevice({ ...device, battery: e.target.value })} placeholder="例) 100%" style={box} />
        </div>
      </div>

      {/* 利用制限チェック */}
      <div style={section}>
        <div style={{ ...row, gridTemplateColumns: '160px 1fr' }}>
          <div style={label}>利用制限</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <a href={imeiCheckerSrc} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>
              snowyskies.jp（別タブで開く）
            </a>
            <span style={{ color: '#6b7280' }}>| IMEIをコピーしてサイトに貼り付け</span>
            <button
              onClick={async () => {
                if (device.imei) {
                  await navigator.clipboard.writeText(device.imei)
                  alert('IMEIをコピーしました')
                }
              }}
              style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #ddd' }}
            >
              IMEIコピー
            </button>
          </div>
        </div>
        <div style={{ height: 10 }} />
        <div style={{
          border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden',
          height: 420, background: '#f9fafb'
        }}>
          {/* Cross-Origin 制約があるため、アプリ側から直接入力を流し込むことは通常不可。
             UIとして iframe 埋め込み + コピー導線で運用。 */}
          <iframe src={imeiCheckerSrc} style={{ width: '100%', height: '100%', border: '0' }} />
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

      {/* フッター（印刷系は次のステップでPDF化に接続） */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          onClick={() => window.print()}
          style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #ddd', background: '#fff' }}
        >
          この画面を印刷（暫定）
        </button>
        <button
          onClick={() => alert('次のステップでPDF生成に接続します')}
          style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #0ea5e9', background: '#0ea5e9', color: '#fff' }}
        >
          PDF生成（次で実装）
        </button>
      </div>
    </div>
  )
}
