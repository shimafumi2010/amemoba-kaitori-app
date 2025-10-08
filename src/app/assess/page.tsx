- import dynamic from 'next/dynamic'
- const AssessForm = dynamic(() => import('@/components/AssessForm'), { ssr: false })
+ import dynamic from 'next/dynamic'
+ // page.tsx（src/app/assess） → src/components/AssessForm.tsx への相対パス
+ const AssessForm = dynamic(() => import('../../components/AssessForm'), { ssr: false })

export default function AssessPage() {
  return (
    <div>
      <h1>査定</h1>
      <AssessForm />
    </div>
  )
}
