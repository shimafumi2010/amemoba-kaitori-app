'use client'
import React from 'react'

type OcrFields = {
  imeiCandidates?: string[]
  serialCandidates?: string[]
  modelCandidates?: string[]
  batteryPercent?: number | null
}

export default function AssessForm() {
  const [imageBase64, setImageBase64] = React.useState<string | null>(null)
  const [isExtracting, setIsExtracting] = React.useState(false)
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null)

  const [imei, setImei] = React.useState('')
  const [serial, setSerial] = React.useState('')
  const [model, setModel] = React.useState('')
  const [battery, setBattery] = React.useState<string>('')

  const [bboxMap, setBboxMap] = React.useState<Record<string, { x: number; y: number; w: number; h: number }[]>>({})

  React.useEffect(() => {
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

  async function safeJsonFetch(path: string, body: any, timeoutMs = 25000) {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      if (!res.ok) throw new Error(await res.text())
      return await res.json()
    } finally {
      clearTimeout(t)
    }
  }

  const handleExtractAndPopulate = async () => {
    if (isExtracting) return
    setIsExtracting(true)
    setErrorMsg(null)
    try {
      if (!imageBase64) throw new Error('画像を貼り付けてください（Ctrl+V）。')
      const json = await safeJsonFetch('/api/ocr', { imageBase64, mode: 'extractInfo' }, 30000)
      if (!json?.ok) throw new Error(json?.error ?? 'OCRに失敗しました。')
      const fields: OcrFields = json.fields ?? {}
      const bboxes = json.bboxes ?? {}
      setBboxMap(bboxes)
      if (fields.imeiCandidates?.[0]) setImei(fields.imeiCandidates[0])
      if (fields.serialCandidates?.[0]) setSerial(fields.serialCandidates[0])
      if (fields.modelCandidates?.[0]) setModel(fields.modelCandidates[0])
      if (fields.batteryPercent) setBattery(String(fields.batteryPercent))
    } catch (e: any) {
      setErrorMsg(e.message)
    } finally {
      setIsExtracting(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">査定受付票</h2>
      <div className="rounded border p-3">
        <div className="mb-2 text-sm text-gray-600">
          画像は Snipping Tool → Ctrl+V で貼り付け
        </div>
        <button
          className="rounded bg-black px-3 py-2 text-white disabled:opacity-60"
          onClick={handleExtractAndPopulate}
          disabled={isExtracting || !imageBase64}
        >
          {isExtracting ? '機種情報取得中…' : '機種情報取得・反映'}
        </button>
        {errorMsg && <div className="mt-2 text-sm text-red-600">{errorMsg}</div>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">IMEI</span>
          <input className="rounded border p-2" value={imei} onChange={(e) => setImei(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">Serial</span>
          <input className="rounded border p-2" value={serial} onChange={(e) => setSerial(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">Model</span>
          <input className="rounded border p-2 uppercase" value={model} onChange={(e) => setModel(e.target.value.toUpperCase())} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">Battery（%）</span>
          <input className="rounded border p-2" value={battery} onChange={(e) => setBattery(e.target.value)} />
        </label>
      </div>
    </div>
  )
}
