import { getSession } from '@/lib/session'

export async function GET() {
  const session = await getSession()
  if (!session.user) {
    return Response.json({ user: null }, { status: 401 })
  }
  return Response.json({ user: session.user })
}
