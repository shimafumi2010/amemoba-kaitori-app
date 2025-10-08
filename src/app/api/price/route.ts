- import { NextResponse } from 'next/server'
- import { fetchAmemobaPriceByQuery } from '@/lib/amemoba'
+ import { NextResponse } from 'next/server'
+ // route.ts（src/app/api/price） → src/lib/amemoba.ts への相対パス
+ import { fetchAmemobaPriceByQuery } from '../../../lib/amemoba'

export async function POST(req: Request) {
  const { query } = await req.json()
  const price = await fetchAmemobaPriceByQuery(query)
  return NextResponse.json({ price })
}
