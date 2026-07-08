import { prisma } from '../lib/prisma'
import { sendMail, isMailConfigured, actionItemReminderEmail } from './mailService'

// Sends "due tomorrow" and "overdue" reminder emails for action items with an
// owner email set, at most once per day per item (tracked via lastReminderSentAt).
export async function runActionItemReminders(): Promise<{ checked: number; sent: number; skipped: number }> {
  if (!isMailConfigured()) {
    console.log('Action item reminders: email not configured, skipping run')
    return { checked: 0, sent: 0, skipped: 0 }
  }

  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrow = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000)
  const dayAfterTomorrow = new Date(startOfToday.getTime() + 2 * 24 * 60 * 60 * 1000)

  const candidates = await prisma.actionItem.findMany({
    where: {
      status: { not: 'Resolved' },
      ownerEmail: { not: null },
      dueDate: { not: null },
    },
  })

  let sent = 0
  let skipped = 0

  for (const item of candidates) {
    if (!item.dueDate || !item.ownerEmail) continue

    const isOverdue = item.dueDate.getTime() < startOfToday.getTime()
    const isDueTomorrow = item.dueDate.getTime() >= tomorrow.getTime() && item.dueDate.getTime() < dayAfterTomorrow.getTime()
    if (!isOverdue && !isDueTomorrow) continue

    const kind = isOverdue ? 'overdue' : 'due_soon'
    const alreadySentToday = item.lastReminderSentAt && item.lastReminderSentAt.getTime() >= startOfToday.getTime() && item.lastReminderKind === kind
    if (alreadySentToday) { skipped++; continue }

    try {
      const { subject, html } = actionItemReminderEmail(item, kind)
      await sendMail(item.ownerEmail, subject, html)
      await prisma.actionItem.update({ where: { id: item.id }, data: { lastReminderSentAt: new Date(), lastReminderKind: kind } })
      sent++
    } catch (err) {
      console.error(`Failed to send reminder for action item ${item.id}:`, err)
    }
  }

  return { checked: candidates.length, sent, skipped }
}
