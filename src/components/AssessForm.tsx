'use client'
import React, { useRef, useState, useEffect } from 'react'
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

type GeoRow = { title: string; url?: string; carrier?: string; unused?: number; used?: number }

export default function AssessForm(): JSX.Element {
  const [staff, setStaff] = useState('島野ひとみ')
  const [acceptedAt, setAcceptedAt] = useState(() => new Date().toISOString().slice(0, 10))

  const [device, setDevice] = useState({
    model_name: '', capacity: '', color: '', model_number: '',
    imei: '', serial: '', battery: '',
    carrier: '', restrict: ''
  })

  const [acc, setAcc] = useState('')
  const [simLock, setSimLock] = useState('')
  const [actLock, setActLock] = useState('')
  const [condition, setCondition] = useState('B')
  const [conditionNote, setConditionNote] = useState('')

  const [maxPrice, setMaxPrice] = useState<number | ''>('')
  const [discount, setDiscount] = useState<number | ''>('')
  const [todayPrice, setTodayPrice] = useState<number>(0)

  // Geo(ゲオ)競合価格状態
  const [geoLoading, setGeoLoading] = useState(false)
  const [geoError, setGeoError] = useState<string | null>(null)
  const [geoResult, setGeoResult] = useState<GeoRow | null>(null)
  const [geoSearchUrl, setGeoSearchUrl] = useState<string | null>(null)

  const [imgBase64, setImgBase64] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const pasteRef = useRef<HTMLDivElement>(null)

  const section: React.CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, background: '#fff' }
  const label: React.CSSProperties = { fontWeight: 600, fontSize: 13 }
  const box: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8 }
  const row2 = { display: 'grid', gridTemplateColumns: '160px 1fr', gap: 10, alignItems: 'center' } as const
  const row4 = { display: 'grid', gridTemplateColumns: '160px 1fr 160px 1fr', gap: 10, alignItems: 'center' } as const

  useEffect(() => {
    const max = typeof maxPrice === 'number' ? maxPrice : Number(maxPrice || 0)
    const disc = typeof discount === 'number' ? discount : Number(discount || 0)
    setTodayPrice(Math.max(0, max - disc))
  }, [maxPrice, discount])

  function fileToBase64(file: File) {
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
      if (!res.ok) {
        let body = ''
        try { body = await res.text() } catch {}
        setMessage(`OCR失敗: HTTP ${res.status} ${res.statusText}${body ? ` / ${body.slice(0,180)}…` : ''}`)
        return
      }
      const json = await res.json()
      if (json?.ok === false) {
        setMessage(`OCR失敗: ${json?.error || 'unknown error'}`)
        return
      }
      const payload: any = json?.data ?? json?.result ?? json?.content ?? {}
      if (!payload || typeof payload !== 'object' || Object.keys(payload).length === 0) {
        setMessage('OCR失敗: 結果が空でした（項目を読み取れませんでした）')
        return
      }

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

      const warns = Array.isArray(json?.warnings) && json.warnings.length
        ? ` 注意: ${json.warnings.join(' / ')}`
        : ''
      setMessage('OCR完了：必要項目を反映しました。' + warns)
    } catch (e: any) {
      setMessage(`OCR失敗: ${e?.message ?? 'unknown'}`)
    }
  }

  function getModelPrefix(): string {
    const raw = (device.model_number || device.model_name || '').trim()
    if (!raw) return ''
    return raw.split(/\s+/)[0]
  }

  async function openAmemobaForSelectedCarrier() {
    const key = getModelPrefix()
    if (!key) {
      alert('モデル番号 または 機種名を入力してください')
      return
    }
    if (!device.carrier) {
      alert('キャリアを選択してください')
      return
    }

    const target = (() => {
      const c = device.carrier
      if (c.startsWith('au')) return 'au'
      if (/softbank/i.test(c)) return 'softbank'
      if (/docomo/i.test(c)) return 'docomo'
      if (/SIMフリー/.test(c) || /SIM/.test(c)) return 'simfree'
      return ''
    })()

    setMessage(`amemoba検索中…（${key} / ${device.carrier}）`)
    try {
      const res = await fetch('/api/amemoba-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: key })
      })
      const json = await res.json()
      if (!res.ok || json?.ok === false) {
        setMessage(`検索失敗: ${json?.error || `${res.status} ${res.statusText}`}`)
        const fallback = `https://amemoba.com/search/?search-word=${encodeURIComponent(key)}`
        window.open(fallback, '_blank', 'noopener,noreferrer')
        return
      }

      const results: Array<{ title: string; url: string; carrier?: string }> = json.results || []
      let hit = results.find(r => r.carrier === target)
      if (!hit && target) hit = results.find(r => (r.title || '').toLowerCase().includes(target))
      const url = hit?.url || json.searchUrl || `https://amemoba.com/search/?search-word=${encodeURIComponent(key)}`
      window.open(url, '_blank', 'noopener,noreferrer')
      setMessage(hit ? `検索完了：${device.carrier} に一致するリンクを開きました` : '検索完了：一覧を開きました')
    } catch (e: any) {
      setMessage(`検索失敗: ${e?.message ?? 'unknown'}`)
      const url = `https://amemoba.com/search/?search-word=${encodeURIComponent(key)}`
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }

  // --- 競合価格（ゲオ）取得 ---
  async function fetchGeo() {
    const key = getModelPrefix()
    setGeoError(null)
    setGeoResult(null)
    setGeoLoading(true)
    try {
      const res = await fetch('/api/geo-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: key })
      })
      const json = await res.json()
      setGeoSearchUrl(json?.searchUrl ?? null)
      if (!res.ok || json?.ok === false) {
        setGeoError(json?.error || `${res.status} ${res.statusText}`)
        setGeoLoading(false)
        return
      }
      const results: GeoRow[] = json.results || []
      const target = (() => {
        const c = device.carrier
        if (c.startsWith('au')) return 'au'
        if (/softbank/i.test(c)) return 'softbank'
        if (/docomo/i.test(c)) return 'docomo'
        if (/SIMフリー/.test(c) || /SIM/.test(c)) return 'simfree'
        return ''
      })()

      let hit: GeoRow | null =
        results.find(r => r.carrier === target) ||
        results.find(r => (r.title || '').toLowerCase().includes(target)) ||
        results[0] || null

      setGeoResult(hit)
    } catch (e: any) {
      setGeoError(e?.message ?? 'unknown')
    } finally {
      setGeoLoading(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 16, padding: 16, maxWidth: 980, margin: '0 auto', background: '#f6f7fb' }}>
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

      {/* 価格ボックス + amemoba検索 & 競合価格（ゲオ） */}
      <div style={section}>
        <div style={row4}>
          <div style={label}>MAX買取価格</div>
          <input
            value={maxPrice === '' ? '' : maxPrice}
            onChange={e => setMaxPrice(e.target.value ? Number(e.target.value) : '')}
            inputMode="numeric"
            placeholder="例) 51000"
            style={box}
          />
          <div style={label}>減額（合計）</div>
          <input
            value={discount === '' ? '' : discount}
            onChange={e => setDiscount(e.target.value ? Number(e.target.value) : '')}
            inputMode="numeric"
            placeholder="例) 3000"
            style={box}
          />
        </div>
        <div style={{ height: 8 }} />
        <div style={row2}>
          <div style={label}>本日査定金額</div>
          <input
            value={todayPrice.toLocaleString()}
            readOnly
            style={{ ...box, background: '#f9fafb', fontWeight: 700 }}
          />
        </div>

        <div style={{ height: 12 }} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {/* 左：amemoba価格検索 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={openAmemobaForSelectedCarrier}
                    style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd' }}>
              amemoba価格検索（{getModelPrefix() || 'キーワード未入力'} / {device.carrier || 'キャリア未選択'}）
            </button>
            <div style={{ color: '#6b7280', fontSize: 12 }}>
              例：<b>MLJH3 J/A</b> → <b>MLJH3</b> で検索
            </div>
          </div>

          {/* 右：競合価格（ゲオ） */}
          <div style={{ border: '1px dashed #d1d5db', borderRadius: 10, padding: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{ fontWeight: 700 }}>競合価格（ゲオ）</div>
              <button
                onClick={fetchGeo}
                disabled={!getModelPrefix()}
                title="モデル番号の前半で検索して価格を取得"
                style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #ddd' }}
              >
                {geoLoading ? '更新中…' : '更新'}
              </button>
              {geoSearchUrl &&
                <a href={geoSearchUrl} target="_blank" rel="noreferrer" style={{ color: '#2563eb', fontSize: 12 }}>
                  検索ページを開く
                </a>
              }
            </div>
            {geoError && <div style={{ color: '#b91c1c', fontSize: 12 }}>取得失敗：{geoError}</div>}
            {!geoError && geoResult && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, fontSize: 14 }}>
                <div><span style={{ color: '#6b7280' }}>キャリア：</span>{geoResult.carrier || '不明'}</div>
                <div><span style={{ color: '#6b7280' }}>未使用：</span>{geoResult.unused ? `¥${geoResult.unused.toLocaleString()}` : '-'}</div>
                <div><span style={{ color: '#6b7280' }}>中古：</span>{geoResult.used ? `¥${geoResult.used.toLocaleString()}` : '-'}</div>
                <div style={{ gridColumn: '1 / -1', fontSize: 12 }}>
                  <span style={{ color: '#6b7280' }}>商品：</span>
                  {geoResult.url
                    ? <a href={geoResult.url} target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>{geoResult.title}</a>
                    : geoResult.title}
                </div>
              </div>
            )}
            {!geoError && !geoResult && !geoLoading && (
              <div style={{ color: '#6b7280', fontSize: 12 }}>未取得（「更新」を押してください）</div>
            )}
          </div>
        </div>
      </div>

      {/* ロック＆状態 */}
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
          <select value={condition} onChange={e => setCondition(e.target.value)} style={box}>
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
