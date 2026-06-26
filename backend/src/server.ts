import 'dotenv/config'
import cron from 'node-cron'
import app from './app'
import { jiraService } from './services/jiraService'
import { getJiraConfig } from './lib/jiraConfig'

const PORT = process.env.PORT || 3001

app.listen(PORT, () => {
  console.log(`MigrationOps API running on http://localhost:${PORT}`)
  scheduleSyncJob()
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
