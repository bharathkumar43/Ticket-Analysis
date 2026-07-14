import axios, { AxiosInstance } from 'axios'
import { getNeutaraConfig } from '../lib/neutaraConfig'

const FIELDS = [
  'summary', 'assignee', 'reporter', 'priority', 'status',
  'resolution', 'created', 'updated', 'duedate', 'issuetype',
  'components', 'labels',
]

export class NeutaraService {
  isConfigured(): boolean {
    const { baseUrl, apiKey } = getNeutaraConfig()
    return !!(baseUrl && apiKey)
  }

  // Try Bearer token first (standard for nta_ API keys), fall back to Basic auth
  private makeClient(authMode: 'bearer' | 'basic' = 'bearer'): AxiosInstance {
    const { baseUrl, apiKey, email } = getNeutaraConfig()
    const authHeader =
      authMode === 'bearer'
        ? `Bearer ${apiKey}`
        : `Basic ${Buffer.from(`${email}:${apiKey}`).toString('base64')}`

    return axios.create({
      baseURL: baseUrl,
      headers: { Authorization: authHeader, Accept: 'application/json' },
      timeout: 30000,
    })
  }

  async testConnection(): Promise<{ connected: boolean; error?: string; user?: string; authMode?: string }> {
    for (const mode of ['bearer', 'basic'] as const) {
      try {
        const client = this.makeClient(mode)
        // Try v2 /myself first, fall back to v3
        let user = 'unknown'
        try {
          const me = await client.get('/rest/api/2/myself')
          user = me.data?.displayName || me.data?.emailAddress || me.data?.name || 'unknown'
        } catch {
          const me = await client.get('/rest/api/3/myself')
          user = me.data?.displayName || me.data?.emailAddress || 'unknown'
        }
        return { connected: true, user, authMode: mode }
      } catch (err: any) {
        if (err?.response?.status !== 401 && err?.response?.status !== 403) {
          return { connected: false, error: `HTTP ${err?.response?.status}: ${err?.message}` }
        }
        // 401/403 on bearer → try basic
      }
    }
    return { connected: false, error: 'Authentication failed with both Bearer and Basic auth. Check NEUTARA_API_KEY and NEUTARA_EMAIL.' }
  }

  private normalizeIssue(issue: any): any {
    const f   = issue.fields || {}
    const key = issue.key as string

    const priority   = f.priority?.name   || 'Medium'
    const status     = f.status?.name     || ''
    const resolution = f.resolution?.name || ''

    const DONE = new Set(['done', 'resolved', 'closed', 'fixed', 'completed'])
    const isResolved = DONE.has(resolution.toLowerCase()) || DONE.has(status.toLowerCase())

    const createdAt  = f.created        ? new Date(f.created)        : null
    const resolvedAt = f.resolutiondate ? new Date(f.resolutiondate) : null

    let resolutionDays: number | null = null
    if (createdAt) {
      const endMs = (isResolved && resolvedAt) ? resolvedAt.getTime() : Date.now()
      const diffMs = endMs - createdAt.getTime()
      if (diffMs >= 0) resolutionDays = Math.round((diffMs / 86400000) * 10) / 10
    }

    const SLA_DAYS: Record<string, number> = { Highest: 1, High: 2, Medium: 5, Low: 10, Lowest: 14 }
    const slaBreached = resolutionDays !== null && resolutionDays > (SLA_DAYS[priority] ?? 5) ? 'Yes' : 'No'

    return {
      key,
      summary:        f.summary                    || '',
      assignee:       f.assignee?.displayName       || 'Unassigned',
      reporter:       f.reporter?.displayName       || '',
      priority,
      status,
      resolution,
      issueType:      f.issuetype?.name             || 'Task',
      components:     (f.components || []).map((c: any) => c.name).join(', '),
      labels:         (f.labels     || []).join(', '),
      createdAt:      f.created     || null,
      updatedAt:      f.updated     || null,
      dueDate:        f.duedate     || null,
      resolutionDays,
      slaBreached,
    }
  }

  async fetchLiveIssues(jql = 'ORDER BY created DESC', maxResults = 500): Promise<{ rows: any[]; total: number; warnings: string[] }> {
    const { baseUrl, apiKey } = getNeutaraConfig()
    if (!baseUrl || !apiKey) {
      throw new Error('Neutara is not configured. Set NEUTARA_BASE_URL and NEUTARA_API_KEY in .env and restart.')
    }

    // Detect which auth mode works
    const test = await this.testConnection()
    if (!test.connected) throw new Error(test.error || 'Cannot connect to Neutara')

    const client = this.makeClient(test.authMode as 'bearer' | 'basic')
    const rows: any[] = []
    let startAt = 0
    let total   = 0

    do {
      // Try v2 search first (simpler offset pagination), fall back to v3
      let data: any
      try {
        const res = await client.get('/rest/api/2/search', {
          params: { jql, maxResults: Math.min(100, maxResults - rows.length), startAt, fields: FIELDS.join(',') },
        })
        data = res.data
      } catch {
        const res = await client.post('/rest/api/3/search/jql', {
          jql, maxResults: Math.min(100, maxResults - rows.length), startAt, fields: FIELDS,
        })
        data = res.data
      }

      if (!data.issues) {
        const msgs = [...(data.errorMessages ?? []), ...Object.values(data.errors ?? {})]
        throw new Error(`Neutara API error: ${msgs.join('; ') || JSON.stringify(data)}`)
      }

      total = data.total ?? data.issues.length
      for (const issue of data.issues) rows.push(this.normalizeIssue(issue))
      startAt += data.issues.length

    } while (rows.length < Math.min(total, maxResults) && startAt < total)

    const warnings: string[] = []
    if (rows.length >= maxResults) warnings.push(`Showing first ${maxResults} tickets.`)

    return { rows, total, warnings }
  }
}

export const neutaraService = new NeutaraService()
