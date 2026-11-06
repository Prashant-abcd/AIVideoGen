import { prisma } from '@/lib/db'
import { getSession, ROLE_HOME } from '@/lib/session'

const DEMO_ACCOUNTS = [
  'coordinator@demo',
  'sme@demo',
  'pedagogy@demo',
  'approver@demo',
]

export async function POST(request) {
  const { email } = await request.json()

  if (!email || !DEMO_ACCOUNTS.includes(email)) {
    return Response.json({ error: 'Invalid demo account' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) {
    return Response.json({ error: 'Account not found' }, { status: 401 })
  }

  const session = await getSession()
  session.user = { id: user.id, name: user.name, email: user.email, role: user.role }
  await session.save()

  return Response.json({ redirect: ROLE_HOME[user.role] })
}
