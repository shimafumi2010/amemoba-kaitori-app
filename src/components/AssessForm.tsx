'use client'
import React, { useRef, useState, useEffect, useCallback } from 'react'
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

/** 画像一括クロップ：bbox は 0〜1 の比率 */
async function cropFromBase64ByBbox(imageBase64: string, bbox: { x: number; y: number; w: number; h: number }): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const sx = Math.max(0, Math.round(bbox.x * img.width))
      const sy = Math.max(0, Math.round(bbox.y * img.height))
      const sw = Math.max(1, Math.round(bbox.w * img.width))
      const sh = Math.max(1, Math.round(bbox.h * img.height))
      const out = document.createElement('canvas')
      out.width = sw
      out.height = sh
      const ctx = out.getContext('2d')!
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)
      resolve(out.toDataURL('image/png'))
    }
    img.onerror = () => resolve(null)
    img.src = imageBase64
  })
}

/** 簡易手動クロッパー（フォールバック用） */
function Cropper({
  image,
  onCropToImei,
  onCropToSerial,
}: {
  image: string
  onCropToImei: (dataUrl: string) => void
  onCropToSerial: (dataUrl: string) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [sel, setSel] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [drag, setDrag] = useState<{ sx: number; sy: number } | null>(null)

  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      imgRef.current = img
      draw()
    }
    img.src = image
  }, [image])

  const draw = useCallback(() => {
    const cvs = canvasRef.current
    const img = imgRef.current
    if (!cvs || !img) return
    const maxW = 700
    const scale = img.width > maxW ? maxW / img.width : 1
    cvs.width = img.width * scale
    cvs.height = img.height * scale
    const ctx = cvs.getContext('2d')!
    ctx.clearRect(0, 0, cvs.width, cvs.height)
    ctx.drawImage(img, 0, 0, cvs.width, cvs.height)
    if (sel) {
      ctx.save()
      ctx.strokeStyle = '#2563eb'
      ctx.lineWidth = 2
      ctx.setLineDash([6, 4])
      ctx.strokeRect(sel.x, sel.y, sel.w, sel.h)
      ctx.restore()
    }
  }, [sel])

  useEffect(() => { draw() }, [draw])

  const onMouseDown = (e: React.MouseEvent) => {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    setDrag({ sx, sy })
    setSel({ x: sx, y: sy, w: 0, h: 0 })
  }
  const onMouseMove = (e: React.MouseEvent) => {
    if (!drag) return
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    setSel(s => (s ? { x: Math.min(drag.sx, x), y: Math.min(drag.sy, y), w: Math.abs(x - drag.sx), h: Math.abs(y - drag.sy) } : s))
  }
  const onMouseUp = () => setDrag(null)

  const doCrop = async (to: 'imei' | 'serial') => {
    const cvs = canvasRef.current
    const img = imgRef.current
    if (!cvs || !img || !sel || sel.w < 4 || sel.h < 4) return
    const scale = cvs.width / img.width
    const sx = Math.max(0, Math.round(sel.x / scale))
    const sy = Math.max(0, Math.round(sel.y / scale))
    const sw = Math.min(img.width - sx, Math.round(sel.w / scale))
    const sh = Math.min(img.height - sy, Math.round(sel.h / scale))
    const out = document.createElement('canvas')
    out.width = sw
    out.height = sh
    const octx = out.getContext('2d')!
    octx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)
    const dataUrl = out.toDataURL('image/png')
    if (to === 'imei') onCropToImei(dataUrl)
    else onCropToSerial(dataUrl)
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ fontSize: 12, color: '#6b7280' }}>（自動検出に失敗した場合用）画像をドラッグで範囲選択 → 割当</div>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, cursor: 'crosshair' }}
        onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => doCrop('imei')} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #ddd' }}>
          選択範囲を IMEI 画像に割当
        </button>
        <button onClick={() => doCrop('serial')} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #ddd' }}>
          選択範囲を シリアル 画像に割当
        </button>
      </div>
    </div>
  )
}

