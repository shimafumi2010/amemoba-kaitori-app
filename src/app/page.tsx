export default function Page() {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <h1>中古iPhone 査定MVP</h1>
      <p>3uToolsスクショOCR → 自動入力 → 投稿文作成 → 納品書PDF（雛形）</p>
      <ol>
        <li><a href="/assess">査定ページへ</a></li>
        <li><a href="/deliveries">納品書（雛形）</a></li>
      </ol>
    </div>
  )
}
