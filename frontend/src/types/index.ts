export interface Person {
  id: string
  fullName: string
  role: 'MANAGER' | 'ENGINEER' | 'BOTH'
  aliases: string[]
}

export interface Customer {
  id: string
  canonical: string
  aliases: string[]
  isPlaceholder: boolean
}

export interface Project {
  id: string
  name: string
  manager?: { id: string; fullName: string }
  accountManager?: { id: string; fullName: string }
  customer?: { id: string; canonical: string }
  status?: string
  phase?: string
  lifecycle: string
  delayStatus: 'NOT_DELAYED' | 'DELAYED' | 'AT_RISK' | 'UNKNOWN'
  delayDays?: number
  isOveraged: boolean
  migrationTypes?: string
  planType?: string
  sowStart?: string
  sowEnd?: string
  projectEnd?: string
  expectedEnd?: string
}

export interface Ticket {
  id: string
  jiraKey: string
  issueType?: string
  summary?: string
  assignee?: { id: string; fullName: string }
  reporter?: string
  components?: string
  combination?: string
  priority?: string
  status?: string
  resolution?: string
  created?: string
  updated?: string
  dueDate?: string
  firstResponseBreach: 'YES' | 'NO' | 'UNKNOWN'
  resolutionBreach: 'YES' | 'NO' | 'UNKNOWN'
  customer?: { id: string; canonical: string }
  projectManager?: { id: string; fullName: string }
  rootCause?: string
  resolutionHours?: number
}

export interface SegmentRow {
  key: string
  keyId: string | null
  value: number
  count: number
  breaches?: number
  series?: Record<string, number>
}

export interface SegmentResult {
  dimension: string
  metric: string
  rows: SegmentRow[]
  unassigned: { value: number; count: number }
  total: { count: number; breaches: number }
}

export interface ManagerOverview {
  manager: { id: string; fullName: string }
  activeProjects: { onTime: number; delayed: number; atRisk: number }
  completedProjects: { onTime: number; delayed: number; atRisk: number }
  ticketsByCustomer: { customer: string; tickets: number }[]
  ticketTotals: { total: number; breaches: number }
}

export interface AlignmentResult {
  managers: { id: string; fullName: string }[]
  engineers: { id: string; fullName: string }[]
  pairs: { managerId: string; engineerId: string; ticketCount: number; projectCount: number }[]
}

export interface JiraSyncRun {
  id: string
  startedAt: string
  finishedAt?: string
  jql: string
  fetched: number
  upserted: number
  status: 'RUNNING' | 'SUCCESS' | 'FAILED'
  error?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  page: number
  pageSize: number
  total: number
}

export type Dimension =
  | 'manager' | 'engineer' | 'customer' | 'project'
  | 'status' | 'priority' | 'slaStatus' | 'rootCause' | 'delayStatus'
  | 'issueType' | 'combination'

export type Metric =
  | 'ticketCount' | 'breachCount' | 'breachRate'
  | 'avgDelayDays' | 'avgResolutionHours' | 'projectCount'
