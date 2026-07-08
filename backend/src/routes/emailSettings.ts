import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { getMailSettings, verifyMailConnection, sendMail } from '../services/mailService'

const router = Router()

router.get('/', async (req, res) => {
  const settings = getMailSettings()

  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)

  const [totalWithEmail, remindersSentTotal, remindersSentToday, pendingReminders] = await Promise.all([
    prisma.actionItem.count({ where: { ownerEmail: { not: null } } }),
    prisma.actionItem.count({ where: { lastReminderSentAt: { not: null } } }),
    prisma.actionItem.count({ where: { lastReminderSentAt: { gte: startOfToday } } }),
    prisma.actionItem.count({
      where: {
        status: { not: 'Resolved' },
        ownerEmail: { not: null },
        dueDate: { not: null, lte: new Date(Date.now() + 24 * 60 * 60 * 1000) },
      },
    }),
  ])

  res.json({
    ...settings,
    stats: { totalWithEmail, remindersSentTotal, remindersSentToday, pendingReminders },
  })
})

router.post('/test', async (req, res) => {
  const { to } = req.body
  try {
    await verifyMailConnection()
  } catch (err: any) {
    res.status(503).json({ error: { code: 'MAIL_NOT_CONFIGURED', message: err.message } })
    return
  }

  if (!to || !String(to).includes('@')) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'A valid "to" email address is required' } })
    return
  }

  try {
    await sendMail(
      String(to),
      'CloudFuze Migration Ops — test email',
      '<p>This is a test email from the CloudFuze Migration Ops Dashboard email settings page.</p><p>If you received this, SMTP is working correctly.</p>'
    )
    res.json({ sent: true, to })
  } catch (err: any) {
    res.status(502).json({ error: { code: 'SEND_FAILED', message: err.message } })
  }
})

export default router
