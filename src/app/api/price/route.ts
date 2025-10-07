
import { NextResponse } from 'next/server'
import { fetchAmemobaPriceByQuery } from '@/src/lib/amemoba'

export async function POST(req: Request) {
  const { query } = await req.json()
  const price = await fetchAmemobaPriceByQuery(query)
  return NextResponse.json({ price })
}
