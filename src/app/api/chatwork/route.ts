
import { NextResponse } from 'next/server'
import { postChatworkMessage } from '@/src/lib/chatwork'

export async function POST(req: Request) {
  const { body } = await req.json()
  const r = await postChatworkMessage(body)
  return NextResponse.json({ ok: true, r })
}
