import { apiClient } from './client'
import { SegmentResult, ManagerOverview, AlignmentResult, Dimension, Metric } from '../types'

export interface SegmentParams {
  dimension: Dimension
  metric: Metric
  from?: string
  to?: string
  dateField?: 'created' | 'updated'
  priority?: string
  status?: string
  customerId?: string
  managerId?: string
  assigneeId?: string
  breach?: 'resolution' | 'firstResponse' | 'any'
  lifecycle?: 'ACTIVE' | 'COMPLETED'
  entityId?: string
  subDimension?: Dimension
}

export async function fetchSegment(params: SegmentParams): Promise<SegmentResult> {
  const res = await apiClient.get('/analytics/segment', { params })
  return res.data
}

export async function fetchManagerOverview(managerId: string): Promise<ManagerOverview> {
  const res = await apiClient.get(`/analytics/manager/${managerId}/overview`)
  return res.data
}

export async function fetchAlignment(): Promise<AlignmentResult> {
  const res = await apiClient.get('/analytics/alignment')
  return res.data
}

export function buildExportUrl(params: SegmentParams): string {
  const search = new URLSearchParams(params as any).toString()
  return `/api/export/segment.csv?${search}`
}