export default function AssessForm() {
  const [staff, setStaff] = useState('島野ひとみ')
  const [acceptedAt, setAcceptedAt] = useState(() => new Date().toISOString().slice(0, 10))

  const [customerSelect, setCustomerSelect] = useState('（最新が先頭）')
  const [customer, setCustomer] = useState({ name: '', kana: '', address: '', phone: '', birth: '' })

  const [device, setDevice] = useState({
    model_name: '', capacity: '', color: '', model_number: '',
    imei: '', serial: '', battery: '', carrier: '', restrict: ''
  })

  const [acc, setAcc] = useState(''); const [simLock, setSimLock] = useState('')
  const [actLock, setActLock] = useState(''); const [condition, setCondition] = useState('B')
  const [conditionNote, setConditionNote] = useState('')

  const [maxPrice, setMaxPrice] = useState<number | ''>(''); const [discount, setDiscount] = useState<number | ''>('')
  const [todayPrice, setTodayPrice] = useState<number>(0)

  const [geoLoading, setGeoLoading] = useState(false)
  const [geoError, setGeoError] = useState<string | null>(null)
  const [geoResult, setGeoResult] = useState<GeoRow | null>(null)
  const [geoSearchUrl, setGeoSearchUrl] = useState<string | null>(null)

  const [imgBase64, setImgBase64] = useState<string | null>(null)
  const [imeiCrop, setImeiCrop] = useState<string | null>(null)
  const [serialCrop, setSerialCrop] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const pasteRef = useRef<HTMLDivElement>(null)

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
        setMessage('画像貼り付け完了。OCRを実行します。')
        e.preventDefault()
        // 自動でOCR実行（便利）
        setTimeout(runOCR, 10)
        return
      }
    }
  }

  /** OCR 実行（bbox → 自動クロップ） */
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
      const p: any = json?.data ?? {}
      const imeiNorm = normalizeIMEI(p.imei)
      const serialNorm = normalizeSerial(p.serial)

      setDevice(d => ({
        ...d,
        model_name: p.model_name ?? d.model_name,
        capacity: p.capacity ?? d.capacity,
        color: p.color ?? d.color,
        model_number: p.model_number ?? d.model_number,
        imei: imeiNorm || p.imei || d.imei,
        serial: serialNorm || p.serial || d.serial,
        battery: p.battery ?? d.battery,
      }))

      // ★ bbox で自動クロップ
      if (p?.imei_bbox && imgBase64) {
        const url = await cropFromBase64ByBbox(imgBase64, p.imei_bbox)
        if (url) setImeiCrop(url)
      }
      if (p?.serial_bbox && imgBase64) {
        const url = await cropFromBase64ByBbox(imgBase64, p.serial_bbox)
        if (url) setSerialCrop(url)
      }

      setMessage('OCR完了：自動抽出＆自動クロップを反映しました。')
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

      {/* 画像貼付け＋自動OCR */}
      <div style={section}>
        <div style={row2}>
          <div style={label}>3uTools画像</div>
          <div
            ref={pasteRef} onPaste={handlePaste}
            style={{ border: '2px dashed #cbd5e1', borderRadius: 10, minHeight: 180, display: 'grid', placeItems: 'center',
                     color: '#6b7280', background: '#fafafa', textAlign: 'center', padding: 8 }}
            title="ここに Ctrl+V でスクショを貼り付け"
          >
            {imgBase64
              ? <img src={imgBase64} alt="pasted" style={{ maxWidth: '100%', maxHeight: 260, borderRadius: 8 }} />
              : <div>ここをクリック → <b>Ctrl + V</b> でスクショを貼り付け</div>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button onClick={runOCR} disabled={!imgBase64} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #ddd' }}>
            OCR再実行
          </button>
          <div style={{ color: '#2563eb', fontSize: 13 }}>{message}</div>
        </div>

        {/* フォールバック用の手動クロッパー（自動が出たあとでも使える） */}
        {imgBase64 && (
          <div style={{ marginTop: 12 }}>
            <Cropper image={imgBase64} onCropToImei={(u)=>setImeiCrop(u)} onCropToSerial={(u)=>setSerialCrop(u)} />
          </div>
        )}
      </div>

      {/* 端末情報 */}
      <div style={section}>
        <div style={row4}>
          <div style={label}>機種名</div><input style={box as any} value={device.model_name} onChange={(e)=>setDevice({...device,model_name:e.target.value})}/>
          <div style={label}>容量</div><input style={box as any} value={device.capacity} onChange={(e)=>setDevice({...device,capacity:e.target.value})}/>
        </div>
        <div style={{ height: 8 }} />
        <div style={row4}>
          <div style={label}>カラー</div><input style={box as any} value={device.color} onChange={(e)=>setDevice({...device,color:e.target.value})}/>
          <div style={label}>モデル番号</div><input style={box as any} value={device.model_number} onChange={(e)=>setDevice({...device,model_number:e.target.value})}/>
        </div>

        {/* 自動クロップ結果プレビュー → 入力と見比べ */}
        {imeiCrop && <div style={{ margin: '6px 0 2px 160px' }}><img src={imeiCrop} alt="imei-crop" style={{ maxHeight: 60, border: '1px solid #e5e7eb', borderRadius: 6 }}/></div>}
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

        {serialCrop && <div style={{ margin: '6px 0 2px 160px' }}><img src={serialCrop} alt="serial-crop" style={{ maxHeight: 60, border: '1px solid #e5e7eb', borderRadius: 6 }}/></div>}
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
            <option value=""/>
            {CARRIERS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div style={row4}>
          <div style={label}>利用制限</div>
          <select style={box as any} value={device.restrict} onChange={(e)=>setDevice({...device,restrict:e.target.value})}>
            <option value=""/>{RESTRICTS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <div/><div/>
        </div>
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
              amemoba価格検索（{getModelPrefix() || 'キーワード未入力'} / {device.carrier || 'キャリア未選択'}）
            </button>
            <div style={{ color:'#6b7280', fontSize:12 }}>例：MLJH3 J/A → MLJH3</div>
          </div>

          <div style={{ border:'1px dashed #d1d5db', borderRadius:10, padding:8 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
              <div style={{ fontWeight:700 }}>競合価格（ゲオ）</div>
              <button onClick={fetchGeo} disabled={!getModelPrefix()} style={{ padding:'4px 8px', borderRadius:6, border:'1px solid #ddd' }}>
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
