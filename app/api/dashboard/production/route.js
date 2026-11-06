import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'

const ALL_STATES = [
  'DRAFT',
  'SCRIPT_GENERATING',
  'SCRIPT_REVIEW',
  'RENDERING',
  'PEDAGOGY_REVIEW',
  'DUBBING',
  'LANGUAGE_QC',
  'FINAL_APPROVAL',
  'PUBLISHED',
  'REJECTED',
]

export async function GET() {
  const session = await getSession()
  if (!session.user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  // Count per state
  const [stateCounts, items, overdueTasks] = await Promise.all([
    prisma.contentItem.groupBy({ by: ['state'], _count: true }),
    prisma.contentItem.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        tasks: { where: { status: 'OPEN' } },
        renderAssets: { select: { language: true, status: true, type: true } },
      },
    }),
    prisma.task.findMany({
      where: {
        status: 'OPEN',
        createdAt: { lt: new Date(Date.now() - 48 * 60 * 60 * 1000) },
      },
      include: { contentItem: { select: { title: true } } },
    }),
  ])

  const countsByState = Object.fromEntries(ALL_STATES.map((s) => [s, 0]))
  stateCounts.forEach(({ state, _count }) => {
    countsByState[state] = _count
  })

  // Per-item language completion matrix
  const languageMatrix = items.map((item) => {
    const langStatus = {}
    const allLangs = ['EN', ...item.targetLanguages]
    allLangs.forEach((lang) => {
      const asset = item.renderAssets.find(
        (a) => a.language === lang && (a.type === 'MASTER' || a.type === 'DUB')
      )
      langStatus[lang] = asset?.status ?? 'PENDING'
    })
    return {
      id: item.id,
      title: item.title,
      state: item.state,
      langStatus,
    }
  })

  // Average time per stage (approximate from audit events)
  // Simplified: just show counts for the demo
  return Response.json({
    countsByState,
    totalItems: items.length,
    overdueCount: overdueTasks.length,
    overdueTasks: overdueTasks.slice(0, 10),
    languageMatrix,
  })
}
