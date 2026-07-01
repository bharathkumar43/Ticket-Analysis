import { PrismaClient } from '@prisma/client'

// Build DATABASE_URL from individual DB_* vars if not already set (supports both env styles)
if (!process.env.DATABASE_URL && process.env.DB_HOST) {
  const { DB_USER = 'postgres', DB_PASSWORD = '', DB_HOST = 'localhost', DB_PORT = '5432', DB_NAME = 'postgres' } = process.env
  process.env.DATABASE_URL = `postgresql://${DB_USER}:${encodeURIComponent(DB_PASSWORD)}@${DB_HOST}:${DB_PORT}/${DB_NAME}?schema=public`
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
