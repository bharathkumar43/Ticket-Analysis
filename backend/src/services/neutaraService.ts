import axios from 'axios'
import { getNeutaraConfig } from '../lib/neutaraConfig'

// Priority is lowercase in Neutara ("high", "medium", "low")
const SLA_DAYS: Record<string, number> = { Highest: 1, High: 2, Medium: 5, Low: 10, Lowest: 14 }

function capitalize(s: string): string {
  if (!s) return 'Medium'
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

// Weekends don't count against the SLA clock — matches jira-dashboard's
// parseExcel.js calendarToBusinessDays so Excel uploads and live Neutara
// fetches agree on the same ticket's breach status.
function calendarToBusinessDays(calDays: number): number {
  const weeks = Math.floor(calDays / 7)
  const remainder = calDays % 7
  return weeks * 5 + Math.min(remainder, 5)
}

function normalizeIssue(issue: any): any {
  const priority    = capitalize(issue.priority || 'medium')
  const status      = issue.status?.name || ''
  const isDone      = !!issue.resolvedAt || ['done', 'resolved', 'closed'].includes(status.toLowerCase())
  const createdAt   = issue.createdAt  ? new Date(issue.createdAt)  : null
  const resolvedAt  = issue.resolvedAt ? new Date(issue.resolvedAt) : null

  let resolutionDays: number | null = null
  if (createdAt) {
    const endMs  = isDone && resolvedAt ? resolvedAt.getTime() : Date.now()
    const diffMs = endMs - createdAt.getTime()
    if (diffMs >= 0) resolutionDays = Math.round((diffMs / 86400000) * 10) / 10
  }

  return {
    key:            issue.key           || issue.id,
    cfKey:          issue.cfKey         || '',
    summary:        issue.summary       || '',
    assignee:       issue.assignee?.displayName  || 'Unassigned',
    reporter:       issue.reporter?.displayName  || '',
    priority,
    status,
    resolution:     isDone ? 'Done' : '',
    issueType:      issue.type          || 'Task',
    project:        issue.spaceKey      || '',
    spaceName:      issue.spaceName     || '',
    customerName:   issue.customerName  || issue.clientName || issue.manageClientName || '',
    projectManager: issue.projectManager || '',
    combination:    issue.combination   || '',
    rootCause:      issue.rootCause     || '',
    labels:         Array.isArray(issue.labels) ? issue.labels.join(', ') : (issue.labels || ''),
    dueDate:        issue.dueDate       || null,
    createdAt:      issue.createdAt     || null,
    updatedAt:      issue.updatedAt     || null,
    resolvedAt:     issue.resolvedAt    || null,
    resolutionDays,
    slaBreached: (() => {
      if (resolutionDays === null) return 'No'
      const businessDays = calendarToBusinessDays(resolutionDays)
      return businessDays > (SLA_DAYS[priority] ?? 5) ? 'Yes' : 'No'
    })(),
  }
}

export class NeutaraService {
  isConfigured(): boolean {
    const { baseUrl, apiKey } = getNeutaraConfig()
    return !!(baseUrl && apiKey)
  }

  private getClient() {
    const { baseUrl, apiKey } = getNeutaraConfig()
    return axios.create({
      baseURL: baseUrl,
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      timeout: 120000, // 2 minutes per request — Neutara API can be slow
    })
  }

  async testConnection(): Promise<{ connected: boolean; total?: number; error?: string }> {
    try {
      const res = await this.getClient().get('/api/issues', { params: { limit: 1, page: 1 } })
      return { connected: true, total: res.data.total }
    } catch (err: any) {
      return { connected: false, error: err?.response?.data?.message || err.message }
    }
  }

  async fetchLiveIssues(
    maxResults = 200,
  ): Promise<{ rows: any[]; total: number; warnings: string[] }> {
    const { baseUrl, apiKey } = getNeutaraConfig()
    if (!baseUrl || !apiKey) {
      throw new Error('Neutara is not configured. Set NEUTARA_BASE_URL and NEUTARA_API_KEY in .env and restart.')
    }

    const client    = this.getClient()
    const pageSize  = 50  // smaller pages respond faster
    const PARALLEL  = 3   // fetch 3 pages at once

    // Fetch page 1 first to get total count
    const first = await client.get('/api/issues', { params: { limit: pageSize, page: 1 } })
    const total      = first.data.total      ?? 0
    const totalPages = first.data.totalPages ?? 1
    const rows: any[] = (first.data.issues || []).map(normalizeIssue)

    // Calculate remaining pages needed (up to maxResults)
    const pagesNeeded = Math.min(totalPages, Math.ceil(maxResults / pageSize))
    const remainingPages = Array.from({ length: pagesNeeded - 1 }, (_, i) => i + 2)

    // Fetch remaining pages in parallel batches of PARALLEL
    for (let i = 0; i < remainingPages.length && rows.length < maxResults; i += PARALLEL) {
      const batch = remainingPages.slice(i, i + PARALLEL)
      const results = await Promise.all(
        batch.map(page => client.get('/api/issues', { params: { limit: pageSize, page } }))
      )
      for (const res of results) {
        for (const issue of (res.data.issues || [])) {
          rows.push(normalizeIssue(issue))
        }
      }
    }

    const warnings: string[] = []
    if (total > maxResults) {
      warnings.push(`Showing ${rows.length} of ${total.toLocaleString()} total tickets.`)
    }

    return { rows: rows.slice(0, maxResults), total, warnings }
  }
}

export const neutaraService = new NeutaraService()
