import { PrismaClient, BreachFlag, DelayStatus } from '@prisma/client'

const prisma = new PrismaClient()

// ─── helpers ────────────────────────────────────────────────────────────────

function daysAgo(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function chance(pct: number) {
  return Math.random() < pct
}

// ─── reference data ─────────────────────────────────────────────────────────

const ISSUE_TYPES = ['Bug', 'Task', 'Story', 'Incident', 'Change Request']
const PRIORITIES = ['Highest', 'High', 'Medium', 'Low', 'Lowest']
const STATUSES = ['Open', 'In Progress', 'Resolved', 'Closed', 'Waiting for Customer', 'Done']
const RESOLUTIONS = [null, null, 'Fixed', 'Cannot Reproduce', 'Duplicate', 'Won\'t Fix', 'Done']
const ROOT_CAUSES = [
  'Infrastructure', 'Misconfigured Permissions', 'Data Corruption',
  'API/Integration Error', 'User Error', 'Performance', 'Dependency Issue', 'Other',
]
const COMPONENTS_OPTIONS = [
  'Email Migration', 'SharePoint', 'OneDrive', 'Teams', 'Calendar',
  'Contacts', 'Drive', 'Authentication', 'API Connector',
]

const SUMMARIES = [
  'Migration job fails for large mailboxes',
  'Permissions error during SharePoint sync',
  'Calendar items missing after migration',
  'Duplicate emails appearing in target mailbox',
  'OneDrive throttling causing migration slowdown',
  'Authentication token expiry not handled gracefully',
  'Failed to migrate shared drives',
  'Contacts not syncing to target tenant',
  'Teams messages missing timestamps',
  'Data validation error for special characters',
  'Migration stalled at 67% for customer',
  'API rate limit hit during bulk operation',
  'Source connector timeout on large folder',
  'Missing attachments after email migration',
  'Group membership not preserved post-migration',
  'DNS configuration blocking inbound mail',
  'SSL certificate error in migration tool',
  'Incorrect folder hierarchy in target',
  'Shared mailbox access denied after cutover',
  'Migration report shows wrong item count',
  'Firewall rule blocking connector',
  'VPN disconnection during active migration',
  'Incomplete migration for inactive user accounts',
  'Task migration failing for recurring items',
  'Licensing issue blocking user provisioning',
  'Delta sync not picking up recent changes',
  'Permission inheritance broken on subfolders',
  'Corrupted PST file during upload',
  'Memory overflow on migration agent',
  'User unable to access migrated mailbox',
  'Metadata not preserved for SharePoint files',
  'Data corruption in migrated documents',
  'API integration failing intermittently',
  'Wrong timezone applied to calendar events',
  'Dependency on legacy IMAP server blocking progress',
  'Throttling from source tenant impacting SLA',
  'Cutover window too short for data volume',
  'User education gap causing re-work requests',
  'External sharing settings not replicated',
  'Bandwidth constraint at customer site',
]

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  // Load existing customers and persons
  const customers = await prisma.customer.findMany({ where: { isPlaceholder: false } })
  const managers = await prisma.person.findMany({ where: { role: { in: ['MANAGER', 'BOTH'] } } })
  const engineers = await prisma.person.findMany({ where: { role: { in: ['ENGINEER', 'BOTH'] } } })

  if (customers.length === 0) throw new Error('No customers found — run the main seed first (npx prisma db seed)')
  if (managers.length === 0) throw new Error('No managers found — run the main seed first')

  console.log(`Found ${customers.length} customers, ${managers.length} managers, ${engineers.length} engineers`)

  // ── Create demo projects ──────────────────────────────────────────────────
  const projectDefs = [
    { name: 'EsteeLauder M365 Migration', customerId: customers.find(c => c.canonical === 'EsteeLauder')?.id, lifecycle: 'ACTIVE', delayStatus: DelayStatus.NOT_DELAYED },
    { name: 'CumulousGlobal Google→O365', customerId: customers.find(c => c.canonical === 'CumulousGlobal')?.id, lifecycle: 'ACTIVE', delayStatus: DelayStatus.DELAYED },
    { name: 'Chryselys SharePoint Cutover', customerId: customers.find(c => c.canonical === 'Chryselys')?.id, lifecycle: 'COMPLETED', delayStatus: DelayStatus.NOT_DELAYED },
    { name: 'Ezcater OneDrive Rollout', customerId: customers.find(c => c.canonical === 'Ezcater')?.id, lifecycle: 'ACTIVE', delayStatus: DelayStatus.AT_RISK },
    { name: 'PeakMining Teams Migration', customerId: customers.find(c => c.canonical === 'PeakMining')?.id, lifecycle: 'COMPLETED', delayStatus: DelayStatus.DELAYED },
    { name: 'DeelInc Email Tenant Switch', customerId: customers.find(c => c.canonical === 'DeelInc')?.id, lifecycle: 'ACTIVE', delayStatus: DelayStatus.NOT_DELAYED },
    { name: 'Epiq3 Exchange to O365', customerId: customers.find(c => c.canonical === 'Epiq3')?.id, lifecycle: 'ACTIVE', delayStatus: DelayStatus.AT_RISK },
    { name: 'EpiqGlobal Data Center Exit', customerId: customers.find(c => c.canonical === 'EpiqGlobal')?.id, lifecycle: 'COMPLETED', delayStatus: DelayStatus.NOT_DELAYED },
    { name: 'WashingtonPost Cloud Lift', customerId: customers.find(c => c.canonical === 'WashingtonPost')?.id, lifecycle: 'ACTIVE', delayStatus: DelayStatus.DELAYED },
  ]

  for (let i = 0; i < projectDefs.length; i++) {
    const def = projectDefs[i]
    if (!def.customerId) continue
    const manager = managers[i % managers.length]
    const sowStart = daysAgo(180 + i * 10)
    const sowEnd = daysAgo(-90 + i * 5)
    await prisma.project.upsert({
      where: { id: `demo-project-${i}` },
      update: {},
      create: {
        id: `demo-project-${i}`,
        name: def.name,
        customerId: def.customerId,
        managerId: manager.id,
        lifecycle: def.lifecycle,
        delayStatus: def.delayStatus,
        delayDays: def.delayStatus === DelayStatus.DELAYED ? Math.floor(Math.random() * 30) + 5 : null,
        status: def.lifecycle === 'COMPLETED' ? 'Completed' : 'In Progress',
        phase: pick(['Planning', 'Execution', 'Cutover', 'Hypercare']),
        migrationTypes: pick(['Email', 'SharePoint', 'OneDrive', 'Teams', 'Full Suite']),
        planType: pick(['Standard', 'Premium', 'Enterprise']),
        durationMonths: Math.floor(Math.random() * 6) + 3,
        sowStart,
        sowEnd,
        kickoffStart: new Date(sowStart.getTime() + 7 * 24 * 60 * 60 * 1000),
        projectEnd: def.lifecycle === 'COMPLETED' ? daysAgo(Math.floor(Math.random() * 60)) : undefined,
        isOveraged: chance(0.2),
        overageAmount: chance(0.2) ? Math.floor(Math.random() * 20000) + 5000 : null,
      },
    })
  }

  console.log(`Created ${projectDefs.length} demo projects`)

  // ── Create demo tickets ───────────────────────────────────────────────────
  const created = await prisma.ticket.count()
  if (created > 0) {
    console.log(`${created} tickets already exist — skipping ticket seed`)
    return
  }

  const tickets = []
  let idx = 0

  for (const customer of customers) {
    // 15–25 tickets per customer
    const count = Math.floor(Math.random() * 11) + 15
    const manager = managers[idx % managers.length]
    idx++

    for (let t = 0; t < count; t++) {
      const createdAt = daysAgo(Math.floor(Math.random() * 180))
      const isResolved = chance(0.55)
      const resolutionHours = isResolved ? Math.random() * 120 + 1 : null
      const updatedAt = isResolved
        ? new Date(createdAt.getTime() + (resolutionHours ?? 0) * 3600000)
        : daysAgo(Math.floor(Math.random() * 7))

      const priority = pick(PRIORITIES)
      const slaMap: Record<string, number> = { Highest: 8, High: 24, Medium: 72, Low: 120, Lowest: 168 }
      const slaHrs = slaMap[priority] ?? 72

      let resolutionBreach: BreachFlag = BreachFlag.UNKNOWN
      if (isResolved && resolutionHours !== null) {
        resolutionBreach = resolutionHours > slaHrs ? BreachFlag.YES : BreachFlag.NO
      }

      const firstResponseBreach: BreachFlag = chance(0.25) ? BreachFlag.YES : chance(0.6) ? BreachFlag.NO : BreachFlag.UNKNOWN
      const assignee = engineers.length > 0 ? (chance(0.8) ? pick(engineers) : null) : null

      tickets.push({
        jiraKey: `L1-${1000 + tickets.length}`,
        issueType: pick(ISSUE_TYPES),
        summary: pick(SUMMARIES),
        priority,
        status: isResolved ? pick(['Resolved', 'Closed', 'Done']) : pick(['Open', 'In Progress', 'Waiting for Customer']),
        resolution: isResolved ? pick(['Fixed', 'Done', 'Cannot Reproduce', 'Won\'t Fix']) : null,
        components: chance(0.6) ? pick(COMPONENTS_OPTIONS) : null,
        rootCause: pick(ROOT_CAUSES),
        created: createdAt,
        updated: updatedAt,
        resolutionBreach,
        firstResponseBreach,
        resolutionHours,
        customerId: customer.id,
        projectManagerId: manager.id,
        assigneeId: assignee?.id ?? null,
        reporter: pick(['client.admin', 'support.team', 'project.lead', 'user1', 'operations']),
      })
    }
  }

  // Insert in batches
  const BATCH = 50
  for (let i = 0; i < tickets.length; i += BATCH) {
    await prisma.ticket.createMany({ data: tickets.slice(i, i + BATCH), skipDuplicates: true })
  }

  console.log(`Created ${tickets.length} demo tickets`)
  console.log('Demo seed complete.')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
