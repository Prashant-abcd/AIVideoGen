import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'
import { analyticsProvider } from '@/lib/providers'

export async function GET() {
  const session = await getSession()
  if (!session.user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const publishedItems = await prisma.contentItem.findMany({
    where: { state: 'PUBLISHED' },
    include: {
      analyticsSnapshots: { orderBy: { capturedAt: 'desc' }, take: 5 },
    },
  })

  // Aggregate metrics
  let totalViews = 0
  let totalLikes = 0
  let completionSum = 0
  let snapshotCount = 0

  const topVideos = []
  const viewsByLanguage = {}

  for (const item of publishedItems) {
    const latestByLang = {}
    for (const snap of item.analyticsSnapshots) {
      if (!latestByLang[snap.language]) {
        latestByLang[snap.language] = snap
        totalViews += snap.views
        totalLikes += snap.likes
        completionSum += snap.completionPct
        snapshotCount++
        viewsByLanguage[snap.language] = (viewsByLanguage[snap.language] ?? 0) + snap.views
      }
    }
    const itemViews = Object.values(latestByLang).reduce((s, x) => s + x.views, 0)
    topVideos.push({ id: item.id, title: item.title, views: itemViews })
  }

  topVideos.sort((a, b) => b.views - a.views)

  return Response.json({
    publishedCount: publishedItems.length,
    totalViews,
    totalLikes,
    avgCompletion: snapshotCount > 0 ? completionSum / snapshotCount : 0,
    topVideos: topVideos.slice(0, 10),
    viewsByLanguage,
  })
}

// On-demand analytics refresh
export async function POST() {
  const session = await getSession()
  if (!session.user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const publishedItems = await prisma.contentItem.findMany({
    where: { state: 'PUBLISHED' },
    include: { renderAssets: { where: { fileUrl: { not: null } } } },
  })

  let refreshed = 0
  for (const item of publishedItems) {
    for (const asset of item.renderAssets) {
      if (!asset.fileUrl) continue
      try {
        const stats = await analyticsProvider.fetchStats({ language: asset.language })
        await prisma.analyticsSnapshot.create({
          data: {
            contentItemId: item.id,
            language: asset.language,
            views: stats.views,
            avgViewDuration: stats.avgViewDuration,
            completionPct: stats.completionPct,
            likes: stats.likes,
          },
        })
        refreshed++
      } catch (err) {
        console.error('Analytics refresh failed for asset', asset.id, err)
      }
    }
  }

  return Response.json({ refreshed })
}
