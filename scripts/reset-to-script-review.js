// Resets a content item to SCRIPT_REVIEW so SME can re-approve and re-trigger render.
// Usage: npx tsx scripts/reset-to-script-review.js <contentItemId>
import 'dotenv/config'
import { PrismaClient } from '../app/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

async function main() {
  const id = process.argv[2]
  if (!id) {
    const items = await prisma.contentItem.findMany({
      select: { id: true, title: true, state: true },
      orderBy: { createdAt: 'desc' },
    })
    console.log('\nContent items:')
    items.forEach((i) => console.log(`  ${i.state.padEnd(16)} ${i.id}  ${i.title.slice(0, 60)}`))
    return
  }

  const item = await prisma.contentItem.findUnique({ where: { id } })
  if (!item) { console.error('Not found:', id); process.exit(1) }
  console.log(`Current state: ${item.state}`)

  await prisma.task.updateMany({
    where: { contentItemId: id, status: 'OPEN' },
    data: { status: 'DONE', completedAt: new Date() },
  })
  await prisma.renderAsset.updateMany({
    where: { contentItemId: id, status: { in: ['PROCESSING', 'FAILED'] } },
    data: { status: 'FAILED' },
  })
  await prisma.contentItem.update({ where: { id }, data: { state: 'SCRIPT_REVIEW' } })
  await prisma.task.create({
    data: { contentItemId: id, stage: 'SCRIPT_REVIEW', assignedRole: 'SME', status: 'OPEN' },
  })

  console.log('Done — item reset to SCRIPT_REVIEW. Log in as sme@demo and approve to re-trigger render.')
}

main().catch(console.error).finally(() => prisma.$disconnect())
