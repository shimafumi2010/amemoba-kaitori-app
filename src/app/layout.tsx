
export const metadata = { title: 'Amemoba Kaitori App' }
import React from 'react'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body style={{ fontFamily: 'ui-sans-serif, system-ui', padding: 16 }}>
        <header style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 24 }}>
          <a href="/" style={{ fontWeight: 700 }}>Amemoba Kaitori</a>
          <nav style={{ display: 'flex', gap: 12 }}>
            <a href="/assess">査定</a>
            <a href="/deliveries">納品書</a>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  )
}
