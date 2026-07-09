import 'dotenv/config'

process.on('unhandledRejection', (reason) => {
  console.error('💥 Unhandled Rejection:', reason)
  process.exit(1)
})
process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught Exception:', err)
  process.exit(1)
})

import cron from 'node-cron'
import app from './app'
import { jiraService } from './services/jiraService'
import { getJiraConfig } from './lib/jiraConfig'
import { runActionItemReminders } from './services/actionItemReminderService'
import { isMailConfigured } from './services/mailService'

const PORT = process.env.PORT || 3600

app.listen(PORT, () => {
  console.log(`MigrationOps API running on http://localhost:${PORT}`)
  scheduleSyncJob()
  scheduleActionItemReminders()
})

function scheduleSyncJob() {
  const { syncCron, baseUrl } = getJiraConfig()
  if (!baseUrl) {
    console.log('Jira not configured — skipping scheduled sync')
    return
  }

  if (!cron.validate(syncCron)) {
    console.warn(`Invalid SYNC_CRON expression: ${syncCron}`)
    return
  }

  cron.schedule(syncCron, async () => {
    console.log('Running scheduled Jira sync...')
    try {
      await jiraService.runSync()
      console.log('Scheduled sync complete')
    } catch (err) {
      console.error('Scheduled sync failed:', err)
    }
  })

  console.log(`Jira sync scheduled: ${syncCron}`)
}

function scheduleActionItemReminders() {
  if (!isMailConfigured()) {
    console.log('Action item email reminders: SMTP not configured — cron will run but skip sending')
  }

  const reminderCron = process.env.ACTION_ITEM_REMINDER_CRON || '0 8 * * *' // daily at 8am
  if (!cron.validate(reminderCron)) {
    console.warn(`Invalid ACTION_ITEM_REMINDER_CRON expression: ${reminderCron}`)
    return
  }

  cron.schedule(reminderCron, async () => {
    console.log('Running action item reminder check...')
    try {
      const result = await runActionItemReminders()
      console.log(`Action item reminders: checked ${result.checked}, sent ${result.sent}, skipped ${result.skipped}`)
    } catch (err) {
      console.error('Action item reminder run failed:', err)
    }
  })

  console.log(`Action item reminders scheduled: ${reminderCron}`)
}
