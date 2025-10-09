'use client'
import React, { useEffect, useMemo, useState } from 'react'
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

type GeoRow = { title: string; url?: string; carrier?: string; unused?: number; used?: number; unusedText?: string; usedText?: string }

const section: React.CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, background: '#fff' }
const label: React.CSSProperties = { fontWeight: 600, fontSize: 13 }
const box: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8 }
const row2 = { display: 'grid', gridTemplateColumns: '160px 1fr', gap: 10, alignItems: 'center' } as const
const row4 = { display: 'grid', gridTemplateColumns: '160px 1fr 160px 1fr', gap: 10, alignItems: 'center' } as const

export default function AssessForm(): JSX.Element {
  // ---- 状態変数 ----
  const [staff, setStaff] = useState('島野ひとみ')
  const [acceptedAt, setAcceptedAt] = useState(() => new Date().toISOString().slice(0, 10))
  const [customer, setCustomer] = useState({ name: '', kana: '', address: '', phone: '', birth: '' })
  const [device, setDevice] = useState({
    model_name: '', capacity: '', color: '', model_number: '',
    imei: '', serial: '', battery: '', carrier: '', restrict: ''
  })
  const [acc, setAcc] = useState(''); const [simLock, setSimLock] = useState(''); const [actLock, setActLock] = useState('')
  const [condition, setCondition] = useState('B'); const [conditionNote, setConditionNote] = useState('')
  const [maxPrice, setMaxPrice] = useState<number | ''>(''); const [discount, setDiscount] = useState<number | ''>(''); const [todayPrice, setTodayPrice] = useState<number>(0)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const max = typeof maxPrice === 'number' ? maxPrice : Number(maxPrice || 0)
    const disc = typeof discount === 'number' ? discount : Number(discount || 0)
    setTodayPrice(Math.max(0, max - disc))
  }, [maxPrice, discount])

  // ---- クリップボード解析（順番固定）----
  function parseByFixedOrder(text: string) {
    const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
    const out = { model_name: '', capacity: '', color: '', model_number: '', imei: '', serial: '', battery: '' }
    if (!lines.length) return out

    // 上部：機種名/容量/カラー
    const capRe = /\b\d+(?:\.\d+)?\s*(GB|TB)\b/i
    const capIdx = lines.findIndex(s => capRe.test(s))
    if (capIdx > 0) {
      out.capacity = lines[capIdx]
      out.model_name = lines[capIdx - 1] || ''
      out.color = lines[capIdx + 1] || ''
    }

    // モデル番号（Sales Model の後に来る英数字）
    const salesIdx = lines.findIndex(s => /^sales\s*model/i.test(s))
    if (salesIdx >= 0 && lines[salesIdx + 1]) out.model_number = lines[salesIdx + 1]

    // IMEI
    const imeiIdx = lines.findIndex(s => /^imei\b/i.test(s))
    if (imeiIdx >= 0) {
      const val = lines[imeiIdx + 1] || ''
      const match = val.replace(/\D+/g, '').match(/\d{15}/)
      if (match) out.imei = match[0]
    }

    // Serial Number
    const serialIdx = lines.findIndex(s => /^serial\s*number/i.test(s))
    if (serialIdx >= 0) {
      out.serial = (lines[serialIdx + 1] || '').replace(/[^0-9A-Za-z]/g, '').slice(0, 12)
    }

    // Battery Life or 100% Details
    const batIdx = lines.findIndex(s => /(battery\s*life|battery)/i.test(s))
    const batteryLine = lines.find(l => /%/.test(l))
    if (batIdx >= 0) {
      const next = lines[batIdx + 1] || ''
      const m = next.match(/(\d{2,3})%/)
      if (m) out.battery = m[1] + '%'
      else if (batteryLine) {
        const m2 = batteryLine.match(/(\d{2,3})%/)
        if (m2) out.battery = m2[1] + '%'
      }
    }

    // 軽い補正
    out.capacity = out.capacity.replace(/\s+/g, '').toUpperCase()
    out.model_number = out.model_number.replace(/\s+/g, ' ').trim()
    out.imei = normalizeIMEI(out.imei)
    out.serial = normalizeSerial(out.serial)
    return out
  }

  async function readFromClipboardAndApply() {
    try {
      const text = await navigator.clipboard.readText()
      if (!text.trim()) return alert('Snipping Toolで「すべてのテキストをコピー」した状態で押してください')
      const p = parseByFixedOrder(text)
      setDevice(d => ({ ...d, ...p }))
      setMessage('クリップボードから機種情報を反映しました')
    } catch (e: any) {
      alert('クリップボードの読み取りに失敗しました: ' + (e?.message ?? 'unknown'))
    }
  }

  // ---- Amemoba検索 ----
  function getModelPrefix(): string {
    const raw = (device.model_number || '').trim()
    return raw.split(/\s+/)[0] || ''
  }
  async function openAmemobaForSelectedCarrier() {
    const key = getModelPrefix()
    if (!key) return alert('モデル番号を入力してください')
    window.open(`https://amemoba.com/search/?search-word=${encodeURIComponent(key)}`, '_blank')
  }

  const modelPrefix = useMemo(() => getModelPrefix(), [device.model_number])

  // ---- JSX ----
  return (
    <div style={{ display: 'grid', gap: 16, padding: 16, maxWidth: 980, margin: '0 auto', background: '#f6f7fb' }}>
      <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, textAlign: 'center' }}>アメモバ買取 富山店　査定受付票</h2>

      {/* 受付 */}
      <div style={section}>
        <div style={row4}>
          <div style={label}>担当者</div>
          <select style={box as any} value={staff} onChange={(e) => setStaff(e.target.value)}>
            {STAFFS.map(s => <option key={s}>{s}</option>)}
          </select>
          <div style={label}>受付日</div>
          <input style={box as any} type="date" value={acceptedAt} onChange={(e) => setAcceptedAt(e.target.value)} />
        </div>
      </div>

      {/* 端末情報 */}
      <div style={section}>
        <div style={row4}>
          <div style={label}>機種名</div><input style={box as any} value={device.model_name} onChange={(e)=>setDevice({...device,model_name:e.target.value})}/>
          <div style={label}>容量</div><input style={box as any} value={device.capacity} onChange={(e)=>setDevice({...device,capacity:e.target.value})}/>
        </div>

        <div style={row4}>
          <div style={label}>カラー</div><input style={box as any} value={device.color} onChange={(e)=>setDevice({...device,color:e.target.value})}/>
          <div style={label}>モデル番号</div>
          <div style={{ display:'flex', gap:8 }}>
            <input style={box as any} value={device.model_number} onChange={(e)=>setDevice({...device,model_number:e.target.value})}/>
            <button onClick={readFromClipboardAndApply}
                    style={{ padding:'6px 10px', border:'1px solid #ddd', borderRadius:8 }}>
              3uToolsから機種情報読み取り
            </button>
          </div>
        </div>

        <div style={row4}>
          <div style={label}>IMEI</div>
          <input style={box as any} value={device.imei} onChange={(e)=>setDevice({...device,imei:e.target.value})}/>
          <div style={label}>シリアル</div>
          <input style={box as any} value={device.serial} onChange={(e)=>setDevice({...device,serial:e.target.value})}/>
        </div>

        <div style={row4}>
          <div style={label}>バッテリー</div>
          <input style={box as any} value={device.battery} onChange={(e)=>setDevice({...device,battery:e.target.value})}/>
          <div style={label}>キャリア</div>
          <select style={box as any} value={device.carrier} onChange={(e)=>setDevice({...device,carrier:e.target.value})}>
            <option value=""/>{CARRIERS.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>

        {message && <div style={{ marginTop:8, color:'#2563eb', fontSize:13 }}>{message}</div>}
      </div>

      {/* 価格 */}
      <div style={section}>
        <div style={row4}>
          <div style={label}>MAX買取価格</div><input style={box as any} value={maxPrice} onChange={(e)=>setMaxPrice(e.target.value as any)}/>
          <div style={label}>減額</div><input style={box as any} value={discount} onChange={(e)=>setDiscount(e.target.value as any)}/>
        </div>
        <div style={row2}><div style={label}>本日査定金額</div><input style={box as any} value={todayPrice} readOnly/></div>

        <button onClick={openAmemobaForSelectedCarrier}
                style={{ marginTop:10, padding:'8px 12px', border:'1px solid #ddd', borderRadius:8 }}>
          amemoba価格検索（{modelPrefix || '未入力'}）
        </button>
      </div>
    </div>
  )
}
