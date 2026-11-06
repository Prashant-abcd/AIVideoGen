import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'

export async function GET(request) {
  const session = await getSession()
  if (!session.user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const contentItemId = searchParams.get('contentItemId')
  const action = searchParams.get('action')

  const events = await prisma.auditEvent.findMany({
    where: {
      ...(contentItemId ? { contentItemId } : {}),
      ...(action ? { action } : {}),
    },
    orderBy: { timestamp: 'desc' },
    take: 200,
    include: {
      actor: { select: { name: true, email: true, role: true } },
      contentItem: { select: { title: true } },
    },
  })

  return Response.json({ events })
}
