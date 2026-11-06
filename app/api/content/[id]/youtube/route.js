import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'

// Attach YouTube URLs to published assets (manual upload workflow)
export async function POST(request, { params }) {
  const session = await getSession()
  if (!session.user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { links } = await request.json() // { EN: 'https://...', HI: 'https://...' }

  if (!links || typeof links !== 'object') {
    return Response.json({ error: 'links object required' }, { status: 400 })
  }

  // Update each render asset with the YouTube URL
  await Promise.all(
    Object.entries(links).map(([language, youtubeUrl]) =>
      prisma.renderAsset.updateMany({
        where: { contentItemId: id, language },
        data: { fileUrl: youtubeUrl },
      })
    )
  )

  return Response.json({ ok: true })
}
