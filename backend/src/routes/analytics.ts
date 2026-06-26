import { Router } from 'express'
import { analyticsService, Dimension, Metric, SegmentFilters } from '../services/analyticsService'

const router = Router()

router.get('/segment', async (req, res) => {
  const {
    dimension, metric,
    from, to, dateField, priority, status, customerId, managerId,
    assigneeId, breach, lifecycle, entityId, subDimension,
  } = req.query

  if (!dimension || !metric) {
    res.status(400).json({ error: { code: 'MISSING_PARAMS', message: 'dimension and metric are required' } })
    return
  }

  const filters: SegmentFilters = {
    from: from as string | undefined,
    to: to as string | undefined,
    dateField: dateField as 'created' | 'updated' | undefined,
    priority: priority as string | undefined,
    status: status as string | undefined,
    customerId: customerId as string | undefined,
    managerId: managerId as string | undefined,
    assigneeId: assigneeId as string | undefined,
    breach: breach as 'resolution' | 'firstResponse' | 'any' | undefined,
    lifecycle: lifecycle as 'ACTIVE' | 'COMPLETED' | undefined,
    entityId: entityId as string | undefined,
    subDimension: subDimension as string | undefined,
  }

  const result = await analyticsService.segment(dimension as Dimension, metric as Metric, filters)
  res.json(result)
})

router.get('/manager/:id/overview', async (req, res) => {
  const result = await analyticsService.managerOverview(req.params.id)
  if (!result) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Manager not found' } })
    return
  }
  res.json(result)
})

router.get('/alignment', async (req, res) => {
  const result = await analyticsService.alignment()
  res.json(result)
})

export default router
