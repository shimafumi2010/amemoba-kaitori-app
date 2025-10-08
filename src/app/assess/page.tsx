import dynamic from 'next/dynamic'
const AssessForm = dynamic(() => import('@/components/AssessForm'), { ssr: false }) // ← この形

export default function AssessPage() {
  return (
    <div>
      <h1>査定</h1>
      <AssessForm />
    </div>
  )
}
