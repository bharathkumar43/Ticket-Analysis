import { PrismaClient, PersonRole } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Placeholder customer for blank/"0" values
  const placeholder = await prisma.customer.upsert({
    where: { canonical: 'Unassigned' },
    update: {},
    create: { canonical: 'Unassigned', isPlaceholder: true },
  })
  for (const raw of ['0', '', 'unassigned', 'UNASSIGNED', 'N/A', 'n/a']) {
    await prisma.customerAlias.upsert({
      where: { raw },
      update: {},
      create: { raw, customerId: placeholder.id },
    })
  }

  // Customer canonical seeds from the workbook
  const customerSeeds: Array<{ canonical: string; aliases: string[] }> = [
    { canonical: 'EsteeLauder', aliases: ['estee', 'Estee', 'EsteeLauder', 'estee lauder', 'EsteeLauder Inc'] },
    { canonical: 'CumulousGlobal', aliases: ['cumulusglobal', 'cumulus', 'Cumulous Global', 'CumulousGlobal'] },
    { canonical: 'Chryselys', aliases: ['Chryselis', 'chryselys', 'Chryselys'] },
    { canonical: 'Ezcater', aliases: ['Ezcater', 'ezcater', 'EzCater'] },
    { canonical: 'PeakMining', aliases: ['Peak_Mining', 'peak_mining', 'Peak Mining', 'peakmining'] },
    { canonical: 'DeelInc', aliases: ['deel', 'Deel', 'DeelInc', 'Deel Inc'] },
    { canonical: 'Epiq3', aliases: ['epiq3', 'Epiq3'] },
    { canonical: 'EpiqGlobal', aliases: ['Epiq_Global', 'epiq_global', 'Epiq Global', 'EpiqGlobal'] },
    { canonical: 'WashingtonPost', aliases: ['WashingtonPost', 'Washington Post', 'washingtonpost'] },
  ]

  for (const { canonical, aliases } of customerSeeds) {
    const customer = await prisma.customer.upsert({
      where: { canonical },
      update: {},
      create: { canonical },
    })
    for (const raw of aliases) {
      await prisma.customerAlias.upsert({
        where: { raw },
        update: {},
        create: { raw, customerId: customer.id },
      })
    }
  }

  // Person seeds (managers)
  const managerSeeds: Array<{ fullName: string; aliases: string[] }> = [
    { fullName: 'Harika', aliases: ['Harika', 'harika'] },
    { fullName: 'Raghu Yellani', aliases: ['Raghu', 'raghu', 'Raghu Yellani'] },
    { fullName: 'Lakshmi Prasanna', aliases: ['Lakshmi Prasanna', 'Lakshmi prasanna', 'lakshmi prasanna', 'Lakshmiprasanna'] },
    { fullName: 'Sri Ram', aliases: ['Sri Ram', 'Sriram', 'sriram', 'Sriram Ramakrishnan'] },
  ]

  for (const { fullName, aliases } of managerSeeds) {
    const person = await prisma.person.upsert({
      where: { id: fullName.toLowerCase().replace(/\s+/g, '-') },
      update: { role: PersonRole.MANAGER },
      create: {
        id: fullName.toLowerCase().replace(/\s+/g, '-'),
        fullName,
        role: PersonRole.MANAGER,
      },
    })
    for (const raw of aliases) {
      await prisma.personAlias.upsert({
        where: { raw },
        update: {},
        create: { raw, personId: person.id },
      })
    }
  }

  // Engineer seeds
  const engineerSeeds: Array<{ fullName: string; aliases: string[] }> = [
    { fullName: 'Abhishek Sakala', aliases: ['Abhishek', 'abhishek', 'Abhishek Sakala'] },
    { fullName: 'Ravi Kumar', aliases: ['Ravi', 'ravi', 'Ravi Kumar'] },
    { fullName: 'Priya Sharma', aliases: ['Priya', 'priya', 'Priya Sharma'] },
  ]

  for (const { fullName, aliases } of engineerSeeds) {
    const person = await prisma.person.upsert({
      where: { id: fullName.toLowerCase().replace(/\s+/g, '-') },
      update: {},
      create: {
        id: fullName.toLowerCase().replace(/\s+/g, '-'),
        fullName,
        role: PersonRole.ENGINEER,
      },
    })
    for (const raw of aliases) {
      await prisma.personAlias.upsert({
        where: { raw },
        update: {},
        create: { raw, personId: person.id },
      })
    }
  }

  // Root cause rules
  const rootCauseSeeds: Array<{ bucket: string; keywords: string[]; priority: number }> = [
    { bucket: 'Infrastructure', keywords: ['infrastructure', 'network', 'firewall', 'vpn', 'server', 'connectivity', 'dns', 'ssl', 'certificate'], priority: 10 },
    { bucket: 'Misconfigured Permissions', keywords: ['permission', 'access denied', 'unauthorized', 'forbidden', 'acl', 'oauth', 'credentials', 'authentication'], priority: 20 },
    { bucket: 'Data Corruption', keywords: ['corrupt', 'corrupted', 'data loss', 'missing data', 'incomplete', 'truncated', 'malformed'], priority: 30 },
    { bucket: 'API/Integration Error', keywords: ['api', 'integration', 'webhook', 'sync', 'connector', 'rate limit', 'timeout', 'error 5', 'error 4'], priority: 40 },
    { bucket: 'User Error', keywords: ['user error', 'incorrect', 'wrong configuration', 'misconfiguration', 'invalid input'], priority: 50 },
    { bucket: 'Performance', keywords: ['slow', 'performance', 'throttle', 'timeout', 'latency', 'memory', 'cpu'], priority: 60 },
    { bucket: 'Dependency Issue', keywords: ['dependency', 'third party', 'external service', 'downstream', 'upstream'], priority: 70 },
    { bucket: 'Other', keywords: [], priority: 999 },
  ]

  for (const { bucket, keywords, priority } of rootCauseSeeds) {
    const existing = await prisma.rootCauseRule.findFirst({ where: { bucket } })
    if (!existing) {
      await prisma.rootCauseRule.create({ data: { bucket, keywords, priority } })
    }
  }

  console.log('Seed complete.')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
