import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchPeople } from '../api'
import { fetchManagerOverview, fetchSegment, buildExportUrl } from '../api/analytics'
import { SegmentChart } from '../components/charts/SegmentChart'
import { KPITile } from '../components/ui/KPITile'
import { DataTable } from '../components/ui/DataTable'

export function ManagerView() {
  const { data: managers, isLoading: managersLoading } = useQuery({
    queryKey: ['managers'],
    queryFn: () => fetchPeople('MANAGER'),
  })

  const [selectedId, setSelectedId] = useState<string>('')
  const managerId = selectedId || managers?.[0]?.id || ''

  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ['manager-overview', managerId],
    queryFn: () => fetchManagerOverview(managerId),
    enabled: !!managerId,
  })

  const { data: activeStatus, isLoading: activeLoading } = useQuery({
    queryKey: ['manager-active-status', managerId],
    queryFn: () => fetchSegment({ dimension: 'delayStatus', metric: 'projectCount', managerId, lifecycle: 'ACTIVE' }),
    enabled: !!managerId,
  })

  const { data: completedStatus, isLoading: completedLoading } = useQuery({
    queryKey: ['manager-completed-status', managerId],
    queryFn: () => fetchSegment({ dimension: 'delayStatus', metric: 'projectCount', managerId, lifecycle: 'COMPLETED' }),
    enabled: !!managerId,
  })

  const { data: ticketsByCustomer, isLoading: custLoading } = useQuery({
    queryKey: ['manager-tickets-by-customer', managerId],
    queryFn: () => fetchSegment({ dimension: 'customer', metric: 'ticketCount', managerId }),
    enabled: !!managerId,
  })

  if (managersLoading) return <LoadingPage />

  return (
    <div style={{ padding: '32px 36px', maxWidth: 1400 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 700, color: '#1e1b4b' }}>Manager View</h1>
          <p style={{ margin: 0, color: '#6b7280', fontSize: 14 }}>Portfolio overview per delivery manager</p>
        </div>
        <select
          value={selectedId || managerId}
          onChange={e => setSelectedId(e.target.value)}
          style={{
            padding: '9px 14px', borderRadius: 9, border: '1px solid #d1d5db',
            fontSize: 14, background: '#fff', fontWeight: 500, minWidth: 220,
          }}
        >
          {managers?.map(m => (
            <option key={m.id} value={m.id}>{m.fullName}</option>
          ))}
        </select>
      </div>

      {/* KPI tiles */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 28 }}>
        <KPITile
          label="Total Tickets"
          value={overview?.ticketTotals.total ?? '—'}
          loading={overviewLoading}
          color="#4f46e5"
        />
        <KPITile
          label="SLA Breaches"
          value={overview?.ticketTotals.breaches ?? '—'}
          loading={overviewLoading}
          color="#ef4444"
        />
        <KPITile
          label="Breach Rate"
          value={
            overview
              ? `${((overview.ticketTotals.breaches / (overview.ticketTotals.total || 1)) * 100).toFixed(1)}%`
              : '—'
          }
          loading={overviewLoading}
          color="#f59e0b"
        />
        <KPITile
          label="Active Projects"
          value={overview ? overview.activeProjects.onTime + overview.activeProjects.delayed + overview.activeProjects.atRisk : '—'}
          loading={overviewLoading}
          color="#10b981"
        />
        <KPITile
          label="Completed Projects"
          value={overview ? overview.completedProjects.onTime + overview.completedProjects.delayed + overview.completedProjects.atRisk : '—'}
          loading={overviewLoading}
          color="#06b6d4"
        />
      </div>

      {/* Charts row 1: Active status | Completed status */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        <ChartCard title="Active Projects — by Delay Status" loading={activeLoading}>
          {activeStatus && (
            <SegmentChart result={activeStatus} dimension="delayStatus" metric="projectCount" height={240} />
          )}
        </ChartCard>
        <ChartCard title="Completed Projects — by Delay Status" loading={completedLoading}>
          {completedStatus && (
            <SegmentChart result={completedStatus} dimension="delayStatus" metric="projectCount" height={240} />
          )}
        </ChartCard>
      </div>

      {/* Chart row 2: Tickets by Customer */}
      <ChartCard title="Tickets by Customer (top 15)" loading={custLoading}>
        {ticketsByCustomer && (
          <>
            <SegmentChart result={ticketsByCustomer} dimension="customer" metric="ticketCount" height={360} topN={15} />
            <div style={{ marginTop: 8, textAlign: 'right' }}>
              <a
                href={buildExportUrl({ dimension: 'customer', metric: 'ticketCount', managerId })}
                download
                style={{ fontSize: 13, color: '#4f46e5', textDecoration: 'none' }}
              >
                ↓ Export CSV
              </a>
            </div>
          </>
        )}
      </ChartCard>

      {/* Tickets by customer table */}
      {overview && (
        <div style={{ marginTop: 20 }}>
          <DataTable
            columns={[
              { header: 'Customer', accessor: 'customer', sortable: true },
              { header: 'Tickets', accessor: 'tickets', align: 'right', sortable: true },
            ]}
            data={overview.ticketsByCustomer}
            rowKey={r => r.customer}
          />
        </div>
      )}
    </div>
  )
}

function ChartCard({ title, children, loading }: { title: string; children?: React.ReactNode; loading?: boolean }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: '20px 20px 12px' }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 16 }}>{title}</div>
      {loading ? (
        <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 13 }}>Loading...</div>
      ) : children}
    </div>
  )
}

function LoadingPage() {
  return (
    <div style={{ padding: '32px 36px' }}>
      <div style={{ height: 36, width: 200, background: '#f3f4f6', borderRadius: 8, marginBottom: 24 }} />
      <div style={{ display: 'flex', gap: 16 }}>
        {[1, 2, 3, 4].map(i => (
          <div key={i} style={{ flex: 1, height: 88, background: '#f3f4f6', borderRadius: 12 }} />
        ))}
      </div>
    </div>
  )
}
