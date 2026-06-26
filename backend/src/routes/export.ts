import { Router } from 'express'
import { analyticsService, Dimension, Metric, SegmentFilters } from '../services/analyticsService'

const router = Router()

router.get('/segment.csv', async (req, res) => {
  const { dimension, metric, ...rest } = req.query

  if (!dimension || !metric) {
    res.status(400).json({ error: { code: 'MISSING_PARAMS', message: 'dimension and metric required' } })
    return
  }

  const filters: SegmentFilters = {
    from: rest.from as string | undefined,
    to: rest.to as string | undefined,
    dateField: rest.dateField as 'created' | 'updated' | undefined,
    priority: rest.priority as string | undefined,
    status: rest.status as string | undefined,
    customerId: rest.customerId as string | undefined,
    managerId: rest.managerId as string | undefined,
    assigneeId: rest.assigneeId as string | undefined,
    breach: rest.breach as 'resolution' | 'firstResponse' | 'any' | undefined,
    lifecycle: rest.lifecycle as 'ACTIVE' | 'COMPLETED' | undefined,
    entityId: rest.entityId as string | undefined,
    subDimension: rest.subDimension as string | undefined,
  }

  const result = await analyticsService.segment(dimension as Dimension, metric as Metric, filters)

  const rows = result.rows
  if (rows.length === 0) {
    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', `attachment; filename="segment.csv"`)
    res.send('key,value,count,breaches\n')
    return
  }

  const hasSubDimension = rows[0].series !== undefined
  let csv: string

  if (hasSubDimension) {
    const seriesKeys = Array.from(new Set(rows.flatMap(r => Object.keys(r.series || {}))))
    csv = ['key', ...seriesKeys, 'total'].join(',') + '\n'
    for (const row of rows) {
      const vals = seriesKeys.map(k => row.series?.[k] ?? 0)
      csv += [row.key, ...vals, row.count].join(',') + '\n'
    }
  } else {
    csv = 'key,value,count,breaches\n'
    for (const row of rows) {
      csv += `"${row.key}",${row.value},${row.count},${row.breaches ?? 0}\n`
    }
    csv += `"Unassigned",${result.unassigned.value},${result.unassigned.count},0\n`
  }

  res.setHeader('Content-Type', 'text/csv')
  res.setHeader('Content-Disposition', `attachment; filename="${dimension}-${metric}.csv"`)
  res.send(csv)
})

export default router
