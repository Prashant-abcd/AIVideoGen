import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../app/generated/prisma/client.js'
import { config } from 'dotenv'

config()

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('Cleaning up all content, tasks, assets, and audit events...')

  await prisma.analyticsSnapshot.deleteMany({})
  await prisma.renderAsset.deleteMany({})
  await prisma.scriptVersion.deleteMany({})
  await prisma.task.deleteMany({})
  await prisma.auditEvent.deleteMany({})
  await prisma.contentItem.deleteMany({})

  console.log('✓ All queues cleared. Users and chapters are preserved.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
