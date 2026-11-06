import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'
import { transition } from '@/lib/state-machine'

export async function GET() {
  const session = await getSession()
  if (!session.user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const items = await prisma.contentItem.findMany({
    orderBy: { updatedAt: 'desc' },
    include: {
      createdBy: { select: { name: true, email: true } },
      tasks: { where: { status: 'OPEN' } },
    },
  })

  // Compute overdue flag: open task sitting >48h
  const now = Date.now()
  const result = items.map((item) => ({
    ...item,
    overdue: item.tasks.some((t) => now - t.createdAt.getTime() > 48 * 60 * 60 * 1000),
  }))

  return Response.json({ items: result })
}

export async function POST(request) {
  const session = await getSession()
  if (!session.user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'COORDINATOR') {
    return Response.json({ error: 'Only coordinators can create content' }, { status: 403 })
  }

  const { chapterId, learningOutcome, format, targetLanguages, mascotId, customBrief } =
    await request.json()

  if (!chapterId || !learningOutcome || !format || !targetLanguages?.length) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const chapter = await prisma.chapter.findUnique({ where: { id: chapterId } })
  if (!chapter) return Response.json({ error: 'Chapter not found' }, { status: 404 })

  // Create in DRAFT state
  const item = await prisma.contentItem.create({
    data: {
      title: `${chapter.chapterName} — ${learningOutcome}`,
      classLevel: chapter.classLevel,
      subject: chapter.subject,
      chapterId,
      learningOutcome,
      format,
      targetLanguages,
      mascotId: mascotId ?? 'gyaani',
      state: 'DRAFT',
      createdById: session.user.id,
    },
  })

  // Immediately transition to SCRIPT_GENERATING (kicks off LLM)
  await transition(item.id, 'submit', session.user.id)

  return Response.json({ item }, { status: 201 })
}
