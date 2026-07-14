import axios from 'axios'
import { getNeutaraConfig } from '../lib/neutaraConfig'

const FIELDS = [
  'summary', 'assignee', 'reporter', 'priority', 'status',
  'resolution', 'created', 'updated', 'duedate', 'issuetype', 'components',
]

const SLA_DAYS: Record<string, number> = { Highest: 1, High: 2, Medium: 5, Low: 10, Lowest: 14 }

function normalizeIssue(issue: any): any {
  const f   = issue.fields || {}
  const key = issue.key as string

  const priority   = f.priority?.name   || 'Medium'
  const status     = f.status?.name     || ''
  const resolution = f.resolution?.name || ''

  const DONE      = new Set(['done', 'resolved', 'closed', 'fixed', 'completed'])
  const isDone    = DONE.has(resolution.toLowerCase()) || DONE.has(status.toLowerCase())
  const createdAt = f.created        ? new Date(f.created)        : null
  const resolvedAt= f.resolutiondate ? new Date(f.resolutiondate) : null

  let resolutionDays: number | null = null
  if (createdAt) {
    const endMs  = (isDone && resolvedAt) ? resolvedAt.getTime() : Date.now()
    const diffMs = endMs - createdAt.getTime()
    if (diffMs >= 0) resolutionDays = Math.round((diffMs / 86400000) * 10) / 10
  }

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
    createdAt:      f.created     || null,
    updatedAt:      f.updated     || null,
    dueDate:        f.duedate     || null,
    resolutionDays,
    slaBreached:    resolutionDays !== null && resolutionDays > (SLA_DAYS[priority] ?? 5) ? 'Yes' : 'No',
    project:        key.includes('-') ? key.split('-')[0].toUpperCase() : '',
  }
}

export class NeutaraService {
  isConfigured(): boolean {
    const { baseUrl, apiKey } = getNeutaraConfig()
    return !!(baseUrl && apiKey)
  }

  async fetchLiveIssues(
    jql = 'ORDER BY created DESC',
    maxResults = 1000,
  ): Promise<{ rows: any[]; total: number; warnings: string[] }> {
    const { baseUrl, apiKey, email } = getNeutaraConfig()
    if (!baseUrl || !apiKey) {
      throw new Error('Neutara is not configured. Set NEUTARA_BASE_URL and NEUTARA_API_KEY in .env and restart.')
    }

    // Try every combination of auth header × API version until one returns issues
    const authHeaders = [
      `Bearer ${apiKey}`,
      `Basic ${Buffer.from(`${email}:${apiKey}`).toString('base64')}`,
      `Token ${apiKey}`,
      `ApiKey ${apiKey}`,
    ]

    let lastError = 'All auth formats and API endpoints failed'

    for (const authHeader of authHeaders) {
      const client = axios.create({
        baseURL: baseUrl,
        headers: { Authorization: authHeader, Accept: 'application/json' },
        timeout: 30000,
      })

      // Try v2 GET (offset pagination) then v3 POST (cursor)
      for (const apiVersion of ['v2', 'v3'] as const) {
        try {
          const rows: any[]  = []
          let startAt        = 0
          let total          = 0

          do {
            let data: any

            if (apiVersion === 'v2') {
              const res = await client.get('/rest/api/2/search', {
                params: {
                  jql,
                  maxResults: Math.min(100, maxResults - rows.length),
                  startAt,
                  fields: FIELDS.join(','),
                },
              })
              data = res.data
            } else {
              const res = await client.post('/rest/api/3/search/jql', {
                jql,
                maxResults: Math.min(100, maxResults - rows.length),
                startAt,
                fields: FIELDS,
              })
              data = res.data
            }

            if (!data.issues) {
              const msgs = [...(data.errorMessages ?? []), ...Object.values(data.errors ?? {})]
              throw new Error(`Neutara API error: ${msgs.join('; ') || JSON.stringify(data).slice(0, 200)}`)
            }

            total = data.total ?? rows.length + data.issues.length
            for (const issue of data.issues) rows.push(normalizeIssue(issue))
            startAt += data.issues.length

          } while (rows.length < Math.min(total, maxResults) && startAt < total)

          const warnings: string[] = []
          if (rows.length >= maxResults) warnings.push(`Showing first ${maxResults} tickets.`)
          return { rows, total, warnings }

        } catch (err: any) {
          const status = err?.response?.status
          if (status === 401 || status === 403 || status === 404 || status === 405) {
            lastError = `${apiVersion} ${status}: ${err?.response?.data?.message || err.message}`
            continue  // try next version or auth format
          }
          // Network or API-format error — surface immediately
          throw new Error(err?.response?.data?.message || err.message || String(err))
        }
      }
    }

    throw new Error(`Cannot connect to Neutara ticketing: ${lastError}. Check NEUTARA_BASE_URL and NEUTARA_API_KEY.`)
  }

  async testConnection(): Promise<{ connected: boolean; authMode?: string; error?: string }> {
    try {
      const result = await this.fetchLiveIssues('ORDER BY created DESC', 1)
      return { connected: true }
    } catch (err: any) {
      return { connected: false, error: err.message }
    }
  }
}

export const neutaraService = new NeutaraService()
