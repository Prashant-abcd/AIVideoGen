// Deletes all content items stuck in RENDERING, keeps everything else.
// Run: npx tsx scripts/cleanup-rendering.js
import 'dotenv/config'
import { PrismaClient } from '../app/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

async function main() {
  const stuck = await prisma.contentItem.findMany({
    where: { state: 'RENDERING' },
    select: { id: true, title: true },
  })

  if (stuck.length === 0) {
    console.log('No items stuck in RENDERING.')
    return
  }

  console.log(`Found ${stuck.length} items stuck in RENDERING — deleting…`)
  const ids = stuck.map((i) => i.id)

  // Delete in dependency order
  await prisma.analyticsSnapshot.deleteMany({ where: { contentItemId: { in: ids } } })
  await prisma.auditEvent.deleteMany({ where: { contentItemId: { in: ids } } })
  await prisma.task.deleteMany({ where: { contentItemId: { in: ids } } })
  await prisma.renderAsset.deleteMany({ where: { contentItemId: { in: ids } } })
  await prisma.scriptVersion.deleteMany({ where: { contentItemId: { in: ids } } })
  await prisma.contentItem.deleteMany({ where: { id: { in: ids } } })

  console.log(`Deleted ${stuck.length} items. Remaining items:`)
  const remaining = await prisma.contentItem.findMany({
    select: { id: true, state: true, title: true },
    orderBy: { createdAt: 'desc' },
  })
  remaining.forEach((i) => console.log(`  ${i.state.padEnd(15)} ${i.id}  ${i.title.slice(0, 60)}`))
}

main().catch(console.error).finally(() => prisma.$disconnect())
