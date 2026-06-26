import { prisma } from '../lib/prisma'
import { BreachFlag, RootCauseRule } from '@prisma/client'
import { SLAThresholds } from '../lib/jiraConfig'

export class DerivedFieldService {
  private rules: RootCauseRule[] | null = null

  async loadRules() {
    this.rules = await prisma.rootCauseRule.findMany({ orderBy: { priority: 'asc' } })
  }

  classifyRootCause(summary: string | null | undefined): string {
    if (!this.rules) return 'Other'
    const text = (summary || '').toLowerCase()

    for (const rule of this.rules) {
      if (rule.keywords.length === 0) continue
      if (rule.keywords.some(kw => text.includes(kw.toLowerCase()))) {
        return rule.bucket
      }
    }
    return 'Other'
  }

  computeResolutionHours(created: Date | null | undefined, updated: Date | null | undefined): number | null {
    if (!created || !updated) return null
    const diff = updated.getTime() - created.getTime()
    if (diff < 0) return null
    return diff / 3600000
  }

  computeResolutionBreach(
    resolutionHours: number | null,
    priority: string | null | undefined,
    thresholds: SLAThresholds
  ): BreachFlag {
    if (resolutionHours === null) return BreachFlag.UNKNOWN
    const p = priority || 'Medium'
    const threshold = thresholds[p as keyof SLAThresholds] ?? thresholds.Medium
    return resolutionHours > threshold ? BreachFlag.YES : BreachFlag.NO
  }

  parseSLABreachFlag(raw: unknown): BreachFlag {
    if (raw === null || raw === undefined || raw === '') return BreachFlag.UNKNOWN
    const s = String(raw).toLowerCase().trim()
    if (s === 'yes' || s === 'true' || s === '1' || s === 'breached') return BreachFlag.YES
    if (s === 'no' || s === 'false' || s === '0' || s === 'within sla') return BreachFlag.NO
    return BreachFlag.UNKNOWN
  }
}

export const derivedFieldService = new DerivedFieldService()
