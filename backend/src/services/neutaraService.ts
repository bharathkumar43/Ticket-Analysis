import axios from 'axios'
import { getNeutaraConfig } from '../lib/neutaraConfig'

// Priority is lowercase in Neutara ("high", "medium", "low")
const SLA_DAYS: Record<string, number> = { Highest: 1, High: 2, Medium: 5, Low: 10, Lowest: 14 }

function capitalize(s: string): string {
  if (!s) return 'Medium'
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
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
    slaBreached:    resolutionDays !== null && resolutionDays > (SLA_DAYS[priority] ?? 5) ? 'Yes' : 'No',
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
      timeout: 30000,
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
    maxResults = 500,
  ): Promise<{ rows: any[]; total: number; warnings: string[] }> {
    const { baseUrl, apiKey } = getNeutaraConfig()
    if (!baseUrl || !apiKey) {
      throw new Error('Neutara is not configured. Set NEUTARA_BASE_URL and NEUTARA_API_KEY in .env and restart.')
    }

    const client   = this.getClient()
    const pageSize = 100
    const rows: any[] = []
    let page       = 1
    let total      = 0
    let totalPages = 1

    do {
      const res  = await client.get('/api/issues', { params: { limit: pageSize, page } })
      const data = res.data

      total      = data.total      ?? 0
      totalPages = data.totalPages ?? 1

      for (const issue of (data.issues || [])) {
        rows.push(normalizeIssue(issue))
      }

      page++
    } while (page <= totalPages && rows.length < maxResults)

    const warnings: string[] = []
    if (rows.length >= maxResults) {
      warnings.push(`Showing first ${maxResults} of ${total} tickets. The data source has more.`)
    }

    return { rows, total, warnings }
  }
}

export const neutaraService = new NeutaraService()
