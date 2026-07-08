import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { Prisma } from '@prisma/client'
import { sendMail, isMailConfigured, actionItemReminderEmail } from '../services/mailService'

const router = Router()

router.get('/', async (req, res) => {
  const { status, meetingType, priority, owner } = req.query

  const where: Prisma.ActionItemWhereInput = {}
  if (status) where.status = String(status)
  if (meetingType) where.meetingType = String(meetingType)
  if (priority) where.priority = String(priority)
  if (owner) where.owner = String(owner)

  const data = await prisma.actionItem.findMany({ where, orderBy: { createdAt: 'desc' } })
  res.json({ data })
})

router.post('/', async (req, res) => {
  const { title, meetingType, owner, ownerEmail, priority, dueDate, status, notes } = req.body
  if (!title || !String(title).trim()) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'title is required' } })
    return
  }
  const item = await prisma.actionItem.create({
    data: {
      title: String(title).trim(),
      meetingType: meetingType || 'MBR',
      owner: owner || null,
      ownerEmail: ownerEmail || null,
      priority: priority || 'Medium',
      dueDate: dueDate ? new Date(dueDate) : null,
      status: status || 'Open',
      notes: notes || null,
    },
  })
  res.status(201).json(item)
})

router.patch('/:id', async (req, res) => {
  const { title, meetingType, owner, ownerEmail, priority, dueDate, status, notes } = req.body
  const data: Prisma.ActionItemUpdateInput = {}
  if (title !== undefined) data.title = String(title).trim()
  if (meetingType !== undefined) data.meetingType = meetingType
  if (owner !== undefined) data.owner = owner
  if (ownerEmail !== undefined) data.ownerEmail = ownerEmail
  if (priority !== undefined) data.priority = priority
  if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null
  if (status !== undefined) data.status = status
  if (notes !== undefined) data.notes = notes

  try {
    const item = await prisma.actionItem.update({ where: { id: req.params.id }, data })
    res.json(item)
  } catch {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Action item not found' } })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    await prisma.actionItem.delete({ where: { id: req.params.id } })
    res.status(204).end()
  } catch {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Action item not found' } })
  }
})

// Manual "Send Reminder Now" — emails the item's owner immediately, regardless of due date.
router.post('/:id/remind', async (req, res) => {
  const item = await prisma.actionItem.findUnique({ where: { id: req.params.id } })
  if (!item) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Action item not found' } })
    return
  }
  if (!item.ownerEmail) {
    res.status(400).json({ error: { code: 'NO_EMAIL', message: 'This action item has no owner email set' } })
    return
  }
  if (!isMailConfigured()) {
    res.status(503).json({ error: { code: 'MAIL_NOT_CONFIGURED', message: 'Email is not configured on this server yet (SMTP env vars missing)' } })
    return
  }

  const kind = item.dueDate && item.dueDate.getTime() < Date.now() ? 'overdue' : 'due_soon'
  const { subject, html } = actionItemReminderEmail(item, kind)
  await sendMail(item.ownerEmail, subject, html)
  await prisma.actionItem.update({ where: { id: item.id }, data: { lastReminderSentAt: new Date(), lastReminderKind: kind } })

  res.json({ sent: true, to: item.ownerEmail })
})

export default router
