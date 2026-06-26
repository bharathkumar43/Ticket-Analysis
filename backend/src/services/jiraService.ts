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
  private getClient(): AxiosInstance {
    const config = getJiraConfig()
    const token = Buffer.from(`${config.email}:${config.token}`).toString('base64')
    return axios.create({
      baseURL: config.baseUrl,
      headers: {
        Authorization: `Basic ${token}`,
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
