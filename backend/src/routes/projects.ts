import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { Prisma } from '@prisma/client'

const router = Router()

router.get('/', async (req, res) => {
  const { page = '1', pageSize = '50', managerId, customerId, lifecycle, delayStatus } = req.query

  const where: Prisma.ProjectWhereInput = {}
  if (managerId) where.managerId = String(managerId)
  if (customerId) where.customerId = String(customerId)
  if (lifecycle) where.lifecycle = String(lifecycle)
  if (delayStatus) where.delayStatus = String(delayStatus) as any

  const [data, total] = await Promise.all([
    prisma.project.findMany({
      where,
      skip: (Number(page) - 1) * Number(pageSize),
      take: Number(pageSize),
      orderBy: { createdAt: 'desc' },
      include: {
        manager: { select: { id: true, fullName: true } },
        accountManager: { select: { id: true, fullName: true } },
        customer: { select: { id: true, canonical: true } },
      },
    }),
    prisma.project.count({ where }),
  ])

  res.json({ data, page: Number(page), pageSize: Number(pageSize), total })
})

router.get('/:id', async (req, res) => {
  const project = await prisma.project.findUnique({
    where: { id: req.params.id },
    include: {
      manager: { select: { id: true, fullName: true } },
      accountManager: { select: { id: true, fullName: true } },
      customer: { select: { id: true, canonical: true } },
    },
  })
  if (!project) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found' } })
    return
  }
  res.json(project)
})

export default router
