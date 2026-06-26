import { prisma } from '../lib/prisma'
import { PersonRole } from '@prisma/client'

export class AliasService {
  async resolveCustomer(raw: string | null | undefined): Promise<string> {
    if (!raw || raw.trim() === '' || raw.trim() === '0') {
      return this.getPlaceholderCustomerId()
    }

    const normalized = raw.trim()
    const alias = await prisma.customerAlias.findUnique({ where: { raw: normalized } })
    if (alias) return alias.customerId

    // Try case-insensitive match
    const allAliases = await prisma.customerAlias.findMany()
    const match = allAliases.find(a => a.raw.toLowerCase() === normalized.toLowerCase())
    if (match) return match.customerId

    // Try canonical match
    const canonical = await prisma.customer.findFirst({
      where: { canonical: { equals: normalized, mode: 'insensitive' } },
    })
    if (canonical) {
      await prisma.customerAlias.create({ data: { raw: normalized, customerId: canonical.id } })
      return canonical.id
    }

    // Create new customer with this name as canonical
    const newCustomer = await prisma.customer.create({ data: { canonical: normalized } })
    await prisma.customerAlias.create({ data: { raw: normalized, customerId: newCustomer.id } })
    return newCustomer.id
  }

  private _placeholderCustomerId: string | null = null
  async getPlaceholderCustomerId(): Promise<string> {
    if (this._placeholderCustomerId) return this._placeholderCustomerId
    const p = await prisma.customer.findFirst({ where: { isPlaceholder: true } })
    if (p) {
      this._placeholderCustomerId = p.id
      return p.id
    }
    const created = await prisma.customer.create({ data: { canonical: 'Unassigned', isPlaceholder: true } })
    this._placeholderCustomerId = created.id
    return created.id
  }

  async resolvePerson(raw: string | null | undefined, defaultRole: PersonRole = PersonRole.ENGINEER): Promise<string | null> {
    if (!raw || raw.trim() === '' || raw.trim() === '0') return null

    const normalized = raw.trim()
    const alias = await prisma.personAlias.findUnique({ where: { raw: normalized } })
    if (alias) return alias.personId

    // Case-insensitive alias lookup
    const allAliases = await prisma.personAlias.findMany()
    const match = allAliases.find(a => a.raw.toLowerCase() === normalized.toLowerCase())
    if (match) return match.personId

    // Exact canonical match
    const person = await prisma.person.findFirst({
      where: { fullName: { equals: normalized, mode: 'insensitive' } },
    })
    if (person) {
      await prisma.personAlias.create({ data: { raw: normalized, personId: person.id } })
      return person.id
    }

    // Create new person
    const newPerson = await prisma.person.create({ data: { fullName: normalized, role: defaultRole } })
    await prisma.personAlias.create({ data: { raw: normalized, personId: newPerson.id } })
    return newPerson.id
  }

  async recanonicalizeAll() {
    // Re-run resolution for all tickets with raw names stored
    // This is a no-op here — resolution happens at ingest time
  }
}

export const aliasService = new AliasService()
