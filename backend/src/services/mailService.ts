import nodemailer from 'nodemailer'

let transporter: nodemailer.Transporter | null = null
let initTried = false

function getTransporter(): nodemailer.Transporter | null {
  if (initTried) return transporter
  initTried = true

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    return null
  }

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  })
  return transporter
}

export function isMailConfigured(): boolean {
  return getTransporter() !== null
}

export function getMailSettings() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, MAIL_FROM } = process.env
  return {
    configured: isMailConfigured(),
    host: SMTP_HOST || null,
    port: SMTP_HOST ? (Number(SMTP_PORT) || 587) : null,
    user: SMTP_USER || null,
    from: MAIL_FROM || SMTP_USER || null,
    cronSchedule: process.env.ACTION_ITEM_REMINDER_CRON || '0 8 * * *',
  }
}

// Verifies the SMTP connection/credentials actually work, without sending an email.
export async function verifyMailConnection(): Promise<void> {
  const t = getTransporter()
  if (!t) {
    throw new Error('Email is not configured on this server (missing SMTP_HOST/SMTP_USER/SMTP_PASS)')
  }
  await t.verify()
}

export async function sendMail(to: string, subject: string, html: string): Promise<void> {
  const t = getTransporter()
  if (!t) {
    throw new Error('Email is not configured on this server (missing SMTP_HOST/SMTP_USER/SMTP_PASS)')
  }
  const from = process.env.MAIL_FROM || process.env.SMTP_USER
  await t.sendMail({ from, to, subject, html })
}

export function actionItemReminderEmail(item: {
  title: string; priority: string; dueDate: Date | null; meetingType: string
}, kind: 'due_soon' | 'overdue'): { subject: string; html: string } {
  const due = item.dueDate ? item.dueDate.toISOString().slice(0, 10) : 'no due date'
  const subject = kind === 'overdue'
    ? `[Overdue] Action item: ${item.title}`
    : `[Reminder] Action item due tomorrow: ${item.title}`
  const html = `
    <p>${kind === 'overdue' ? 'This action item is now <strong>overdue</strong>.' : 'This action item is <strong>due tomorrow</strong>.'}</p>
    <ul>
      <li><strong>Title:</strong> ${item.title}</li>
      <li><strong>Meeting:</strong> ${item.meetingType}</li>
      <li><strong>Priority:</strong> ${item.priority}</li>
      <li><strong>Due date:</strong> ${due}</li>
    </ul>
    <p>— CloudFuze Migration Ops Dashboard</p>
  `
  return { subject, html }
}
