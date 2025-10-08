// 最新を常に描画（静的化を無効化）
export const revalidate = 0
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

import dynamic from 'next/dynamic'

// AssessForm はクライアントコンポーネントなので dynamic import
const AssessForm = dynamic(() => import('@/components/AssessForm'), { ssr: false })

export default function Page() {
  return <AssessForm />
}
