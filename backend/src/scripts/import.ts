/**
 * Import script for existing workbook data.
 *
 * Usage:
 *   npx ts-node src/scripts/import.ts --tickets path/to/tickets.csv --projects-active path/to/active.csv --projects-completed path/to/completed.csv
 *
 * CSV column names must match the workbook exactly (case-insensitive matching applied).
 */

import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { parse } from 'csv-parse/sync'
import { prisma } from '../lib/prisma'
import { aliasService } from '../services/aliasService'
import { derivedFieldService } from '../services/derivedFieldService'
import { BreachFlag, DelayStatus, PersonRole } from '@prisma/client'
import { getJiraConfig } from '../lib/jiraConfig'

function parseArgs() {
  const args = process.argv.slice(2)
  const result: Record<string, string> = {}
  for (let i = 0; i < args.length; i += 2) {
    result[args[i].replace('--', '')] = args[i + 1]
  }
  return result
}

function normalizeKey(k: string): string {
  return k.trim().toLowerCase().replace(/[\s\-_()/]+/g, '_')
}

function normalizeRow(row: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(row)) {
    out[normalizeKey(k)] = (v || '').trim()
  }
  return out
}

function parseDate(raw: string | undefined): Date | null {
  if (!raw || raw.trim() === '') return null
  const d = new Date(raw.trim())
  return isNaN(d.getTime()) ? null : d
}

function parseFloat2(raw: string | undefined): number | null {
  if (!raw || raw.trim() === '') return null
  const n = parseFloat(raw.trim())
  return isNaN(n) ? null : n
}

function parseInt2(raw: string | undefined): number | null {
  if (!raw || raw.trim() === '') return null
  const n = parseInt(raw.trim(), 10)
  return isNaN(n) ? null : n
}

function mapDelayStatus(raw: string | undefined): DelayStatus {
  if (!raw) return DelayStatus.UNKNOWN
  const s = raw.trim().toUpperCase().replace(/[^A-Z_]/g, '_')
  if (s.includes('AT_RISK') || s.includes('AT RISK')) return DelayStatus.AT_RISK
  if (s.includes('DELAYED')) return DelayStatus.DELAYED
  if (s.includes('NOT_DELAYED') || s.includes('NOT DELAYED')) return DelayStatus.NOT_DELAYED
  return DelayStatus.UNKNOWN
}

async function importTickets(csvPath: string) {
  console.log(`Importing tickets from ${csvPath}...`)
  await derivedFieldService.loadRules()
  const config = getJiraConfig()

  const raw = fs.readFileSync(csvPath, 'utf-8')
  const records: Record<string, string>[] = parse(raw, { columns: true, skip_empty_lines: true })

  let count = 0
  for (const rawRow of records) {
    const r = normalizeRow(rawRow)

    const jiraKey = r['key'] || r['issue_key'] || r['jira_key']
    if (!jiraKey) { console.warn('Row missing key, skipping'); continue }

    const rawAssignee = r['assignee'] || r['engineer']
    const rawPM = r['project_manager'] || r['pm']
    const rawCustomer = r['customer__canonical_'] || r['customer_canonical'] || r['customer_name'] || r['customer']
    const rawFirstResp = r['first_response_sla_breach'] || r['first_response_sla']
    const rawResolution = r['resolution_sla_breach'] || r['resolution_sla']

    const [assigneeId, customerId, projectManagerId] = await Promise.all([
      aliasService.resolvePerson(rawAssignee, PersonRole.ENGINEER),
      aliasService.resolveCustomer(rawCustomer),
      aliasService.resolvePerson(rawPM, PersonRole.MANAGER),
    ])

    const created = parseDate(r['created'])
    const updated = parseDate(r['updated'])
    const resolutionHours = derivedFieldService.computeResolutionHours(created, updated)
    const rootCause = derivedFieldService.classifyRootCause(r['summary'])

    let firstResponseBreach = derivedFieldService.parseSLABreachFlag(rawFirstResp)
    let resolutionBreach = derivedFieldService.parseSLABreachFlag(rawResolution)

    if (resolutionBreach === BreachFlag.UNKNOWN && resolutionHours !== null) {
      resolutionBreach = derivedFieldService.computeResolutionBreach(
        resolutionHours,
        r['priority'],
        config.slaThresholds
      )
    }

    const data = {
      issueType: r['issue_type'] || r['issuetype'] || null,
      summary: r['summary'] || null,
      assigneeId,
      reporter: r['reporter'] || null,
      components: r['components'] || null,
      combination: r['combination'] || null,
      priority: r['priority'] || null,
      status: r['status'] || null,
      resolution: r['resolution'] || null,
      created,
      updated,
      dueDate: parseDate(r['due_date'] || r['duedate']),
      firstResponseBreach,
      resolutionBreach,
      customerId,
      projectManagerId,
      rootCause,
      resolutionHours,
    }

    await prisma.ticket.upsert({
      where: { jiraKey },
      update: data,
      create: { jiraKey, ...data },
    })
    count++
  }
  console.log(`Imported ${count} tickets.`)
}

