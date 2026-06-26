import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchSegment, buildExportUrl, SegmentParams } from '../api/analytics'
import { fetchPeople, fetchCustomers } from '../api'
import { SegmentChart } from '../components/charts/SegmentChart'
import { DataTable } from '../components/ui/DataTable'
import { FilterPanel } from '../components/ui/FilterPanel'
import { SegmentRow, Dimension, Metric } from '../types'

const dimensionOptions: { value: Dimension; label: string }[] = [
  { value: 'manager', label: 'Manager' },
  { value: 'engineer', label: 'Engineer' },
  { value: 'customer', label: 'Customer' },
  { value: 'status', label: 'Status' },
  { value: 'priority', label: 'Priority' },
  { value: 'slaStatus', label: 'SLA Status' },
  { value: 'rootCause', label: 'Root Cause' },
  { value: 'delayStatus', label: 'Delay Status' },
]

const metricOptions: { value: Metric; label: string }[] = [
  { value: 'ticketCount', label: 'Ticket Count' },
  { value: 'breachCount', label: 'Breach Count' },
  { value: 'breachRate', label: 'Breach Rate' },
  { value: 'avgResolutionHours', label: 'Avg Resolution Hours' },
  { value: 'projectCount', label: 'Project Count' },
  { value: 'avgDelayDays', label: 'Avg Delay Days' },
]

function Select<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value as T)}
      style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13, background: '#fff', minWidth: 160 }}
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

export function SegmentationExplorer() {
  const [dimension, setDimension] = useState<Dimension>('manager')
  const [metric, setMetric] = useState<Metric>('ticketCount')
  const [subDimension, setSubDimension] = useState<Dimension | ''>('')
  const [filters, setFilters] = useState<Record<string, string>>({})

  const { data: managers } = useQuery({ queryKey: ['managers'], queryFn: () => fetchPeople('MANAGER') })
  const { data: customers } = useQuery({ queryKey: ['customers'], queryFn: fetchCustomers })

  const params: SegmentParams = {
    dimension,
    metric,
    ...(subDimension ? { subDimension } : {}),
    ...(filters as any),
  }

  const { data: result, isLoading, error } = useQuery({
    queryKey: ['segment', params],
    queryFn: () => fetchSegment(params),
  })

  const exportUrl = buildExportUrl(params)

  const tableColumns = [
    { header: dimensionOptions.find(d => d.value === dimension)?.label || dimension, accessor: 'key' as keyof SegmentRow, sortable: true },
    { header: metricOptions.find(m => m.value === metric)?.label || metric, accessor: 'value' as keyof SegmentRow, align: 'right' as const, sortable: true },
    { header: 'Count', accessor: 'count' as keyof SegmentRow, align: 'right' as const, sortable: true },
    { header: 'Breaches', accessor: 'breaches' as keyof SegmentRow, align: 'right' as const, sortable: true },
  ]

  const tableData: SegmentRow[] = result
    ? [...result.rows, ...(result.unassigned.count > 0 ? [{ key: 'Unassigned', keyId: null, value: result.unassigned.value, count: result.unassigned.count, breaches: 0 }] : [])]
    : []

  return (
    <div style={{ padding: '32px 36px', maxWidth: 1400 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: '0 0 6px', fontSize: 24, fontWeight: 700, color: '#1e1b4b' }}>Segmentation Explorer</h1>
          <p style={{ margin: 0, color: '#6b7280', fontSize: 14 }}>Pick a dimension and metric to explore migration data</p>
        </div>
        {result && (
          <a
            href={exportUrl}
            download
            style={{
              background: '#4f46e5', color: '#fff', padding: '9px 18px', borderRadius: 8,
              textDecoration: 'none', fontSize: 13, fontWeight: 600,
            }}
          >
            ↓ Export CSV
          </a>
        )}
      </div>

      {/* Controls */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: 20, marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
          <label style={{ fontSize: 13, color: '#6b7280', display: 'flex', flexDirection: 'column', gap: 4 }}>
            Dimension
            <Select value={dimension} onChange={setDimension} options={dimensionOptions} />
          </label>
          <label style={{ fontSize: 13, color: '#6b7280', display: 'flex', flexDirection: 'column', gap: 4 }}>
            Metric
            <Select value={metric} onChange={setMetric} options={metricOptions} />
          </label>
          <label style={{ fontSize: 13, color: '#6b7280', display: 'flex', flexDirection: 'column', gap: 4 }}>
            Sub-dimension (stacked)
            <select
              value={subDimension}
              onChange={e => setSubDimension(e.target.value as Dimension | '')}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13, background: '#fff', minWidth: 160 }}
            >
              <option value="">None</option>
              {dimensionOptions.filter(d => d.value !== dimension).map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
        </div>
        <FilterPanel
          filters={filters as any}
          onChange={setFilters as any}
          managers={managers}
          customers={customers}
        />
      </div>

      {/* Chart */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: '20px 20px 12px', marginBottom: 20 }}>
        {isLoading && <div style={{ height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>Loading...</div>}
        {error && <div style={{ padding: 20, color: '#dc2626' }}>Error loading data</div>}
        {result && !isLoading && (
          <SegmentChart result={result} dimension={dimension} metric={metric} subDimension={subDimension as Dimension | undefined} height={340} />
        )}
      </div>

      {/* Reconciliation footer */}
      {result && (
        <div style={{
          background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10,
          padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#166534',
        }}>
          Assigned: {result.total.count - result.unassigned.count} + Unassigned: {result.unassigned.count} = Total: {result.total.count}
          {' · '}SLA Breaches: {result.total.breaches}
        </div>
      )}

      {/* Table */}
      {result && (
        <DataTable
          columns={tableColumns}
          data={tableData}
          rowKey={r => r.key + (r.keyId || '')}
        />
      )}
    </div>
  )
}
