import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'

export async function GET() {
  const session = await getSession()
  if (!session.user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const chapters = await prisma.chapter.findMany({
    orderBy: [{ classLevel: 'asc' }, { subject: 'asc' }, { chapterName: 'asc' }],
  })

  return Response.json({ chapters })
}
