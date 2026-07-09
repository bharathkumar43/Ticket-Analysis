import axios from 'axios'
import { prisma } from '../lib/prisma'

// Returns true if Azure AD is configured (required to send via Graph API)
export function isMailConfigured(): boolean {
  return !!(process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET)
}

export function getMailSettings() {
  return {
    configured: isMailConfigured(),
    provider:   'microsoft-graph',
    cronSchedule: process.env.ACTION_ITEM_REMINDER_CRON || '0 8 * * *',
  }
}

// Get a fresh access token for mail sending using the stored refresh token
// of any user who has logged in with Microsoft.
async function getGraphAccessToken(): Promise<{ token: string; senderEmail: string }> {
  const user = await prisma.user.findFirst({
    where: { msRefreshToken: { not: null } },
    orderBy: { createdAt: 'desc' },
  })

  if (!user?.msRefreshToken) {
    throw new Error('No Microsoft session found — a user must log in with Microsoft at least once before reminders can be sent.')
  }

  const tenantId = process.env.AZURE_TENANT_ID || 'common'

  const resp = await axios.post<{ access_token: string; refresh_token?: string }>(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    new URLSearchParams({
      client_id:     process.env.AZURE_CLIENT_ID     || '',
      client_secret: process.env.AZURE_CLIENT_SECRET || '',
      refresh_token: user.msRefreshToken,
      grant_type:    'refresh_token',
      scope:         'Mail.Send',
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  )

  // Microsoft rotates refresh tokens — always store the latest one
  if (resp.data.refresh_token) {
    await prisma.user.update({
      where: { id: user.id },
      data:  { msRefreshToken: resp.data.refresh_token },
    })
  }

  return { token: resp.data.access_token, senderEmail: user.email || user.username }
}

// Verifies we can get an access token (used by the test endpoint)
export async function verifyMailConnection(): Promise<string> {
  if (!isMailConfigured()) {
    throw new Error('Azure AD is not configured (missing AZURE_CLIENT_ID or AZURE_CLIENT_SECRET).')
  }
  const { senderEmail } = await getGraphAccessToken()
  return senderEmail
}

export async function sendMail(to: string, subject: string, html: string): Promise<void> {
  const { token } = await getGraphAccessToken()

  await axios.post(
    'https://graph.microsoft.com/v1.0/me/sendMail',
    {
      message: {
        subject,
        body:         { contentType: 'HTML', content: html },
        toRecipients: [{ emailAddress: { address: to } }],
      },
      saveToSentItems: false,
    },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  )
}

export function actionItemReminderEmail(
  item: { title: string; priority: string; dueDate: Date | null; meetingType: string },
  kind: 'due_soon' | 'overdue'
): { subject: string; html: string } {
  const due = item.dueDate ? item.dueDate.toISOString().slice(0, 10) : 'no due date'
  const subject = kind === 'overdue'
    ? `[Overdue] Action item: ${item.title}`
    : `[Reminder] Action item due tomorrow: ${item.title}`
  const html = `
    <p>${kind === 'overdue'
      ? 'This action item is now <strong>overdue</strong>.'
      : 'This action item is <strong>due tomorrow</strong>.'}</p>
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
