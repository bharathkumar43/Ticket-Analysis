import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { Prisma, BreachFlag } from '@prisma/client'

const router = Router()

router.get('/', async (req, res) => {
  const {
    page = '1', pageSize = '50',
    from, to, dateField = 'created',
    priority, status, customerId, managerId, assigneeId, breach,
  } = req.query

  const where: Prisma.TicketWhereInput = {}

  if (from || to) {
    const field = dateField === 'updated' ? 'updated' : 'created'
    where[field as 'created' | 'updated'] = {}
    if (from) (where[field as 'created' | 'updated'] as any).gte = new Date(String(from))
    if (to) (where[field as 'created' | 'updated'] as any).lte = new Date(String(to))
  }

  if (priority) where.priority = String(priority)
  if (status) where.status = String(status)
  if (customerId) where.customerId = String(customerId)
  if (managerId) where.projectManagerId = String(managerId)
  if (assigneeId) where.assigneeId = String(assigneeId)

  if (breach === 'resolution') where.resolutionBreach = BreachFlag.YES
  else if (breach === 'firstResponse') where.firstResponseBreach = BreachFlag.YES
  else if (breach === 'any') {
    where.OR = [{ resolutionBreach: BreachFlag.YES }, { firstResponseBreach: BreachFlag.YES }]
  }

  const [data, total] = await Promise.all([
    prisma.ticket.findMany({
      where,
      skip: (Number(page) - 1) * Number(pageSize),
      take: Number(pageSize),
      orderBy: { created: 'desc' },
      include: {
        customer: { select: { id: true, canonical: true } },
        projectManager: { select: { id: true, fullName: true } },
        assignee: { select: { id: true, fullName: true } },
      },
    }),
    prisma.ticket.count({ where }),
  ])

  res.json({ data, page: Number(page), pageSize: Number(pageSize), total })
})

router.get('/:id', async (req, res) => {
  const ticket = await prisma.ticket.findUnique({
    where: { id: req.params.id },
    include: {
      customer: { select: { id: true, canonical: true } },
      projectManager: { select: { id: true, fullName: true } },
      assignee: { select: { id: true, fullName: true } },
    },
  })
  if (!ticket) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ticket not found' } })
    return
  }
  res.json(ticket)
})

export default router
