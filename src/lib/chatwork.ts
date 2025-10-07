
export async function postChatworkMessage(body: string) {
  const token = process.env.CHATWORK_API_TOKEN!
  const roomId = process.env.CHATWORK_ROOM_ID!
  const res = await fetch(`https://api.chatwork.com/v2/rooms/${roomId}/messages`, {
    method: 'POST',
    headers: {
      'X-ChatWorkToken': token,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ body }),
    cache: 'no-store'
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Chatwork error: ${res.status} ${text}`)
  }
  return await res.json()
}
