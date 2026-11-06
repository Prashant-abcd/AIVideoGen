import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'

const OVERDUE_MS = 48 * 60 * 60 * 1000

const CONTENT_SELECT = {
  select: {
    id: true,
    title: true,
    state: true,
    currentVersion: true,
    targetLanguages: true,
    classLevel: true,
    subject: true,
    chapter: { select: { chapterName: true } },
  },
}

function addOverdue(tasks) {
  const now = Date.now()
  return tasks.map((t) => ({
    ...t,
    overdue: now - new Date(t.createdAt).getTime() > OVERDUE_MS,
  }))
}

export async function GET() {
  const session = await getSession()
  if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { role } = session.user

  const openTasks = await prisma.task.findMany({
    where: { assignedRole: role, status: 'OPEN' },
    orderBy: { createdAt: 'asc' },
    include: { contentItem: CONTENT_SELECT },
  })

  if (role === 'SME') {
    // Split open tasks: "returned by pedagogy" vs fresh pending vs dubbing QC
    const rawDubbingTasks = openTasks.filter(t => t.stage.startsWith('LANGUAGE_QC_'))
    const dubbingTasks = []
    const seenContentIds = new Set()
    for (const t of rawDubbingTasks) {
      if (!seenContentIds.has(t.contentItemId)) {
        seenContentIds.add(t.contentItemId)
        dubbingTasks.push({ ...t, stage: 'LANGUAGE_QC' })
      }
    }
    const scriptTasks = openTasks.filter(t => !t.stage.startsWith('LANGUAGE_QC_'))

    const returnedItems = scriptTasks.length
      ? await prisma.auditEvent.findMany({
          where: {
            action: 'reject',
            fromState: 'PEDAGOGY_REVIEW',
            contentItemId: { in: scriptTasks.map((t) => t.contentItemId) },
          },
          select: { contentItemId: true },
        })
      : []
    const returnedIds = new Set(returnedItems.map((e) => e.contentItemId))

    return Response.json({
      pending: addOverdue(scriptTasks.filter((t) => !returnedIds.has(t.contentItemId))),
      returned: addOverdue(scriptTasks.filter((t) => returnedIds.has(t.contentItemId))),
      dubbing: addOverdue(dubbingTasks),
    })
  }

  if (role === 'PEDAGOGY') {
    return Response.json({
      pending: addOverdue(openTasks),
    })
  }

  // Approver — just pending
  return Response.json({
    pending: addOverdue(openTasks),
  })
}
