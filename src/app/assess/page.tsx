import dynamic from 'next/dynamic'

// AssessForm はクライアントコンポーネントなので dynamic import（SSR無効化）
const AssessForm = dynamic(() => import('@/components/AssessForm'), { ssr: false })

export default function Page() {
  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="mb-6 text-2xl font-bold">アメモバ買取 — 査定受付票</h1>
      <AssessForm />
    </main>
  )
}
