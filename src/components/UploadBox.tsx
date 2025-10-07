
'use client'
import { useState } from 'react'

export default function UploadBox({ onImage }: { onImage: (base64: string) => void }) {
  const [preview, setPreview] = useState<string | null>(null)

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = (reader.result as string)
      setPreview(base64)
      onImage(base64)
    }
    reader.readAsDataURL(file)
  }

  return (
    <div style={{ border: '1px dashed #999', padding: 16, borderRadius: 8 }}>
      <input type="file" accept="image/*" onChange={handleFile} />
      {preview && (
        <div style={{ marginTop: 12 }}>
          <img src={preview} alt="preview" style={{ maxWidth: '100%', borderRadius: 8 }} />
        </div>
      )}
    </div>
  )
}
