import { getSession } from '@/lib/session'
import { transition } from '@/lib/state-machine'

export async function POST(request, { params }) {
  try {
    const session = await getSession()
    if (!session.user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const { action, comment, scriptText, taskId } = await request.json()

    if (!action) return Response.json({ error: 'action is required' }, { status: 400 })

    const updated = await transition(id, action, session.user.id, { comment, scriptText, taskId })
    return Response.json({ item: updated })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 400 })
  }
}
