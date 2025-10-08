// 常に最新描画（静的化を無効化）
export const revalidate = 0
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// ← 衝突回避のため、別名で import
import dynamicImport from 'next/dynamic'

// AssessForm はクライアントコンポーネントなので dynamic import
const AssessForm = dynamicImport(() => import('@/components/AssessForm'), { ssr: false })

export default function Page() {
  return <AssessForm />
}
