import axios, { AxiosInstance } from 'axios'
import { prisma } from '../lib/prisma'
import { aliasService } from './aliasService'
import { derivedFieldService } from './derivedFieldService'
import { getJiraConfig } from '../lib/jiraConfig'
import { BreachFlag, PersonRole } from '@prisma/client'

const FIELDS = [
  'issuetype', 'summary', 'assignee', 'reporter', 'components',
  'priority', 'status', 'resolution', 'created', 'updated', 'duedate',
]

export class JiraService {
  private getClient(overrides?: { email?: string; token?: string; baseUrl?: string }): AxiosInstance {
    const config = getJiraConfig()
    const email   = overrides?.email   || config.email
    const token   = overrides?.token   || config.token
    const baseUrl = overrides?.baseUrl || config.baseUrl
    const auth    = Buffer.from(`${email}:${token}`).toString('base64')
    return axios.create({
      baseURL: baseUrl,
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: 'application/json',
      },
      timeout: 30000,
    })
  }

  async testConnection(): Promise<{ connected: boolean; error?: string; user?: string }> {
    try {
      const client = this.getClient()
      const cfg = getJiraConfig()
      console.log('[Jira] testConnection — baseUrl=%s email=%s tokenLen=%d tokenStart=%s',
        cfg.baseUrl, cfg.email, cfg.token.length, cfg.token.slice(0, 8))
      const me = await client.get('/rest/api/3/myself')
      return { connected: true, user: me.data?.displayName || me.data?.emailAddress || 'unknown' }
    } catch (err: any) {
      const data = err?.response?.data
      const status = err?.response?.status
      // Atlassian returns different shapes; surface as much as possible
      const msg =
        (typeof data === 'object' && data !== null
          ? data.message || data.errorMessages?.join('; ') || data.error || JSON.stringify(data)
          : typeof data === 'string' && data.length < 300
            ? data
            : err?.message) || 'Unknown error'
      console.error('[Jira testConnection] status=%s body=%s', status, JSON.stringify(data)?.slice(0, 400))
      return { connected: false, error: `HTTP ${status}: ${msg}` }
    }
  }

  isConfigured(): boolean {
    const config = getJiraConfig()
    return !!(config.baseUrl && config.email && config.token)
  }

  buildJql(baseJql: string, fromDate?: string, toDate?: string): string {
    // Strip any trailing ORDER BY from the base so we can control placement
    const base = baseJql.replace(/\s+ORDER BY.*/i, '').trim()

    if (fromDate && toDate) {
      return (
        `${base}\nAND (\n` +
        `    (created >= "${fromDate}" AND created < "${toDate}")\n` +
        `    OR\n` +
        `    (updated >= "${fromDate}" AND updated < "${toDate}")\n` +
        `)\nORDER BY updated DESC`
      )
    }
    return `${base}\nORDER BY updated DESC`
  }

  async runSync(fromDate?: string, toDate?: string, customJql?: string): Promise<string> {
    const config = getJiraConfig()
    if (!config.baseUrl || !config.email || !config.token) {
      throw new Error('Jira is not configured. Set JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN in backend/.env and restart the server.')
    }

    // Verify credentials before starting — search/jql silently returns 0 results when unauthenticated
    const connCheck = await this.testConnection()
    if (!connCheck.connected) {
      throw new Error(`Jira authentication failed: ${connCheck.error || '401 Unauthorized'}. Regenerate your API token at id.atlassian.com/manage-profile/security/api-tokens and update JIRA_API_TOKEN in backend/.env.`)
    }

    await derivedFieldService.loadRules()

    // customJql from UI takes precedence over the config JQL
    const baseJql = (customJql || config.jql).trim()

    let effectiveJql: string

    if (fromDate && toDate) {
      effectiveJql = this.buildJql(baseJql, fromDate, toDate)
    } else {
      // Incremental: append updated >= last-run date
      const lastRun = await prisma.jiraSyncRun.findFirst({
        where: { status: 'SUCCESS' },
        orderBy: { finishedAt: 'desc' },
      })
      if (lastRun?.finishedAt) {
        const since = lastRun.finishedAt.toISOString().split('T')[0]
        const base = baseJql.replace(/\s+ORDER BY.*/i, '').trim()
        effectiveJql = `${base}\nAND updated >= "${since}"\nORDER BY updated DESC`
      } else {
        effectiveJql = this.buildJql(baseJql)
      }
    }

    const run = await prisma.jiraSyncRun.create({
      data: { jql: effectiveJql, status: 'RUNNING' },
    })

    try {
      let nextPageToken: string | undefined = undefined
      let fetched = 0
      let upserted = 0

      const client = this.getClient()
      const allFields = [
        ...FIELDS,
        config.fieldMap.combination,
        config.fieldMap.customer,
        config.fieldMap.projectManager,
        config.fieldMap.firstResponseSLA,
        config.fieldMap.resolutionSLA,
      ]

      do {
        const response = await this.fetchPageWithCursor(client, effectiveJql, nextPageToken, allFields)

        // Jira returns { errorMessages, errors } on bad JQL / auth / project not found
        if (!response.issues) {
          const msgs: string[] = [
            ...(response.errorMessages ?? []),
            ...Object.values(response.errors ?? {}),
          ]
          throw new Error(`Jira API error: ${msgs.join('; ') || JSON.stringify(response)}`)
        }

        fetched += response.issues.length

        for (const issue of response.issues) {
          await this.upsertIssue(issue, config.fieldMap, config.slaThresholds, run.id)
          upserted++
        }

        nextPageToken = response.nextPageToken || undefined
      } while (nextPageToken && nextPageToken.length > 0)

      await prisma.jiraSyncRun.update({
        where: { id: run.id },
        data: { status: 'SUCCESS', finishedAt: new Date(), fetched, upserted },
      })

      return run.id
    } catch (error) {
      await prisma.jiraSyncRun.update({
        where: { id: run.id },
        data: { status: 'FAILED', finishedAt: new Date(), error: String(error) },
      })
      throw error
    }
  }

  private async fetchPageWithCursor(client: AxiosInstance, jql: string, nextPageToken: string | undefined, fields: string[]) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        // POST /rest/api/3/search/jql uses cursor pagination (nextPageToken), not offset (startAt)
        const body: Record<string, unknown> = { jql, maxResults: 100, fields }
        if (nextPageToken) body.nextPageToken = nextPageToken
        const res = await client.post('/rest/api/3/search/jql', body)
        return res.data
      } catch (err: any) {
        const jiraMsg =
          err?.response?.data?.errorMessages?.join('; ') ||
          err?.response?.data?.message ||
          JSON.stringify(err?.response?.data)
        const status = err?.response?.status
        const richErr = jiraMsg ? new Error(`Jira ${status}: ${jiraMsg}`) : err
        if (attempt === 3) throw richErr
        await new Promise(r => setTimeout(r, attempt * 1000))
      }
    }
    throw new Error('Unreachable')
  }

  private async upsertIssue(issue: any, fieldMap: any, thresholds: any, syncRunId: string) {
    const f = issue.fields
    const config = getJiraConfig()

    const rawAssignee = f.assignee?.displayName || null
    const rawReporter = f.reporter?.displayName || null
    const rawCustomer = f[fieldMap.customer]?.value || f[fieldMap.customer] || null
    const rawPM = f[fieldMap.projectManager]?.displayName || f[fieldMap.projectManager] || null
    const rawCombination = f[fieldMap.combination] || null

    const [assigneeId, customerId, projectManagerId] = await Promise.all([
      aliasService.resolvePerson(rawAssignee, PersonRole.ENGINEER),
      aliasService.resolveCustomer(rawCustomer),
      aliasService.resolvePerson(rawPM, PersonRole.MANAGER),
    ])

    const created = f.created ? new Date(f.created) : null
    const updated = f.updated ? new Date(f.updated) : null
    const resolutionHours = derivedFieldService.computeResolutionHours(created, updated)

    let firstResponseBreach: BreachFlag = BreachFlag.UNKNOWN
    let resolutionBreach: BreachFlag = BreachFlag.UNKNOWN

    const rawFirstResp = f[fieldMap.firstResponseSLA]
    const rawResolution = f[fieldMap.resolutionSLA]

    if (rawFirstResp !== undefined) {
      firstResponseBreach = derivedFieldService.parseSLABreachFlag(
        rawFirstResp?.completedCycles?.[0]?.breached ?? rawFirstResp
      )
    }
    if (rawResolution !== undefined) {
      resolutionBreach = derivedFieldService.parseSLABreachFlag(
        rawResolution?.completedCycles?.[0]?.breached ?? rawResolution
      )
    }

    if (resolutionBreach === BreachFlag.UNKNOWN && resolutionHours !== null) {
      resolutionBreach = derivedFieldService.computeResolutionBreach(resolutionHours, f.priority?.name, thresholds)
    }

    const rootCause = derivedFieldService.classifyRootCause(f.summary)
    const components = (f.components || []).map((c: any) => c.name).join(', ')

    const data = {
      issueType: f.issuetype?.name || null,
      summary: f.summary || null,
      assigneeId,
      reporter: rawReporter,
      components,
      combination: rawCombination,
      priority: f.priority?.name || null,
      status: f.status?.name || null,
      resolution: f.resolution?.name || null,
      created,
      updated,
      dueDate: f.duedate ? new Date(f.duedate) : null,
      firstResponseBreach,
      resolutionBreach,
      customerId,
      projectManagerId,
      rootCause,
      resolutionHours,
      syncRunId,
    }

    await prisma.ticket.upsert({
      where: { jiraKey: issue.key },
      update: data,
      create: { jiraKey: issue.key, ...data },
    })
  }

  // ── Calendar-day SLA thresholds (matches jira-dashboard frontend) ──────────
  private static readonly SLA_DAYS: Record<string, number> = {
    Highest: 1, High: 2, Medium: 5, Low: 10, Lowest: 14,
  }

  private normalizeIssue(issue: any, fieldMap: any): any {
    const f   = issue.fields
    const key = issue.key as string
    const project = key.includes('-') ? key.split('-')[0].toUpperCase() : ''

    const priority   = f.priority?.name   || 'Medium'
    const status     = f.status?.name     || ''
    const resolution = f.resolution?.name || ''

    const DONE = new Set(['done', 'resolved', 'closed', 'fixed', 'completed'])
    const isResolved = DONE.has(resolution.toLowerCase()) || DONE.has(status.toLowerCase())

    const createdAt  = f.created         ? new Date(f.created)         : null
    const resolvedAt = f.resolutiondate  ? new Date(f.resolutiondate)  : null
    const updatedAt  = f.updated         ? new Date(f.updated)         : null
    const dueDate    = f.duedate         ? new Date(f.duedate)         : null
    const labels     = Array.isArray(f.labels) ? f.labels.join(', ') : (f.labels || '')

    let resolutionDays: number | null = null
    if (createdAt) {
      const endMs = (isResolved && resolvedAt) ? resolvedAt.getTime() : Date.now()
      const diffMs = endMs - createdAt.getTime()
      if (diffMs >= 0) resolutionDays = Math.round((diffMs / 86400000) * 10) / 10
    }

    const threshold = JiraService.SLA_DAYS[priority] ?? 5
    const slaBreached = resolutionDays !== null && resolutionDays > threshold ? 'Yes' : 'No'

    const combination = f[fieldMap.combination] || ''
    const rawPM = f[fieldMap.projectManager]
    const projectManager = rawPM?.displayName || rawPM || null

    return {
      key,
      summary:       f.summary                    || '',
      assignee:      f.assignee?.displayName       || 'Unassigned',
      priority,
      status,
      issueType:     f.issuetype?.name             || 'Task',
      combination,
      resolutionDays,
      slaBreached,
      createdAt,
      updatedAt,
      resolvedAt,
      dueDate,
      labels,
      project,
      projectManager,
    }
  }

  /** Fetch issues live from Jira (no DB) — returns rows in the same shape as parseExcelFile */
  async fetchLiveIssues(jql: string, maxResults = 500, creds?: { email: string; token: string; baseUrl: string }): Promise<{ rows: any[]; jql: string; warnings: string[] }> {
    const config = getJiraConfig()
    const effectiveBaseUrl = creds?.baseUrl || config.baseUrl
    const effectiveEmail   = creds?.email   || config.email
    const effectiveToken   = creds?.token   || config.token

    if (!effectiveBaseUrl || !effectiveEmail || !effectiveToken) {
      throw new Error('Jira credentials missing. Enter your Jira Base URL, email and API token in the Connect form.')
    }

    const client = this.getClient(creds)
    const fields = [
      'issuetype', 'summary', 'assignee', 'priority', 'status',
      'resolution', 'created', 'updated', 'resolutiondate', 'duedate', 'labels',
      config.fieldMap.combination, config.fieldMap.projectManager,
    ]

    const rows: any[] = []
    let nextPageToken: string | undefined

    do {
      const body: Record<string, unknown> = {
        jql,
        maxResults: Math.min(100, maxResults - rows.length),
        fields,
      }
      if (nextPageToken) body.nextPageToken = nextPageToken

      const res  = await client.post('/rest/api/3/search/jql', body)
      const data = res.data

      if (!data.issues) {
        const msgs: string[] = [
          ...(data.errorMessages ?? []),
          ...Object.values(data.errors ?? {}),
        ]
        throw new Error(`Jira API error: ${msgs.join('; ') || JSON.stringify(data)}`)
      }

      for (const issue of data.issues) {
        rows.push(this.normalizeIssue(issue, config.fieldMap))
      }

      nextPageToken = data.nextPageToken || undefined
    } while (nextPageToken && rows.length < maxResults)

    const warnings: string[] = []
    if (rows.length >= maxResults) warnings.push(`Showing first ${maxResults} tickets — refine your JQL to narrow results.`)

    return { rows, jql, warnings }
  }

  /** Fetch full changelog for a single ticket — returns status + assignee history with durations */
  async fetchIssueChangelog(key: string, creds?: { email: string; token: string; baseUrl: string }): Promise<any> {
    const client = this.getClient(creds)

    const issueRes = await client.get(
      `/rest/api/3/issue/${encodeURIComponent(key)}?fields=summary,status,assignee,created,priority,resolution,resolutiondate`
    )
    const f = issueRes.data.fields

    // Paginate changelog (Jira Cloud returns up to 100 per page)
    const allHistory: any[] = []
    let startAt = 0
    while (true) {
      const clRes = await client.get(
        `/rest/api/3/issue/${encodeURIComponent(key)}/changelog`,
        { params: { startAt, maxResults: 100 } }
      )
      allHistory.push(...clRes.data.values)
      if (clRes.data.isLast || allHistory.length >= clRes.data.total) break
      startAt += 100
    }

    return {
      key,
      summary:   f.summary              || '',
      status:    f.status?.name         || '',
      assignee:  f.assignee?.displayName || 'Unassigned',
      priority:  f.priority?.name       || 'Medium',
      createdAt: f.created              || null,
      changelog: allHistory.map((h: any) => ({
        id:      h.id,
        created: h.created,
        author:  { displayName: h.author?.displayName || 'System' },
        items:   (h.items as any[])
          .filter((it) => it.field === 'status' || it.field === 'assignee')
          .map((it) => ({
            field:      it.field,
            fromString: it.fromString,
            toString:   it.toString,
          })),
      })).filter((h: any) => h.items.length > 0),
    }
  }

  async getStatus() {
    const config = getJiraConfig()
    const [lastRun, recentRuns] = await Promise.all([
      prisma.jiraSyncRun.findFirst({ orderBy: { startedAt: 'desc' } }),
      prisma.jiraSyncRun.findMany({ orderBy: { startedAt: 'desc' }, take: 10 }),
    ])
    return { lastRun, recentRuns, schedule: config.syncCron, baseJql: config.jql }
  }

  getConfig() {
    const cfg = getJiraConfig()
    return {
      baseUrl: cfg.baseUrl,
      email: cfg.email,
      jql: cfg.jql,
      syncCron: cfg.syncCron,
      fieldMap: cfg.fieldMap,
      slaThresholds: cfg.slaThresholds,
    }
  }
}

export const jiraService = new JiraService()
