import { Router } from 'express'
import { prisma } from '../lib/prisma'

const router = Router()

// Customer aliases
router.get('/customers', async (req, res) => {
  const aliases = await prisma.customerAlias.findMany({
    include: { customer: { select: { id: true, canonical: true } } },
    orderBy: { raw: 'asc' },
  })
  res.json({ data: aliases })
})

router.post('/customers', async (req, res) => {
  const { raw, customerId } = req.body
  if (!raw || !customerId) {
    res.status(400).json({ error: { code: 'MISSING_FIELDS', message: 'raw and customerId required' } })
    return
  }
  const alias = await prisma.customerAlias.upsert({
    where: { raw },
    update: { customerId },
    create: { raw, customerId },
  })
  res.json(alias)
})

router.delete('/customers/:raw', async (req, res) => {
  await prisma.customerAlias.delete({ where: { raw: req.params.raw } })
  res.json({ ok: true })
})

// Person aliases
router.get('/people', async (req, res) => {
  const aliases = await prisma.personAlias.findMany({
    include: { person: { select: { id: true, fullName: true } } },
    orderBy: { raw: 'asc' },
  })
  res.json({ data: aliases })
})

router.post('/people', async (req, res) => {
  const { raw, personId } = req.body
  if (!raw || !personId) {
    res.status(400).json({ error: { code: 'MISSING_FIELDS', message: 'raw and personId required' } })
    return
  }
  const alias = await prisma.personAlias.upsert({
    where: { raw },
    update: { personId },
    create: { raw, personId },
  })
  res.json(alias)
})

router.delete('/people/:raw', async (req, res) => {
  await prisma.personAlias.delete({ where: { raw: req.params.raw } })
  res.json({ ok: true })
})

export default router
