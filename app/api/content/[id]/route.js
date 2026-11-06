import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'

export async function GET(request, { params }) {
  const session = await getSession()
  if (!session.user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const item = await prisma.contentItem.findUnique({
    where: { id },
    include: {
      createdBy: { select: { name: true, email: true } },
      chapter: { select: { chapterName: true, chapterText: true, classLevel: true, subject: true, learningOutcomes: true } },
      scriptVersions: { orderBy: { versionNo: 'asc' } },
      renderAssets: { orderBy: { createdAt: 'desc' } },
      tasks: { orderBy: { createdAt: 'desc' } },
      auditEvents: {
        orderBy: { timestamp: 'desc' },
        include: { actor: { select: { name: true, email: true, role: true } } },
      },
    },
  })

  if (!item) return Response.json({ error: 'Not found' }, { status: 404 })

  // Compute overdue
  const now = Date.now()
  const openTask = item.tasks.find((t) => t.status === 'OPEN')
  const overdue = openTask
    ? now - openTask.createdAt.getTime() > 48 * 60 * 60 * 1000
    : false

  return Response.json({ item: { ...item, overdue } })
}
