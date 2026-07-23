import { Router } from 'express'
import { jiraService } from '../services/jiraService'
import { getJiraConfig } from '../lib/jiraConfig'

const router = Router()

router.post('/sync', async (req, res) => {
  if (!jiraService.isConfigured()) {
    res.status(400).json({ error: { code: 'JIRA_NOT_CONFIGURED', message: 'Jira is not configured. Set JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN in backend/.env and restart the server.' } })
    return
  }

  const { fromDate, toDate, jql } = req.body as { fromDate?: string; toDate?: string; jql?: string }

  if ((fromDate && !toDate) || (!fromDate && toDate)) {
    res.status(400).json({ error: { code: 'INVALID_DATES', message: 'Both fromDate and toDate must be provided together (YYYY-MM-DD).' } })
    return
  }

  try {
    const runId = await jiraService.runSync(fromDate, toDate, jql)
    const { prisma } = await import('../lib/prisma')
    const run = await prisma.jiraSyncRun.findUnique({ where: { id: runId } })
    res.json(run)
  } catch (err: any) {
    const msg = err?.message || 'Sync failed'
    const isAuth = msg.includes('authentication failed') || msg.includes('401')
    // Use 502 (Bad Gateway) for Jira auth failures — 401 would incorrectly trigger the
    // frontend session-expiry redirect, logging the user out of the app.
    res.status(isAuth ? 502 : 500).json({ error: { code: isAuth ? 'JIRA_AUTH_FAILED' : 'SYNC_ERROR', message: msg } })
  }
})

// Preview the JQL that will be executed — supports custom jql override
router.get('/jql-preview', (req, res) => {
  const { fromDate, toDate, jql: customJql } = req.query as { fromDate?: string; toDate?: string; jql?: string }
  const config = getJiraConfig()
  const base = (customJql || config.jql).trim()
  const jql = jiraService.buildJql(base, fromDate, toDate)
  res.json({ jql })
})

router.get('/status', async (req, res) => {
  const status = await jiraService.getStatus()
  res.json(status)
})

router.get('/config', (req, res) => {
  res.json(jiraService.getConfig())
})

router.get('/test', async (req, res) => {
  const result = await jiraService.testConnection()
  res.json(result)
})

// Extract per-request Jira credentials from headers (override .env values)
function extractCreds(req: any): { email: string; token: string; baseUrl: string } | undefined {
  const email   = req.headers['x-jira-email']   as string | undefined
  const token   = req.headers['x-jira-token']   as string | undefined
  const baseUrl = req.headers['x-jira-baseurl'] as string | undefined
  if (email && token && baseUrl) return { email, token, baseUrl }
  return undefined
}

// Fetch issues live from Jira (no DB write) — returns rows in parseExcelFile format
router.get('/live-issues', async (req, res) => {
  const creds = extractCreds(req)
  if (!creds && !jiraService.isConfigured()) {
    res.status(400).json({ error: { code: 'JIRA_NOT_CONFIGURED', message: 'Enter your Jira email, API token and base URL in the Connect form.' } })
    return
  }
  const { jql, max } = req.query as { jql?: string; max?: string }
  if (!jql?.trim()) {
    res.status(400).json({ error: { code: 'MISSING_JQL', message: 'jql query parameter is required' } })
    return
  }
  // Default high enough that a full team/board report doesn't silently truncate —
  // callers that genuinely want a quick preview can pass a smaller ?max=.
  const maxResults = max ? parseInt(max, 10) : 2000
  try {
    const result = await jiraService.fetchLiveIssues(jql.trim(), maxResults, creds)
    res.json(result)
  } catch (err: any) {
    const msg = err?.message || 'Fetch failed'
    const isAuth = msg.includes('401') || msg.includes('authentication') || msg.includes('Client must be authenticated')
    res.status(isAuth ? 502 : 500).json({ error: { code: isAuth ? 'JIRA_AUTH_FAILED' : 'FETCH_ERROR', message: msg } })
  }
})

// Return full status + assignee changelog for a single ticket
router.get('/issue/:key/changelog', async (req, res) => {
  const creds = extractCreds(req)
  if (!creds && !jiraService.isConfigured()) {
    res.status(400).json({ error: { code: 'JIRA_NOT_CONFIGURED', message: 'Enter your Jira email, API token and base URL in the Connect form.' } })
    return
  }
  const { key } = req.params
  try {
    const result = await jiraService.fetchIssueChangelog(key, creds)
    res.json(result)
  } catch (err: any) {
    const msg = err?.message || 'Changelog fetch failed'
    res.status(500).json({ error: { code: 'CHANGELOG_ERROR', message: msg } })
  }
})

export default router
