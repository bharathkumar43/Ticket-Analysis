import { Router } from 'express'
import { prisma } from '../lib/prisma'

const router = Router()

router.get('/', async (req, res) => {
  const { includePlaceholder } = req.query
  const where: any = {}
  if (!includePlaceholder) where.isPlaceholder = false

  const data = await prisma.customer.findMany({
    where,
    include: { aliases: { select: { raw: true } } },
    orderBy: { canonical: 'asc' },
  })

  res.json({ data: data.map(c => ({ ...c, aliases: c.aliases.map(a => a.raw) })) })
})

router.get('/:id', async (req, res) => {
  const customer = await prisma.customer.findUnique({
    where: { id: req.params.id },
    include: { aliases: { select: { raw: true } } },
  })
  if (!customer) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Customer not found' } })
    return
  }
  res.json({ ...customer, aliases: customer.aliases.map(a => a.raw) })
})

export default router
