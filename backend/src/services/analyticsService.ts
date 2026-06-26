import { Prisma, BreachFlag } from '@prisma/client'
import { prisma } from '../lib/prisma'

export type Dimension =
  | 'manager'
  | 'engineer'
  | 'customer'
  | 'project'
  | 'status'
  | 'priority'
  | 'slaStatus'
  | 'rootCause'
  | 'delayStatus'
  | 'issueType'
  | 'combination'

export type Metric =
  | 'ticketCount'
  | 'breachCount'
  | 'breachRate'
  | 'avgDelayDays'
  | 'avgResolutionHours'
  | 'projectCount'

export interface SegmentFilters {
  from?: string
  to?: string
  dateField?: 'created' | 'updated'
  priority?: string
  status?: string
  customerId?: string
  managerId?: string
  assigneeId?: string
  breach?: 'resolution' | 'firstResponse' | 'any'
  lifecycle?: 'ACTIVE' | 'COMPLETED'
  entityId?: string
  subDimension?: string
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
  dimension: Dimension
  metric: Metric
  rows: SegmentRow[]
  unassigned: { value: number; count: number }
  total: { count: number; breaches: number }
}

export class AnalyticsService {
  async segment(dimension: Dimension, metric: Metric, filters: SegmentFilters): Promise<SegmentResult> {
    const where = this.buildTicketWhere(filters)

    if (metric === 'projectCount' || metric === 'avgDelayDays') {
      return this.segmentProjects(dimension, metric, filters)
    }

    const tickets = await prisma.ticket.findMany({
      where,
      select: {
        id: true,
        priority: true,
        status: true,
        issueType: true,
        combination: true,
        resolutionBreach: true,
        firstResponseBreach: true,
        rootCause: true,
        resolutionHours: true,
        customerId: true,
        projectManagerId: true,
        assigneeId: true,
        customer: { select: { id: true, canonical: true, isPlaceholder: true } },
        projectManager: { select: { id: true, fullName: true } },
        assignee: { select: { id: true, fullName: true } },
      },
    })

    const grouped = new Map<string, { key: string; keyId: string | null; tickets: typeof tickets }>()

    for (const ticket of tickets) {
      const { key, keyId } = this.getDimensionKey(ticket, dimension)
      if (!grouped.has(keyId ?? key)) {
        grouped.set(keyId ?? key, { key, keyId, tickets: [] })
      }
      grouped.get(keyId ?? key)!.tickets.push(ticket)
    }

    const rows: SegmentRow[] = []
    let unassignedCount = 0
    let totalBreaches = 0

    for (const [, { key, keyId, tickets: group }] of grouped) {
      // Only flag unassigned when the key itself says so — keyId being null is normal for
      // value-based dimensions (status, priority, rootCause) that have no DB row id.
      const isUnassigned = key === 'Unassigned' || key === '' || key === null
      const count = group.length
      const breaches = group.filter(t =>
        t.resolutionBreach === BreachFlag.YES || t.firstResponseBreach === BreachFlag.YES
      ).length

      totalBreaches += breaches

      const value = this.computeMetric(metric, group)

      let series: Record<string, number> | undefined
      if (filters.subDimension) {
        series = {}
        for (const t of group) {
          const { key: sk } = this.getDimensionKey(t, filters.subDimension as Dimension)
          series[sk] = (series[sk] || 0) + 1
        }
      }

      if (isUnassigned) {
        unassignedCount = count
      } else {
        rows.push({ key, keyId, value, count, breaches, ...(series ? { series } : {}) })
      }
    }

    rows.sort((a, b) => b.value - a.value)

    return {
      dimension,
      metric,
      rows,
      unassigned: { value: 0, count: unassignedCount },
      total: { count: tickets.length, breaches: totalBreaches },
    }
  }

