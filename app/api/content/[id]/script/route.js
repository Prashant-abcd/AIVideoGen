import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'

// Save an edited script as a new version (without transitioning state)
export async function POST(request, { params }) {
  try {
    const session = await getSession()
    if (!session.user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const { scriptText } = await request.json()

    if (!scriptText?.trim()) {
      return Response.json({ error: 'scriptText is required' }, { status: 400 })
    }

    const item = await prisma.contentItem.findUnique({ where: { id } })
    if (!item) return Response.json({ error: 'Not found' }, { status: 404 })

    const newVersion = item.currentVersion + 1

    const version = await prisma.scriptVersion.create({
      data: {
        contentItemId: id,
        versionNo: newVersion,
        scriptText,
        generatedBy: 'HUMAN_EDIT',
        editorId: session.user.id,
      },
    })

    await prisma.contentItem.update({
      where: { id },
      data: { currentVersion: newVersion },
    })

    await prisma.auditEvent.create({
      data: {
        contentItemId: id,
        actorId: session.user.id,
        action: 'script_edited',
        fromState: item.state,
        toState: item.state,
        comment: `Script edited (v${newVersion})`,
      },
    })

    return Response.json({ version })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
