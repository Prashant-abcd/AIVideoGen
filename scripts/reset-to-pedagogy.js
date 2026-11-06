// Usage: node scripts/reset-to-pedagogy.js <contentItemId>
// Resets a content item to PEDAGOGY_REVIEW without re-rendering.
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
    items.forEach((i) => console.log(`  ${i.id}  |  ${i.state}  |  ${i.title}`))
    return
  }

  const item = await prisma.contentItem.findUnique({ where: { id } })
  if (!item) { console.error('Not found:', id); process.exit(1) }

  console.log(`Current state: ${item.state}`)

  await prisma.task.updateMany({
    where: { contentItemId: id, status: 'OPEN' },
    data: { status: 'DONE', completedAt: new Date() },
  })

  await prisma.contentItem.update({ where: { id }, data: { state: 'PEDAGOGY_REVIEW' } })

  await prisma.task.create({
    data: { contentItemId: id, stage: 'PEDAGOGY_REVIEW', assignedRole: 'PEDAGOGY', status: 'OPEN' },
  })

  console.log('Done — item reset to PEDAGOGY_REVIEW. Log in as pedagogy@demo to review.')
}

main().catch(console.error).finally(() => prisma.$disconnect())