  private getDimensionKey(ticket: any, dimension: Dimension): { key: string; keyId: string | null } {
    switch (dimension) {
      case 'manager':
        return {
          key: ticket.projectManager?.fullName || 'Unassigned',
          keyId: ticket.projectManagerId || null,
        }
      case 'engineer':
        return {
          key: ticket.assignee?.fullName || 'Unassigned',
          keyId: ticket.assigneeId || null,
        }
      case 'customer':
        return {
          key: ticket.customer?.canonical || 'Unassigned',
          keyId: ticket.customerId || null,
        }
      case 'status':
        return { key: ticket.status || 'Unknown', keyId: null }
      case 'priority':
        return { key: ticket.priority || 'Unknown', keyId: null }
      case 'slaStatus':
        return {
          key: ticket.resolutionBreach === BreachFlag.YES ? 'Breached' :
               ticket.resolutionBreach === BreachFlag.NO ? 'Within SLA' : 'Unknown',
          keyId: null,
        }
      case 'rootCause':
        return { key: ticket.rootCause || 'Other', keyId: null }
      case 'issueType':
        return { key: ticket.issueType || 'Unknown', keyId: null }
      case 'combination':
        return { key: ticket.combination || 'Unspecified', keyId: null }
      default:
        return { key: String(ticket[dimension] || 'Unknown'), keyId: null }
    }
  }

  private computeMetric(metric: Metric, tickets: any[]): number {
    if (tickets.length === 0) return 0
    switch (metric) {
      case 'ticketCount':
        return tickets.length
      case 'breachCount':
        return tickets.filter(t => t.resolutionBreach === BreachFlag.YES || t.firstResponseBreach === BreachFlag.YES).length
      case 'breachRate': {
        const breaches = tickets.filter(t => t.resolutionBreach === BreachFlag.YES || t.firstResponseBreach === BreachFlag.YES).length
        return parseFloat((breaches / tickets.length).toFixed(4))
      }
      case 'avgResolutionHours': {
        const withHours = tickets.filter(t => t.resolutionHours !== null)
        if (withHours.length === 0) return 0
        return parseFloat((withHours.reduce((s, t) => s + t.resolutionHours, 0) / withHours.length).toFixed(2))
      }
      default:
        return tickets.length
    }
  }

  private async segmentProjects(dimension: Dimension, metric: Metric, filters: SegmentFilters): Promise<SegmentResult> {
    const where: Prisma.ProjectWhereInput = {}
    if (filters.lifecycle) where.lifecycle = filters.lifecycle
    if (filters.managerId) where.managerId = filters.managerId
    if (filters.customerId) where.customerId = filters.customerId

    const projects = await prisma.project.findMany({
      where,
      select: {
        id: true,
        delayStatus: true,
        delayDays: true,
        lifecycle: true,
        managerId: true,
        customerId: true,
        manager: { select: { id: true, fullName: true } },
        customer: { select: { id: true, canonical: true } },
      },
    })

    const grouped = new Map<string, { key: string; keyId: string | null; projects: typeof projects }>()

    for (const p of projects) {
      const key =
        dimension === 'manager' ? (p.manager?.fullName || 'Unassigned') :
        dimension === 'delayStatus' ? String(p.delayStatus) :
        dimension === 'customer' ? (p.customer?.canonical || 'Unassigned') : 'All'
      const keyId =
        dimension === 'manager' ? p.managerId :
        dimension === 'customer' ? p.customerId : null

      const mapKey = keyId ?? key
      if (!grouped.has(mapKey)) {
        grouped.set(mapKey, { key, keyId, projects: [] })
      }
      grouped.get(mapKey)!.projects.push(p)
    }

    const rows: SegmentRow[] = []
    for (const [, { key, keyId, projects: group }] of grouped) {
      const count = group.length
      const value =
        metric === 'projectCount' ? count :
        metric === 'avgDelayDays' ? (group.reduce((s, p) => s + (p.delayDays || 0), 0) / (count || 1)) : count

      rows.push({ key, keyId, value: parseFloat(value.toFixed(2)), count })
    }

    rows.sort((a, b) => b.value - a.value)

    return {
      dimension,
      metric,
      rows,
      unassigned: { value: 0, count: 0 },
      total: { count: projects.length, breaches: 0 },
    }
  }