async function importProjects(csvPath: string, lifecycle: 'ACTIVE' | 'COMPLETED') {
  console.log(`Importing ${lifecycle} projects from ${csvPath}...`)

  const raw = fs.readFileSync(csvPath, 'utf-8')
  const records: Record<string, string>[] = parse(raw, { columns: true, skip_empty_lines: true })

  let count = 0
  for (const rawRow of records) {
    const r = normalizeRow(rawRow)

    const name = r['project_name'] || r['name']
    if (!name) { console.warn('Row missing project name, skipping'); continue }

    const rawCustomer = r['customer_name'] || r['customer']
    const rawManager = r['project_manager'] || r['manager']
    const rawAccountManager = r['account_manager']

    const [customerId, managerId, accountManagerId] = await Promise.all([
      aliasService.resolveCustomer(rawCustomer),
      aliasService.resolvePerson(rawManager, PersonRole.MANAGER),
      aliasService.resolvePerson(rawAccountManager, PersonRole.MANAGER),
    ])

    const data = {
      name,
      customerId,
      managerId,
      accountManagerId,
      migrationTypes: r['migration_types'] || r['migration_type'] || null,
      planType: r['plan_type'] || null,
      status: r['status'] || null,
      phase: r['phase'] || null,
      durationMonths: parseFloat2(r['duration_months_'] || r['duration']),
      expectedEnd: parseDate(r['expected_project_end'] || r['expected_end']),
      extendedEnd: parseDate(r['extended_end_date_overage_'] || r['extended_end']),
      delayStatus: mapDelayStatus(r['delay_status']),
      delayDays: parseInt2(r['delay_days']),
      isOveraged: r['is_overaged']?.toLowerCase() === 'true' || r['is_overaged'] === '1',
      overageAmount: parseFloat2(r['overage_amount']),
      sowStart: parseDate(r['sow_start']),
      sowEnd: parseDate(r['sow_end']),
      kickoffStart: parseDate(r['kickoff_start']),
      projectEnd: parseDate(r['project_end']),
      lifecycle,
    }

    const existing = await prisma.project.findFirst({ where: { name, lifecycle } })
    if (existing) {
      await prisma.project.update({ where: { id: existing.id }, data })
    } else {
      await prisma.project.create({ data })
    }
    count++
  }
  console.log(`Imported ${count} ${lifecycle} projects.`)
}

async function main() {
  const args = parseArgs()

  if (args.tickets) await importTickets(path.resolve(args.tickets))
  if (args['projects-active']) await importProjects(path.resolve(args['projects-active']), 'ACTIVE')
  if (args['projects-completed']) await importProjects(path.resolve(args['projects-completed']), 'COMPLETED')

  if (!args.tickets && !args['projects-active'] && !args['projects-completed']) {
    console.log('Usage: npx ts-node src/scripts/import.ts [--tickets file.csv] [--projects-active file.csv] [--projects-completed file.csv]')
  }

  // Print reconciliation summary
  const [ticketCount, activeCount, completedCount, breachCount] = await Promise.all([
    prisma.ticket.count(),
    prisma.project.count({ where: { lifecycle: 'ACTIVE' } }),
    prisma.project.count({ where: { lifecycle: 'COMPLETED' } }),
    prisma.ticket.count({ where: { resolutionBreach: 'YES' } }),
  ])

  console.log('\n--- Reconciliation Summary ---')
  console.log(`Tickets total: ${ticketCount}`)
  console.log(`Active projects: ${activeCount}`)
  console.log(`Completed projects: ${completedCount}`)
  console.log(`Resolution breach YES: ${breachCount}`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
