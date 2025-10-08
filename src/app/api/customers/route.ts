import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(url, anon)

// 期待テーブル構成例（列名はあなたのシート/ETLに合わせて調整）
// form_responses: timestamp, name, furigana, address, phone, birthday
export async function GET() {
  try {
    const { data, error } = await supabase
      .from('form_responses')
      .select('timestamp,name,furigana,address,phone,birthday')
      .order('timestamp', { ascending: false })
      .limit(50)

    if (error) throw error

    return NextResponse.json({ ok: true, customers: data ?? [] })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'unknown' }, { status: 500 })
  }
}
