import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchAlignment } from '../api/analytics'
import { fetchSegment } from '../api/analytics'
import { SegmentChart } from '../components/charts/SegmentChart'

export function AlignmentView() {
  const { data: alignment, isLoading } = useQuery({
    queryKey: ['alignment'],
    queryFn: fetchAlignment,
  })

  const { data: engineerWorkload, isLoading: ewLoading } = useQuery({
    queryKey: ['segment-engineer-workload'],
    queryFn: () => fetchSegment({ dimension: 'engineer', metric: 'ticketCount' }),
  })

  const { data: managerSLA, isLoading: mslLoading } = useQuery({
    queryKey: ['segment-manager-sla-stacked'],
    queryFn: () => fetchSegment({ dimension: 'manager', metric: 'ticketCount', subDimension: 'slaStatus' }),
  })

  if (isLoading) return <div style={{ padding: 40, color: '#9ca3af' }}>Loading alignment data...</div>

  const pairMap = new Map<string, Map<string, number>>()
  for (const pair of alignment?.pairs || []) {
    if (!pairMap.has(pair.managerId)) pairMap.set(pair.managerId, new Map())
    pairMap.get(pair.managerId)!.set(pair.engineerId, pair.ticketCount)
  }

  return (
    <div style={{ padding: '32px 36px', maxWidth: 1400 }}>
      <h1 style={{ margin: '0 0 6px', fontSize: 24, fontWeight: 700, color: '#1e1b4b' }}>Engineer–Manager Alignment</h1>
      <p style={{ margin: '0 0 28px', color: '#6b7280', fontSize: 14 }}>
        Workload distribution and reporting structure
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
        {/* Engineer workload */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: '20px 20px 12px' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 16 }}>Engineer Workload (tickets)</div>
          {ewLoading ? (
            <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>Loading...</div>
          ) : engineerWorkload ? (
            <SegmentChart result={engineerWorkload} dimension="engineer" metric="ticketCount" height={260} />
          ) : null}
        </div>

        {/* Manager × SLA stacked */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: '20px 20px 12px' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 16 }}>Manager × SLA Outcome</div>
          {mslLoading ? (
            <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>Loading...</div>
          ) : managerSLA ? (
            <SegmentChart result={managerSLA} dimension="manager" metric="ticketCount" subDimension="slaStatus" height={260} />
          ) : null}
        </div>
      </div>

      {/* Heatmap table */}
      {alignment && alignment.managers.length > 0 && alignment.engineers.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: '20px', overflowX: 'auto' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 16 }}>
            Engineer × Manager Matrix (ticket count)
          </div>
          <table style={{ borderCollapse: 'collapse', fontSize: 13, minWidth: 600 }}>
            <thead>
              <tr>
                <th style={{ padding: '8px 14px', textAlign: 'left', color: '#6b7280', fontWeight: 600, borderBottom: '2px solid #e5e7eb' }}>Engineer</th>
                {alignment.managers.map(m => (
                  <th key={m.id} style={{ padding: '8px 14px', textAlign: 'center', color: '#6b7280', fontWeight: 600, borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap' }}>
                    {m.fullName}
                  </th>
                ))}
                <th style={{ padding: '8px 14px', textAlign: 'right', color: '#6b7280', fontWeight: 600, borderBottom: '2px solid #e5e7eb' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {alignment.engineers.map((eng, ri) => {
                const rowTotal = alignment.managers.reduce((s, mgr) => s + (pairMap.get(mgr.id)?.get(eng.id) || 0), 0)
                return (
                  <tr key={eng.id} style={{ background: ri % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '8px 14px', fontWeight: 500, color: '#374151', borderBottom: '1px solid #f3f4f6' }}>
                      {eng.fullName}
                    </td>
                    {alignment.managers.map(mgr => {
                      const count = pairMap.get(mgr.id)?.get(eng.id) || 0
                      const max = Math.max(...alignment.managers.map(m => pairMap.get(m.id)?.get(eng.id) || 0), 1)
                      const intensity = count / max
                      return (
                        <td key={mgr.id} style={{
                          padding: '8px 14px', textAlign: 'center', borderBottom: '1px solid #f3f4f6',
                          background: count > 0 ? `rgba(79, 70, 229, ${0.1 + intensity * 0.7})` : 'transparent',
                          color: intensity > 0.6 ? '#fff' : '#374151',
                          fontWeight: count > 0 ? 600 : 400,
                        }}>
                          {count > 0 ? count : '—'}
                        </td>
                      )
                    })}
                    <td style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 600, color: '#374151', borderBottom: '1px solid #f3f4f6' }}>
                      {rowTotal > 0 ? rowTotal : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {alignment && alignment.pairs.length === 0 && (
        <div style={{
          background: '#fafafa', borderRadius: 12, border: '1px solid #e5e7eb',
          padding: 32, textAlign: 'center', color: '#9ca3af',
        }}>
          No engineer–manager pairs configured yet. Add pairs via the Aliases admin or import data.
        </div>
      )}
    </div>
  )
}
