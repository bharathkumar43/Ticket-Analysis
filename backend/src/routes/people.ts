import { Router } from 'express'
import { prisma } from '../lib/prisma'

const router = Router()

router.get('/', async (req, res) => {
  const { role } = req.query
  const where: any = {}
  if (role) {
    if (role === 'MANAGER') where.role = { in: ['MANAGER', 'BOTH'] }
    else if (role === 'ENGINEER') where.role = { in: ['ENGINEER', 'BOTH'] }
    else where.role = String(role)
  }

  const data = await prisma.person.findMany({
    where,
    include: { aliases: { select: { raw: true } } },
    orderBy: { fullName: 'asc' },
  })

  res.json({ data: data.map(p => ({ ...p, aliases: p.aliases.map(a => a.raw) })) })
})

router.get('/:id', async (req, res) => {
  const person = await prisma.person.findUnique({
    where: { id: req.params.id },
    include: { aliases: { select: { raw: true } } },
  })
  if (!person) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Person not found' } })
    return
  }
  res.json({ ...person, aliases: person.aliases.map(a => a.raw) })
})

export default router
