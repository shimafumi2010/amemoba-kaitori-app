```tsx
src/components/AssessForm.tsx（全文置換）

'use client'
import React, { useState, useEffect } from 'react'
import { normalizeIMEI, normalizeSerial } from '../lib/ocrPostprocess'

const STAFFS = ['島野文宏', '島野ひとみ', '中田颯', '（その他）'] as const
const ACCESSORIES = ['有', '無', ''] as const
const LOCK_YN = ['無', '有', ''] as const
const CONDITIONS = [
  { code: 'S', label: 'S（新品未使用）' },
  { code: 'A', label: 'A（交換未使用品・新品同様品）' },
  { code: 'B', label: 'B（目立つ傷がなく、使用感が少ない）' },
  { code: 'C', label: 'C（目に見える傷、使用感がある）' },
  { code: 'D', label: 'D（目立つ傷、使用感が多数ある）' },
  { code: 'ジャンク', label: 'ジャンク' },
] as const
const CARRIERS = ['SoftBank', 'au(KDDI)', 'docomo', '楽天モバイル', 'SIMフリー'] as const
const RESTRICTS = ['○', '△', '×', '-'] as const

type GeoRow = {
  carrier: string
  model: string
  newPrice: string
  usedPrice: string
}

export default function AssessForm() {
  const [imageBase64, setImageBase64] = useState<string | null>(null)
  const [isExtracting, setIsExtracting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [imei, setImei] = useState('')
  const [serial, setSerial] = useState('')
  const [model, setModel] = useState('')
  const [battery, setBattery] = useState('')
  const [bboxMap, setBboxMap] = useState<Record<string, { x: number; y: number; w: number; h: number }[]>>({})

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (const it of items) {
        if (it.type.indexOf('image') !== -1) {
          const file = it.getAsFile()
          if (!file) continue
          const reader = new FileReader()
          reader.onload = () => {
            setImageBase64(reader.result as string)
            setErrorMsg(null)
          }
          reader.readAsDataURL(file)
          break
        }
      }
    }
    window.addEventListener('paste', onPaste as any)
    return () => window.removeEventListener('paste', onPaste as any)
  }, [])

  const handleExtractAndPopulate = async () => {
    if (isExtracting) return
    setIsExtracting(true)
    setErrorMsg(null)
    try {
      if (!imageBase64) throw new Error('画像を貼り付けてください（Ctrl+V）。')
      const payload = { imageBase64, mode: 'extractInfo' }
      const res = await fetch('/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error ?? 'OCRに失敗しました。')
      const fields = json.fields ?? {}
      const bboxes = json.bboxes ?? {}
      setBboxMap(bboxes)
      if (fields.imeiCandidates?.length) setImei(fields.imeiCandidates[0])
      if (fields.serialCandidates?.length) setSerial(fields.serialCandidates[0])
      if (fields.modelCandidates?.length) setModel(fields.modelCandidates[0])
      if (fields.batteryPercent) setBattery(String(fields.batteryPercent))
    } catch (e: any) {
      setErrorMsg(e.message)
    } finally {
      setIsExtracting(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">src/components/AssessForm.tsx（全文置換）</h2>
      <button
        className="rounded bg-black px-3 py-2 text-white disabled:opacity-60"
        onClick={handleExtractAndPopulate}
        disabled={isExtracting || !imageBase64}
      >
        {isExtracting ? '機種情報取得中…' : '機種情報取得・反映'}
      </button>
      {errorMsg && <div className="text-sm text-red-600">{errorMsg}</div>}
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">IMEI</span>
          <input className="border p-2" value={imei} onChange={(e) => setImei(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">Serial</span>
          <input className="border p-2" value={serial} onChange={(e) => setSerial(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">Model</span>
          <input className="border p-2" value={model} onChange={(e) => setModel(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">Battery</span>
          <input className="border p-2" value={battery} onChange={(e) => setBattery(e.target.value)} />
        </label>
      </div>
    </div>
  )
}
```
