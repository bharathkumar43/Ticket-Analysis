import { Router } from 'express'
import { dailySnapshotService } from '../services/dailySnapshotService'

const router = Router()

// Manually trigger a snapshot capture (the cron also runs this daily)
router.post('/capture', async (req, res) => {
  try {
    const result = await dailySnapshotService.captureSnapshot()
    res.json(result)
  } catch (err: any) {
    res.status(500).json({ error: { code: 'CAPTURE_FAILED', message: err?.message || 'Snapshot capture failed' } })
  }
})

// Ticket-level detail for one day, optionally filtered by segment (ENT | SMB)
router.get('/', async (req, res) => {
  const { date, segment } = req.query as { date?: string; segment?: string }
  const d = date ? new Date(date) : new Date()
  if (isNaN(d.getTime())) {
    res.status(400).json({ error: { code: 'INVALID_DATE', message: 'date must be YYYY-MM-DD' } })
    return
  }
  const rows = await dailySnapshotService.getDay(d, segment)
  res.json({ date: d.toISOString().slice(0, 10), segment: segment || 'ALL', rows })
})

// Daily breach totals per segment over a range — for trend charts
router.get('/summary', async (req, res) => {
  const { from, to, segment } = req.query as { from?: string; to?: string; segment?: string }
  const toDate = to ? new Date(to) : new Date()
  const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 13 * 86400000)
  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
    res.status(400).json({ error: { code: 'INVALID_DATE', message: 'from/to must be YYYY-MM-DD' } })
    return
  }
  const summary = await dailySnapshotService.getSummary(fromDate, toDate, segment)
  res.json({ summary })
})

export default router
