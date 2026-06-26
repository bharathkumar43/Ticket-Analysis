export interface JiraFieldMap {
  combination: string
  customer: string
  projectManager: string
  firstResponseSLA: string
  resolutionSLA: string
}

export interface SLAThresholds {
  Highest: number
  High: number
  Medium: number
  Low: number
  Lowest: number
}

export interface JiraConfig {
  baseUrl: string
  email: string
  token: string
  jql: string
  syncCron: string
  fieldMap: JiraFieldMap
  slaThresholds: SLAThresholds
}

function normalizeBaseUrl(raw: string): string {
  // Strip trailing /jira context root — Jira Cloud REST API lives at the domain root
  return raw.replace(/\/jira\/?$/i, '').replace(/\/$/, '')
}

export function getJiraConfig(): JiraConfig {
  return {
    baseUrl: normalizeBaseUrl(process.env.JIRA_BASE_URL || ''),
    email: process.env.JIRA_EMAIL || '',
    token: process.env.JIRA_API_TOKEN || '',
    jql: process.env.JIRA_JQL || '',
    syncCron: process.env.SYNC_CRON || '0 */6 * * *',
    fieldMap: {
      combination: process.env.JIRA_FIELD_COMBINATION || 'customfield_10100',
      customer: process.env.JIRA_FIELD_CUSTOMER || 'customfield_10101',
      projectManager: process.env.JIRA_FIELD_PM || 'customfield_10102',
      firstResponseSLA: process.env.JIRA_FIELD_FIRST_RESPONSE_SLA || 'customfield_10103',
      resolutionSLA: process.env.JIRA_FIELD_RESOLUTION_SLA || 'customfield_10104',
    },
    slaThresholds: {
      Highest: 8,
      High: 24,
      Medium: 72,
      Low: 120,
      Lowest: 168,
    },
  }
}
