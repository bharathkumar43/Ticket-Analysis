import { prisma } from '../lib/prisma'

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

const DONE_STATUSES = new Set(['done', 'resolved', 'closed', 'fixed', 'completed'])

function isResolved(status: string | null, resolution: string | null): boolean {
  return DONE_STATUSES.has((status || '').toLowerCase()) || DONE_STATUSES.has((resolution || '').toLowerCase())
}

export const dailySnapshotService = {
  /**
   * Snapshot every ticket currently in the (already-synced) Ticket table for `date`,
   * tagging each with its customer's ENT/SMB segment, assignee, PM, and the exact
   * breach timestamp (resolvedAt if closed, createdAt if still open and breaching).
   * Idempotent — safe to re-run for the same day (upserts on [date, ticketKey]).
   */
  async captureSnapshot(forDate: Date = new Date()) {
    const date = startOfUtcDay(forDate)

    const tickets = await prisma.ticket.findMany({
      include: { assignee: true, projectManager: true, customer: true },
    })

    let written = 0
    for (const t of tickets) {
      const slaBreached = t.resolutionBreach === 'YES'
      const resolved = isResolved(t.status, t.resolution)
      const breachedAt = resolved ? (t.updated ?? t.created) : t.created

      await prisma.dailyTicketSnapshot.upsert({
        where: { date_ticketKey: { date, ticketKey: t.jiraKey } },
        update: {
          segment:        t.customer?.segment ?? 'UNKNOWN',
          assignee:       t.assignee?.fullName ?? null,
          projectManager: t.projectManager?.fullName ?? null,
          customer:       t.customer?.canonical ?? null,
          priority:       t.priority,
          status:         t.status,
          slaBreached,
          breachedAt:     slaBreached ? breachedAt : null,
          createdAt:      t.created,
          resolvedAt:     resolved ? t.updated : null,
        },
        create: {
          date,
          ticketKey:      t.jiraKey,
          segment:        t.customer?.segment ?? 'UNKNOWN',
          assignee:       t.assignee?.fullName ?? null,
          projectManager: t.projectManager?.fullName ?? null,
          customer:       t.customer?.canonical ?? null,
          priority:       t.priority,
          status:         t.status,
          slaBreached,
          breachedAt:     slaBreached ? breachedAt : null,
          createdAt:      t.created,
          resolvedAt:     resolved ? t.updated : null,
        },
      })
      written++
    }

    return { date, ticketsSeen: tickets.length, written }
  },

  /** Rows for one day, optionally filtered to a segment. */
  async getDay(date: Date, segment?: string) {
    return prisma.dailyTicketSnapshot.findMany({
      where: { date: startOfUtcDay(date), ...(segment ? { segment } : {}) },
      orderBy: [{ slaBreached: 'desc' }, { breachedAt: 'desc' }],
    })
  },

  /** Daily breach totals per segment across a date range — for trend charts. */
  async getSummary(from: Date, to: Date, segment?: string) {
    const rows = await prisma.dailyTicketSnapshot.findMany({
      where: {
        date: { gte: startOfUtcDay(from), lte: startOfUtcDay(to) },
        ...(segment ? { segment } : {}),
      },
      select: { date: true, segment: true, slaBreached: true },
    })

    const byKey: Record<string, { date: string; segment: string; total: number; breached: number }> = {}
    for (const r of rows) {
      const key = `${r.date.toISOString().slice(0, 10)}|${r.segment}`
      if (!byKey[key]) byKey[key] = { date: r.date.toISOString().slice(0, 10), segment: r.segment, total: 0, breached: 0 }
      byKey[key].total++
      if (r.slaBreached) byKey[key].breached++
    }

    return Object.values(byKey).sort((a, b) => a.date.localeCompare(b.date))
  },
}
