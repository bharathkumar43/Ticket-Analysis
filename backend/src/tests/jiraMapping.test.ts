import { DerivedFieldService } from '../services/derivedFieldService'
import { BreachFlag } from '@prisma/client'

describe('Jira field mapping helpers', () => {
  const svc = new DerivedFieldService()

  it('derives breach from SLA boolean true', () => {
    expect(svc.parseSLABreachFlag(true)).toBe(BreachFlag.YES)
    expect(svc.parseSLABreachFlag(false)).toBe(BreachFlag.NO)
  })

  it('handles numeric "1" and "0"', () => {
    expect(svc.parseSLABreachFlag('1')).toBe(BreachFlag.YES)
    expect(svc.parseSLABreachFlag('0')).toBe(BreachFlag.NO)
  })

  it('returns UNKNOWN for undefined', () => {
    expect(svc.parseSLABreachFlag(undefined)).toBe(BreachFlag.UNKNOWN)
  })
})
