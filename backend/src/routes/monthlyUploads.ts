import { Router } from 'express'
import { prisma } from '../lib/prisma'

const router = Router()

function findField(row: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const val = row[k]
    if (val !== undefined && val !== null && String(val).trim() !== '') return String(val).trim()
  }
  return undefined
}

function findDate(row: Record<string, unknown>, ...keys: string[]): Date | undefined {
  const val = findField(row, ...keys)
  if (!val) return undefined
  const d = new Date(val)
  return isNaN(d.getTime()) ? undefined : d
}

function extractFields(row: Record<string, unknown>) {
  return {
    jiraKey:    findField(row, 'Issue key', 'Key', 'Issue Key', 'Ticket', 'Ticket ID', 'id', 'ID', 'JIRA Key'),
    summary:    findField(row, 'Summary', 'Title', 'Description', 'Issue summary', 'Issue Summary'),
    assignee:   findField(row, 'Assignee', 'Assigned To', 'Assignee Name', 'Developer', 'Engineer'),
    status:     findField(row, 'Status', 'Issue Status', 'Current Status', 'State'),
    priority:   findField(row, 'Priority', 'Issue Priority', 'Severity'),
    resolution: findField(row, 'Resolution', 'Resolution Name'),
    created:    findDate(row,  'Created', 'Created Date', 'Create Date', 'Date Created', 'Open Date'),
    updated:    findDate(row,  'Updated', 'Updated Date', 'Update Date', 'Date Updated', 'Last Updated'),
  }
}

// GET /api/monthly-uploads — list all (optionally filtered by type)
router.get('/', async (req, res) => {
  const { type } = req.query
  const where = type ? { uploadType: String(type) } : {}
  const uploads = await prisma.monthlyUpload.findMany({
    where,
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
    select: { id: true, month: true, year: true, uploadType: true, fileName: true, rowCount: true, uploadedBy: true, uploadedAt: true },
  })
  res.json({ uploads })
})

// GET /api/monthly-uploads/compare?ids=id1,id2 — compare analytics
// NOTE: must be declared before /:id routes
router.get('/compare', async (req, res) => {
  const ids = String(req.query.ids || '').split(',').filter(Boolean)
  if (!ids.length) return res.status(400).json({ error: { message: 'ids query param required' } })

  const uploads = await prisma.monthlyUpload.findMany({
    where: { id: { in: ids } },
    orderBy: [{ year: 'asc' }, { month: 'asc' }],
  })

  const result = await Promise.all(uploads.map(async (u) => {
    const rows = await prisma.monthlyRow.findMany({
      where: { uploadId: u.id },
      select: { status: true, priority: true, resolution: true, assignee: true },
    })
    const byStatus:   Record<string, number> = {}
    const byPriority: Record<string, number> = {}
    const byAssignee: Record<string, number> = {}
    for (const r of rows) {
      if (r.status)   byStatus[r.status]     = (byStatus[r.status]     || 0) + 1
      if (r.priority) byPriority[r.priority] = (byPriority[r.priority] || 0) + 1
      if (r.assignee) byAssignee[r.assignee] = (byAssignee[r.assignee] || 0) + 1
    }
    return {
      id: u.id, month: u.month, year: u.year, uploadType: u.uploadType,
      fileName: u.fileName, rowCount: u.rowCount,
      analytics: { byStatus, byPriority, byAssignee },
    }
  }))

  res.json({ months: result })
})

// GET /api/monthly-uploads/:id/rows — fetch rows for one upload
router.get('/:id/rows', async (req, res) => {
  const upload = await prisma.monthlyUpload.findUnique({ where: { id: req.params.id } })
  if (!upload) return res.status(404).json({ error: { message: 'Upload not found' } })
  const rows = await prisma.monthlyRow.findMany({
    where: { uploadId: upload.id },
    select: { data: true },
  })
  res.json({ upload, rows: rows.map((r) => r.data) })
})

// POST /api/monthly-uploads — save a month's data (replaces if same month/year/type)
router.post('/', async (req, res) => {
  const { month, year, uploadType, fileName, rows, uploadedBy } = req.body
  if (!month || !year || !uploadType || !Array.isArray(rows)) {
    return res.status(400).json({ error: { message: 'month, year, uploadType, rows required' } })
  }
  const m = Number(month), y = Number(year)
  if (m < 1 || m > 12) return res.status(400).json({ error: { message: 'month must be 1–12' } })

  // Replace if same slot already exists
  const existing = await prisma.monthlyUpload.findUnique({
    where: { month_year_uploadType: { month: m, year: y, uploadType } },
  })
  if (existing) {
    await prisma.monthlyRow.deleteMany({ where: { uploadId: existing.id } })
    await prisma.monthlyUpload.delete({ where: { id: existing.id } })
  }

  const upload = await prisma.monthlyUpload.create({
    data: {
      month: m, year: y, uploadType,
      fileName: fileName || 'upload.xlsx',
      rowCount: rows.length,
      uploadedBy: uploadedBy || null,
      rows: {
        create: (rows as Record<string, unknown>[]).map((row) => ({
          data: row as object,
          ...extractFields(row),
        })),
      },
    },
  })
  res.json({ upload: { id: upload.id, month: upload.month, year: upload.year, rowCount: upload.rowCount } })
})

// DELETE /api/monthly-uploads/:id
router.delete('/:id', async (req, res) => {
  await prisma.monthlyUpload.delete({ where: { id: req.params.id } })
  res.json({ ok: true })
})

export default router
