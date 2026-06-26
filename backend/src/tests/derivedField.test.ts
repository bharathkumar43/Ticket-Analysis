import { DerivedFieldService } from '../services/derivedFieldService'
import { BreachFlag } from '@prisma/client'

const svc = new DerivedFieldService()

// Inject rules directly (no DB needed for unit test)
;(svc as any).rules = [
  { bucket: 'Infrastructure', keywords: ['firewall', 'vpn', 'network'], priority: 10 },
  { bucket: 'Misconfigured Permissions', keywords: ['permission', 'access denied'], priority: 20 },
  { bucket: 'Other', keywords: [], priority: 999 },
]

describe('DerivedFieldService', () => {
  describe('classifyRootCause', () => {
    it('matches keywords case-insensitively', () => {
      expect(svc.classifyRootCause('VPN connectivity failure')).toBe('Infrastructure')
      expect(svc.classifyRootCause('Access Denied when mounting drive')).toBe('Misconfigured Permissions')
    })

    it('falls back to Other', () => {
      expect(svc.classifyRootCause('Something unrelated')).toBe('Other')
      expect(svc.classifyRootCause(null)).toBe('Other')
    })
  })

  describe('computeResolutionHours', () => {
    it('calculates hours correctly', () => {
      const created = new Date('2024-01-01T00:00:00Z')
      const updated = new Date('2024-01-01T12:00:00Z')
      expect(svc.computeResolutionHours(created, updated)).toBe(12)
    })

    it('returns null for missing dates', () => {
      expect(svc.computeResolutionHours(null, null)).toBeNull()
    })
  })

  describe('computeResolutionBreach', () => {
    const thresholds = { Highest: 8, High: 24, Medium: 72, Low: 120, Lowest: 168 }

    it('marks as YES when over threshold', () => {
      expect(svc.computeResolutionBreach(100, 'High', thresholds)).toBe(BreachFlag.YES)
    })

    it('marks as NO when under threshold', () => {
      expect(svc.computeResolutionBreach(10, 'High', thresholds)).toBe(BreachFlag.NO)
    })

    it('returns UNKNOWN for null hours', () => {
      expect(svc.computeResolutionBreach(null, 'High', thresholds)).toBe(BreachFlag.UNKNOWN)
    })
  })

  describe('parseSLABreachFlag', () => {
    it('parses yes/no/unknown correctly', () => {
      expect(svc.parseSLABreachFlag('Yes')).toBe(BreachFlag.YES)
      expect(svc.parseSLABreachFlag('no')).toBe(BreachFlag.NO)
      expect(svc.parseSLABreachFlag('')).toBe(BreachFlag.UNKNOWN)
      expect(svc.parseSLABreachFlag(null)).toBe(BreachFlag.UNKNOWN)
      expect(svc.parseSLABreachFlag('Breached')).toBe(BreachFlag.YES)
      expect(svc.parseSLABreachFlag('Within SLA')).toBe(BreachFlag.NO)
    })
  })
})
