import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Amemoba Kaitori 査定受付票',
  description: 'アメモバ買取アプリ — 査定フォーム',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-gray-50 text-gray-800">
        <header className="border-b bg-white">
          <nav className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <div className="text-lg font-semibold text-purple-700">Amemoba Kaitori</div>
            <div className="space-x-4 text-sm text-gray-600">
              <a href="/assess" className="hover:underline">査定</a>
              <a href="/receipt" className="hover:underline">納品書</a>
            </div>
          </nav>
        </header>

        <main className="mx-auto max-w-5xl p-6">{children}</main>
      </body>
    </html>
  )
}