  async managerOverview(managerId: string) {
    const manager = await prisma.person.findUnique({ where: { id: managerId } })
    if (!manager) return null

    const [activeProjects, completedProjects, tickets] = await Promise.all([
      prisma.project.findMany({ where: { managerId, lifecycle: 'ACTIVE' }, select: { delayStatus: true } }),
      prisma.project.findMany({ where: { managerId, lifecycle: 'COMPLETED' }, select: { delayStatus: true } }),
      prisma.ticket.findMany({
        where: { projectManagerId: managerId },
        select: {
          resolutionBreach: true,
          firstResponseBreach: true,
          customerId: true,
          customer: { select: { canonical: true } },
        },
      }),
    ])

    const countByDelayStatus = (projects: { delayStatus: string }[]) => ({
      onTime: projects.filter(p => p.delayStatus === 'NOT_DELAYED').length,
      delayed: projects.filter(p => p.delayStatus === 'DELAYED').length,
      atRisk: projects.filter(p => p.delayStatus === 'AT_RISK').length,
    })

    const byCustomer = new Map<string, number>()
    for (const t of tickets) {
      const name = t.customer?.canonical || 'Unassigned'
      byCustomer.set(name, (byCustomer.get(name) || 0) + 1)
    }

    const ticketsByCustomer = Array.from(byCustomer.entries())
      .map(([customer, tickets]) => ({ customer, tickets }))
      .sort((a, b) => b.tickets - a.tickets)
      .slice(0, 15)

    const breaches = tickets.filter(
      t => t.resolutionBreach === BreachFlag.YES || t.firstResponseBreach === BreachFlag.YES
    ).length

    return {
      manager: { id: manager.id, fullName: manager.fullName },
      activeProjects: countByDelayStatus(activeProjects),
      completedProjects: countByDelayStatus(completedProjects),
      ticketsByCustomer,
      ticketTotals: { total: tickets.length, breaches },
    }
  }

  async alignment() {
    const [managers, engineers, pairs] = await Promise.all([
      prisma.person.findMany({ where: { role: { in: ['MANAGER', 'BOTH'] } }, select: { id: true, fullName: true } }),
      prisma.person.findMany({ where: { role: { in: ['ENGINEER', 'BOTH'] } }, select: { id: true, fullName: true } }),
      prisma.engineerManager.findMany({
        include: { engineer: { select: { id: true, fullName: true } }, manager: { select: { id: true, fullName: true } } },
      }),
    ])

    const pairData = await Promise.all(
      pairs.map(async pair => {
        const [ticketCount, projectCount] = await Promise.all([
          prisma.ticket.count({ where: { assigneeId: pair.engineerId, projectManagerId: pair.managerId } }),
          prisma.project.count({ where: { managerId: pair.managerId } }),
        ])
        return { managerId: pair.managerId, engineerId: pair.engineerId, ticketCount, projectCount }
      })
    )

    return { managers, engineers, pairs: pairData }
  }

  private buildTicketWhere(filters: SegmentFilters): Prisma.TicketWhereInput {
    const where: Prisma.TicketWhereInput = {}

    if (filters.from || filters.to) {
      const field = filters.dateField === 'updated' ? 'updated' : 'created'
      where[field] = {}
      if (filters.from) (where[field] as any).gte = new Date(filters.from)
      if (filters.to) (where[field] as any).lte = new Date(filters.to)
    }

    if (filters.priority) where.priority = filters.priority
    if (filters.status) where.status = filters.status
    if (filters.customerId) where.customerId = filters.customerId
    if (filters.managerId) where.projectManagerId = filters.managerId
    if (filters.assigneeId) where.assigneeId = filters.assigneeId
    if (filters.entityId) {
      // entityId used as managerId by default in focus mode
      where.projectManagerId = filters.entityId
    }

    if (filters.breach === 'resolution') where.resolutionBreach = BreachFlag.YES
    else if (filters.breach === 'firstResponse') where.firstResponseBreach = BreachFlag.YES
    else if (filters.breach === 'any') {
      where.OR = [{ resolutionBreach: BreachFlag.YES }, { firstResponseBreach: BreachFlag.YES }]
    }

    return where
  }
}

export const analyticsService = new AnalyticsService()
