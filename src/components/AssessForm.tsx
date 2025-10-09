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

type GeoRow = {
  title: string
  url?: string
  carrier?: string
  unused?: number
  used?: number
  unusedText?: string
  usedText?: string
}

const section: React.CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, background: '#fff' }
const label: React.CSSProperties = { fontWeight: 600, fontSize: 13 }
const box: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8 }
const row2 = { display: 'grid', gridTemplateColumns: '160px 1fr', gap: 10, alignItems: 'center' } as const
const row4 = { display: 'grid', gridTemplateColumns: '160px 1fr 160px 1fr', gap: 10, alignItems: 'center' } as const

export default function AssessForm(): JSX.Element {
  // 受付
  const [staff, setStaff] = useState('島野ひとみ')
  const [acceptedAt, setAcceptedAt] = useState(() => new Date().toISOString().slice(0, 10))

  // お客様情報（今は手入力；将来フォーム連携）
  const [customerSelect, setCustomerSelect] = useState('（最新が先頭）')
  const [customer, setCustomer] = useState({ name: '', kana: '', address: '', phone: '', birth: '' })

  // 端末
  const [device, setDevice] = useState({
    model_name: '', capacity: '', color: '', model_number: '',
    imei: '', serial: '', battery: '', carrier: '', restrict: ''
  })

  // 状態/付属品
  const [acc, setAcc] = useState(''); const [simLock, setSimLock] = useState(''); const [actLock, setActLock] = useState('')
  const [condition, setCondition] = useState('B'); const [conditionNote, setConditionNote] = useState('')

  // 価格
  const [maxPrice, setMaxPrice] = useState<number | ''>(''); const [discount, setDiscount] = useState<number | ''>(''); const [todayPrice, setTodayPrice] = useState<number>(0)

  // 競合（ゲオ）
  const [geoLoading, setGeoLoading] = useState(false)
  const [geoError, setGeoError] = useState<string | null>(null)
  const [geoResult, setGeoResult] = useState<GeoRow | null>(null)
  const [geoSearchUrl, setGeoSearchUrl] = useState<string | null>(null)

  // メッセージ
  const [message, setMessage] = useState('')

  useEffect(() => {
    const max = typeof maxPrice === 'number' ? maxPrice : Number(maxPrice || 0)
    const disc = typeof discount === 'number' ? discount : Number(discount || 0)
    setTodayPrice(Math.max(0, max - disc))
  }, [maxPrice, discount])

  // ========= クリップボード（Snipping Tool: すべてのテキストをコピー） =========

  // 1) ラベルに基づいて値を拾う（頑健）
  function parseByLabels(text: string) {
    const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
    const out = { model_name: '', capacity: '', color: '', model_number: '', imei: '', serial: '', battery: '' }
    if (!lines.length) return out

    // ヘッダー（"Fully Charged" の前）
    const idxFully = lines.findIndex(s => /fully\s+charged/i.test(s))
    const head = (idxFully > 0 ? lines.slice(0, idxFully) : lines).filter(Boolean)
    const capRe = /\b(\d+(?:\.\d+)?)\s*(GB|TB)\b/i
    const capIdx = head.findIndex(s => capRe.test(s))
    if (capIdx >= 0) {
      const m = head[capIdx].match(capRe)!
      out.capacity = `${m[1]}${m[2].toUpperCase()}`
      const nameIdx = head.slice(0, capIdx).findIndex(Boolean)
      if (nameIdx >= 0) out.model_name = head[nameIdx]
      const colorIdx = head.slice(capIdx + 1).findIndex(Boolean)
      if (colorIdx >= 0) out.color = head[capIdx + 1 + colorIdx]
    } else {
      out.model_name = head[0] || ''
      out.capacity = head[1] || ''
      out.color = head[2] || ''
    }

    const getAfter = (re: RegExp) => {
      const i = lines.findIndex(s => re.test(s))
      if (i === -1) return ''
      for (let j = i + 1; j < Math.min(lines.length, i + 6); j++) {
        const v = lines[j]
        if (v && !re.test(v)) return v
      }
      return ''
    }

    out.model_number = getAfter(/^(sales\s*model|model)\b/i) || out.model_number
    const imeiRaw = getAfter(/^imei\b/i)
    if (imeiRaw) out.imei = (imeiRaw.match(/\d{15}/) || [''])[0]
    const serRaw = getAfter(/^(serial\s*number|serial)\b/i)
    if (serRaw) out.serial = serRaw.replace(/[^0-9a-z]/gi, '').slice(0, 12)
    const batRaw = getAfter(/^(battery\s*life|battery)\b/i)
    if (batRaw) {
      const m = batRaw.match(/(\d{2,3})\s*%?/)
      if (m) out.battery = `${m[1]}%`
    }

    // 正規化
    if (out.capacity) out.capacity = out.capacity.replace(/\s+/g, '').replace(/ＴＢ/gi, 'TB').replace(/ＧＢ/gi, 'GB')
    if (out.model_number) out.model_number = out.model_number.replace(/\s{2,}/g, ' ').trim()
    out.imei = normalizeIMEI(out.imei) || out.imei
    out.serial = normalizeSerial(out.serial) || out.serial
    return out
  }

  // 2) 「順番」に基づくフォールバック（近い画像なら順序は安定前提）
  function parseByOrder(text: string) {
    // 例：機種名 → 容量 → カラー → Fully Charged → 100 → … → Sales Model → 値 → … → IMEI → 値 → Serial Number → 値 → Battery Life → 値 …
    const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
    const out = { model_name: '', capacity: '', color: '', model_number: '', imei: '', serial: '', battery: '' }
    if (!lines.length) return out

    // 上部3値（容量の GB/TB を鍵に）
    const capRe = /\b(\d+(?:\.\d+)?)\s*(GB|TB)\b/i
    const capIdx = lines.findIndex(s => capRe.test(s))
    if (capIdx >= 0) {
      const m = lines[capIdx].match(capRe)!
      out.capacity = `${m[1]}${m[2].toUpperCase()}`
      // 容量の直前を機種名、直後をカラーで推定（充電/数値はスキップ）
      for (let i = capIdx - 1; i >= 0; i--) {
        if (lines[i] && !/^\d+%?$|^fully\s+charged$/i.test(lines[i])) { out.model_name = lines[i]; break }
      }
      for (let i = capIdx + 1; i < Math.min(lines.length, capIdx + 6); i++) {
        if (lines[i] && !/^\d+%?$|^fully\s+charged$/i.test(lines[i])) { out.color = lines[i]; break }
      }
    } else {
      out.model_name = lines[0] || ''
      out.capacity  = lines[1] || ''
      out.color     = lines[2] || ''
    }

    // ラベル→値（隣の行）想定
    const takeAfterLabel = (label: string) => {
      const i = lines.findIndex(s => s.toLowerCase() === label)
      return i >= 0 && i + 1 < lines.length ? lines[i + 1] : ''
    }
    out.model_number = takeAfterLabel('sales model') || takeAfterLabel('model') || out.model_number
    const imeiRaw = takeAfterLabel('imei')
    if (imeiRaw) out.imei = (imeiRaw.match(/\d{15}/) || [''])[0]
    const serRaw = takeAfterLabel('serial number') || takeAfterLabel('serial')
    if (serRaw) out.serial = serRaw.replace(/[^0-9a-z]/gi, '').slice(0, 12)
    const batRaw = takeAfterLabel('battery life') || takeAfterLabel('battery')
    if (batRaw) {
      const m = batRaw.match(/(\d{2,3})\s*%?/)
      if (m) out.battery = `${m[1]}%`
    }

    if (out.capacity) out.capacity = out.capacity.replace(/\s+/g, '').replace(/ＴＢ/gi, 'TB').replace(/ＧＢ/gi, 'GB')
    if (out.model_number) out.model_number = out.model_number.replace(/\s{2,}/g, ' ').trim()
    out.imei = normalizeIMEI(out.imei) || out.imei
    out.serial = normalizeSerial(out.serial) || out.serial
    return out
  }

  async function readFromClipboardAndApply() {
    try {
      const text = await navigator.clipboard.readText()
      if (!text || !text.trim()) {
        alert('クリップボードにテキストがありません（Snipping Toolで「すべてのテキストをコピー」を実行してください）')
        return
      }
      // まずはラベル解析 → ダメなら順序解析
      const byLabels = parseByLabels(text)
      const mergedOk = (v: string) => v && v.trim().length > 0
      const byOrder = parseByOrder(text)
      const result = {
        model_name:  mergedOk(byLabels.model_name)  ? byLabels.model_name  : byOrder.model_name,
        capacity:    mergedOk(byLabels.capacity)    ? byLabels.capacity    : byOrder.capacity,
        color:       mergedOk(byLabels.color)       ? byLabels.color       : byOrder.color,
        model_number:mergedOk(byLabels.model_number)? byLabels.model_number: byOrder.model_number,
        imei:        mergedOk(byLabels.imei)        ? byLabels.imei        : byOrder.imei,
        serial:      mergedOk(byLabels.serial)      ? byLabels.serial      : byOrder.serial,
        battery:     mergedOk(byLabels.battery)     ? byLabels.battery     : byOrder.battery,
      }

      setDevice(d => ({
        ...d,
        model_name: result.model_name || d.model_name,
        capacity: result.capacity || d.capacity,
        color: result.color || d.color,
        model_number: result.model_number || d.model_number, // 例：MWC62 J/A（フル）
        imei: result.imei || d.imei,
        serial: result.serial || d.serial,
        battery: result.battery || d.battery,
      }))
      setMessage('クリップボードのテキストから反映しました')
    } catch (e: any) {
      setMessage(`クリップボード読み取りに失敗しました：${e?.message ?? 'unknown'}`)
    }
  }

  // ========= 価格・検索系 =========

  function getModelPrefix(): string {
    const raw = (device.model_number || device.model_name || '').trim()
    if (!raw) return ''
    return raw.split(/\s+/)[0] // 先頭トークン（例：MWC62）
  }

  async function openAmemobaForSelectedCarrier() {
    const key = getModelPrefix()
    if (!key) return alert('モデル番号 または 機種名を入力してください')
    if (!device.carrier) return alert('キャリアを選択してください')

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
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: key })
      })
      const json = await res.json()
      if (!res.ok || json?.ok === false) {
        setMessage(`検索失敗: ${json?.error || `${res.status} ${res.statusText}`}`)
        const fallback = `https://amemoba.com/search/?search-word=${encodeURIComponent(key)}`
        window.open(fallback, '_blank', 'noopener,noreferrer'); return
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

  async function fetchGeo() {
    const key = getModelPrefix()
    setGeoError(null); setGeoResult(null); setGeoLoading(true)
    try {
      const res = await fetch('/api/geo-prices', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: key }),
      })
      const text = await res.text()
      let json: any = null
      try { json = JSON.parse(text) } catch {
        setGeoError(`応答がJSONではありません: HTTP ${res.status} ${res.statusText} / ${text.slice(0, 140)}…`)
        setGeoLoading(false); return
      }
      setGeoSearchUrl(json?.searchUrl ?? null)
      if (!res.ok || json?.ok === false) {
        setGeoError(json?.error || `HTTP ${res.status} ${res.statusText}`)
        setGeoLoading(false); return
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
      const hit =
        results.find(r => r.carrier === target) ||
        results.find(r => (r.title || '').toLowerCase().includes(target)) ||
        results[0] || null
      setGeoResult(hit)
    } catch (e: any) {
      setGeoError(e?.message ?? 'unknown')
    } finally { setGeoLoading(false) }
  }

  async function copyAndOpen(text: string, url: string) {
    try { if (text) await navigator.clipboard.writeText(text) } catch {}
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const modelPrefix = useMemo(() => getModelPrefix(), [device.model_number, device.model_name])

  return (
    <div style={{ display: 'grid', gap: 16, padding: 16, maxWidth: 980, margin: '0 auto', background: '#f6f7fb' }}>
      <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, textAlign: 'center' }}>アメモバ買取 富山店　査定受付票</h2>

      {/* 受付 */}
      <div style={section}>
        <div style={row4}>
          <div style={label}>担当者</div>
          <select style={box as any} value={staff} onChange={(e) => setStaff(e.target.value)}>
            {STAFFS.map(s => (<option key={s} value={s}>{s}</option>))}
          </select>
          <div style={label}>受付日</div>
          <input style={box as any} type="date" value={acceptedAt} onChange={(e) => setAcceptedAt(e.target.value)} />
        </div>
      </div>

      {/* お客様情報 */}
      <div style={section}>
        <div style={row4}>
          <div style={label}>お客様選択</div>
          <select style={box as any} value={customerSelect} onChange={(e) => setCustomerSelect(e.target.value)}>
            <option>（最新が先頭）</option>
          </select>
          <div style={{ ...label }}>（ヒント）</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>フォーム連携は今後追加。手入力でもOKです。</div>
        </div>
        <div style={{ height: 8 }} />
        <div style={row2}><div style={label}>お名前</div><input style={box as any} value={customer.name} onChange={(e)=>setCustomer({...customer,name:e.target.value})}/></div>
        <div style={row2}><div style={label}>フリガナ</div><input style={box as any} value={customer.kana} onChange={(e)=>setCustomer({...customer,kana:e.target.value})}/></div>
        <div style={row2}><div style={label}>ご住所</div><input style={box as any} value={customer.address} onChange={(e)=>setCustomer({...customer,address:e.target.value})}/></div>
        <div style={row4}>
          <div style={label}>電話番号</div><input style={box as any} value={customer.phone} onChange={(e)=>setCustomer({...customer,phone:e.target.value})}/>
          <div style={label}>生年月日</div><input style={box as any} type="date" value={customer.birth} onChange={(e)=>setCustomer({...customer,birth:e.target.value})}/>
        </div>
      </div>

      {/* 端末情報（クリップボード読み取りボタンを設置） */}
      <div style={section}>
        <div style={row4}>
          <div style={label}>機種名</div><input style={box as any} value={device.model_name} onChange={(e)=>setDevice({...device,model_name:e.target.value})}/>
          <div style={label}>容量</div><input style={box as any} value={device.capacity} onChange={(e)=>setDevice({...device,capacity:e.target.value})}/>
        </div>
        <div style={{ height: 8 }} />
        <div style={row4}>
          <div style={label}>カラー</div><input style={box as any} value={device.color} onChange={(e)=>setDevice({...device,color:e.target.value})}/>
          <div style={label}>モデル番号</div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <input style={box as any} value={device.model_number} onChange={(e)=>setDevice({...device,model_number:e.target.value})}/>
            <button
              onClick={readFromClipboardAndApply}
              style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #ddd', whiteSpace:'nowrap' }}
              title="Snipping Tool → すべてのテキストをコピー を実行してから押す"
            >
              3uToolsから機種情報読み取り
            </button>
          </div>
        </div>

        <div style={row4}>
          <div style={label}>IMEI</div>
          <input style={box as any} value={device.imei} onChange={(e)=>setDevice({...device,imei:e.target.value})}/>
          <div />
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={()=>copyAndOpen(device.imei,'https://snowyskies.jp/imeiChecking/')}
                    style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #ddd' }}>
              利用制限確認
            </button>
          </div>
        </div>

        <div style={row4}>
          <div style={label}>シリアル</div>
          <input style={box as any} value={device.serial} onChange={(e)=>setDevice({...device,serial:e.target.value})}/>
          <div />
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={()=>copyAndOpen(device.serial,'https://checkcoverage.apple.com/?locale=ja_JP')}
                    style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #ddd' }}>
              保証状態確認
            </button>
          </div>
        </div>

        <div style={row4}>
          <div style={label}>バッテリー</div>
          <input style={box as any} placeholder="例）100%" value={device.battery} onChange={(e)=>setDevice({...device,battery:e.target.value})}/>
          <div style={label}>キャリア</div>
          <select style={box as any} value={device.carrier} onChange={(e)=>setDevice({...device,carrier:e.target.value})}>
            <option value=""/>{CARRIERS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div style={row4}>
          <div style={label}>利用制限</div>
          <select style={box as any} value={device.restrict} onChange={(e)=>setDevice({...device,restrict:e.target.value})}>
            <option value=""/>{RESTRICTS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <div/><div/>
        </div>

        {message && <div style={{ marginTop:8, color:'#2563eb', fontSize:13 }}>{message}</div>}
      </div>

      {/* 価格・検索・競合価格 */}
      <div style={section}>
        <div style={row4}>
          <div style={label}>MAX買取価格</div><input style={box as any} placeholder="例）51000" value={maxPrice} onChange={(e)=>setMaxPrice(e.target.value as any)}/>
          <div style={label}>減額（合計）</div><input style={box as any} placeholder="例）3000" value={discount} onChange={(e)=>setDiscount(e.target.value as any)}/>
        </div>
        <div style={{ height: 8 }} />
        <div style={row2}><div style={label}>本日査定金額</div><input style={box as any} value={todayPrice} readOnly/></div>

        <div style={{ height: 10 }} />
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <button onClick={openAmemobaForSelectedCarrier}
                    style={{ padding:'8px 12px', borderRadius:8, border:'1px solid #ddd' }}>
              amemoba価格検索（{modelPrefix || 'キーワード未入力'} / {device.carrier || 'キャリア未選択'}）
            </button>
            <div style={{ color:'#6b7280', fontSize:12 }}>例：MWC62 J/A → 検索は MWC62</div>
          </div>

          <div style={{ border:'1px dashed #d1d5db', borderRadius:10, padding:8 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
              <div style={{ fontWeight:700 }}>競合価格（ゲオ）</div>
              <button onClick={fetchGeo} disabled={!modelPrefix} style={{ padding:'4px 8px', borderRadius:6, border:'1px solid #ddd' }}>
                {geoLoading ? '更新中…' : '更新'}
              </button>
              {geoSearchUrl && <a href={geoSearchUrl} target="_blank" rel="noreferrer" style={{ color:'#2563eb', fontSize:12 }}>検索ページ</a>}
            </div>

            {geoError && <div style={{ color:'#b91c1c', fontSize:12 }}>取得失敗：{geoError}</div>}

            {!geoError && geoResult && (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6, fontSize:14 }}>
                <div><span style={{ color:'#6b7280' }}>キャリア：</span>{geoResult.carrier || '不明'}</div>
                <div><span style={{ color:'#6b7280' }}>未使用：</span>
                  {geoResult.unusedText ? `¥${geoResult.unusedText}` : (geoResult.unused ? `¥${geoResult.unused.toLocaleString()}` : '-')}
                </div>
                <div><span style={{ color:'#6b7280' }}>中古：</span>
                  {geoResult.usedText ? `¥${geoResult.usedText}` : (geoResult.used ? `¥${geoResult.used.toLocaleString()}` : '-')}
                </div>
                <div style={{ gridColumn:'1 / -1', fontSize:12 }}>
                  <span style={{ color:'#6b7280' }}>商品：</span>
                  {geoResult.url
                    ? <a href={geoResult.url} target="_blank" rel="noreferrer" style={{ color:'#2563eb' }}>{geoResult.title}</a>
                    : geoResult.title}
                </div>
              </div>
            )}
            {!geoError && !geoResult && !geoLoading && <div style={{ color:'#6b7280', fontSize:12 }}>未取得（「更新」を押してください）</div>}
          </div>
        </div>
      </div>

      {/* 付属品/ロック/状態 */}
      <div style={section}>
        <div style={row4}>
          <div style={label}>箱・付属品</div>
          <select style={box as any} value={acc} onChange={(e)=>setAcc(e.target.value)}>
            {ACCESSORIES.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <div style={label}>SIMロック</div>
          <select style={box as any} value={simLock} onChange={(e)=>setSimLock(e.target.value)}>
            {LOCK_YN.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>

        <div style={{ height: 8 }} />
        <div style={row4}>
          <div style={label}>アクティベーションロック</div>
          <select style={box as any} value={actLock} onChange={(e)=>setActLock(e.target.value)}>
            {LOCK_YN.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <div style={label}>状態</div>
          <select style={box as any} value={condition} onChange={(e)=>setCondition(e.target.value)}>
            {CONDITIONS.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
          </select>
        </div>

        <div style={{ height: 8 }} />
        <div style={row2}>
          <div style={label}>特記事項</div>
          <textarea style={{ ...box, height: 88, resize: 'vertical' } as any}
                    placeholder="例）液晶傷あり、Face ID不良 など"
                    value={conditionNote} onChange={(e)=>setConditionNote(e.target.value)} />
        </div>
      </div>
    </div>
  )
}
