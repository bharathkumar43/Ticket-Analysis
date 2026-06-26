import React, { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import { fetchSegment } from '../api/analytics'
import { fetchTickets } from '../api'
import { SegmentRow, Ticket } from '../types'

// ── palette & helpers ─────────────────────────────────────────────────────────

const COLORS = [
  '#38bdf8','#22c55e','#f59e0b','#a78bfa','#ef4444',
  '#14b8a6','#eab308','#f472b6','#60a5fa','#fb923c',
  '#34d399','#c084fc','#fbbf24','#f87171','#4ade80',
]
const PRIORITY_ORDER = ['Highest','High','Medium','Low','Lowest']
const axis = { fill: '#94a3b8', fontSize: 12 }
const tip = {
  contentStyle: { background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#e2e8f0' },
  labelStyle: { color: '#e2e8f0' },
  cursor: { fill: 'rgba(255,255,255,.04)' },
}

function num(n: number, d = 0) {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}
function pct(n: number, total: number) {
  return total ? ((n / total) * 100).toFixed(1) + '%' : '0.0%'
}
function fmtDate(iso?: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

// Convert segment rows to recharts data, sorted desc
function toChart(rows: SegmentRow[], topN?: number) {
  let arr = [...rows].sort((a, b) => b.value - a.value)
  if (topN) arr = arr.slice(0, topN)
  return arr.map(r => ({ name: r.key, value: r.value }))
}
// Sort by a known order
function toChartOrdered(rows: SegmentRow[], order: string[]) {
  return order.map(k => {
    const r = rows.find(x => x.key === k)
    return { name: k, value: r?.value ?? 0 }
  })
}

// ── chart components ──────────────────────────────────────────────────────────

function VBar({ data, color = '#38bdf8', height = 280 }: { data: { name: string; value: number }[]; color?: string; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ left: 0, right: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
        <XAxis dataKey="name" tick={axis} stroke="#334155" interval={0}
          angle={data.length > 5 ? -20 : 0} textAnchor={data.length > 5 ? 'end' : 'middle'}
          height={data.length > 5 ? 56 : 30} />
        <YAxis tick={axis} stroke="#334155" />
        <Tooltip {...tip} />
        <Bar dataKey="value" radius={[4,4,0,0]}>
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

function HBar({ data, height = 320 }: { data: { name: string; value: number }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ left: 16, right: 16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
        <XAxis type="number" tick={axis} stroke="#334155" />
        <YAxis type="category" dataKey="name" tick={axis} stroke="#334155" width={160} />
        <Tooltip {...tip} />
        <Bar dataKey="value" radius={[0,4,4,0]}>
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

function Donut({ data, height = 280 }: { data: { name: string; value: number }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%"
          outerRadius={95} innerRadius={50} paddingAngle={2}>
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Tooltip {...tip} />
        <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
      </PieChart>
    </ResponsiveContainer>
  )
}

// ── KPI tile ─────────────────────────────────────────────────────────────────

function Kpi({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  )
}

// ── loading skeleton ──────────────────────────────────────────────────────────

function ChartSkeleton({ height = 280 }: { height?: number }) {
  return (
    <div style={{ height, background: '#273449', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontSize: 13 }}>
      Loading…
    </div>
  )
}

// ── TABS ──────────────────────────────────────────────────────────────────────

const TABS = ['Overview','Priority','Issue Type','Migration Paths','Assignees','SLA','Root Cause','Raw Data']

// ── Overview tab ──────────────────────────────────────────────────────────────

function OverviewTab() {
  const { data: byStatus, isLoading: l1 }   = useQuery({ queryKey: ['seg','status','tc'],   queryFn: () => fetchSegment({ dimension: 'status',   metric: 'ticketCount' }) })
  const { data: byPriority, isLoading: l2 } = useQuery({ queryKey: ['seg','priority','tc'], queryFn: () => fetchSegment({ dimension: 'priority', metric: 'ticketCount' }) })
  const { data: byRC, isLoading: l3 }       = useQuery({ queryKey: ['seg','rc','bc'],       queryFn: () => fetchSegment({ dimension: 'rootCause', metric: 'breachCount' }) })

  const total    = byStatus?.total.count ?? 0
  const breaches = byStatus?.total.breaches ?? 0
  const resolved = byStatus?.rows.find(r => r.key.toLowerCase().includes('resolv'))?.count ?? 0
  const open     = total - resolved

  const statusData   = byStatus   ? toChart(byStatus.rows)   : []
  const priorityData = byPriority ? toChartOrdered(byPriority.rows, PRIORITY_ORDER) : []
  const rcData       = byRC       ? toChart(byRC.rows, 8)    : []

  return (
    <>
      <div className="kpis">
        <Kpi label="Total Tickets"  value={num(total)}    sub="All records" />
        <Kpi label="Resolved"       value={num(resolved)} sub={pct(resolved, total) + ' resolution rate'} />
        <Kpi label="Open / Pending" value={num(open)}     sub="Not yet resolved" />
        <Kpi label="SLA Breached"   value={num(breaches)} sub={pct(breaches, total) + ' of total'} />
      </div>
      <div className="grid2">
        <div className="card"><h3>Status Breakdown</h3>{l1 ? <ChartSkeleton /> : <Donut data={statusData} />}</div>
        <div className="card"><h3>Priority Breakdown</h3>{l2 ? <ChartSkeleton /> : <Donut data={priorityData} />}</div>
        <div className="card full"><h3>SLA Breaches by Root Cause</h3>{l3 ? <ChartSkeleton /> : <HBar data={rcData} height={Math.max(240, rcData.length * 36)} />}</div>
      </div>
    </>
  )
}

// ── Priority tab ──────────────────────────────────────────────────────────────

function PriorityTab() {
  const { data: byCount,   isLoading: l1 } = useQuery({ queryKey: ['seg','priority','tc'],  queryFn: () => fetchSegment({ dimension: 'priority', metric: 'ticketCount' }) })
  const { data: byBreach,  isLoading: l2 } = useQuery({ queryKey: ['seg','priority','bc'],  queryFn: () => fetchSegment({ dimension: 'priority', metric: 'breachCount' }) })
  const { data: byAvgHrs,  isLoading: l3 } = useQuery({ queryKey: ['seg','priority','arh'], queryFn: () => fetchSegment({ dimension: 'priority', metric: 'avgResolutionHours' }) })

  const countData  = byCount  ? toChartOrdered(byCount.rows,  PRIORITY_ORDER) : []
  const breachData = byBreach ? toChartOrdered(byBreach.rows, PRIORITY_ORDER) : []
  const avgData    = byAvgHrs ? toChartOrdered(byAvgHrs.rows, PRIORITY_ORDER).map(d => ({ ...d, value: +(d.value / 24).toFixed(1) })) : []

  return (
    <div className="grid2">
      <div className="card"><h3>Tickets by Priority</h3>{l1 ? <ChartSkeleton /> : <VBar data={countData} />}</div>
      <div className="card"><h3>Priority Distribution</h3>{l1 ? <ChartSkeleton /> : <Donut data={countData} />}</div>
      <div className="card"><h3>SLA Breaches by Priority</h3>{l2 ? <ChartSkeleton /> : <VBar data={breachData} color="#ef4444" />}</div>
      <div className="card"><h3>Avg Resolution (days) by Priority</h3>{l3 ? <ChartSkeleton /> : <VBar data={avgData} color="#f59e0b" />}</div>
    </div>
  )
}

// ── Issue Type tab ────────────────────────────────────────────────────────────

function IssueTypeTab() {
  const { data: byCount,  isLoading: l1 } = useQuery({ queryKey: ['seg','issueType','tc'], queryFn: () => fetchSegment({ dimension: 'issueType', metric: 'ticketCount' }) })
  const { data: byBreach, isLoading: l2 } = useQuery({ queryKey: ['seg','issueType','bc'], queryFn: () => fetchSegment({ dimension: 'issueType', metric: 'breachCount' }) })

  const countData  = byCount  ? toChart(byCount.rows)  : []
  const breachData = byBreach ? toChart(byBreach.rows) : []

  return (
    <div className="grid2">
      <div className="card"><h3>Tickets by Issue Type</h3>{l1 ? <ChartSkeleton /> : <VBar data={countData} color="#22c55e" />}</div>
      <div className="card"><h3>Issue Type Distribution</h3>{l1 ? <ChartSkeleton /> : <Donut data={countData} />}</div>
      <div className="card full"><h3>SLA Breaches by Issue Type</h3>{l2 ? <ChartSkeleton /> : <HBar data={breachData} height={Math.max(200, breachData.length * 36)} />}</div>
    </div>
  )
}

// ── Migration Paths tab ───────────────────────────────────────────────────────

function MigrationPathsTab() {
  const { data, isLoading } = useQuery({ queryKey: ['seg','combination','tc'], queryFn: () => fetchSegment({ dimension: 'combination', metric: 'ticketCount' }) })

  const chartData = data ? toChart(data.rows, 15) : []
  const withPath  = data?.total.count ?? 0

  return (
    <div className="grid2">
      <div className="card full">
        <h3>Top Migration Paths{withPath > 0 ? ` · ${num(withPath)} tickets` : ''}</h3>
        {isLoading ? <ChartSkeleton height={460} /> : (
          chartData.length === 0
            ? <div className="loading-state">No migration path data — make sure the combination field is mapped in backend/.env</div>
            : <HBar data={chartData} height={Math.max(280, chartData.length * 36)} />
        )}
      </div>
    </div>
  )
}

// ── Assignees tab ─────────────────────────────────────────────────────────────

function AssigneesTab() {
  const { data: byVol,    isLoading: l1 } = useQuery({ queryKey: ['seg','eng','tc'],  queryFn: () => fetchSegment({ dimension: 'engineer', metric: 'ticketCount' }) })
  const { data: byBreach, isLoading: l2 } = useQuery({ queryKey: ['seg','eng','bc'],  queryFn: () => fetchSegment({ dimension: 'engineer', metric: 'breachCount' }) })
  const { data: byAvg,    isLoading: l3 } = useQuery({ queryKey: ['seg','eng','arh'], queryFn: () => fetchSegment({ dimension: 'engineer', metric: 'avgResolutionHours' }) })

  const volData    = byVol    ? toChart(byVol.rows, 12)    : []
  const breachData = byBreach ? toChart(byBreach.rows, 12) : []
  const avgData    = byAvg    ? toChart(byAvg.rows, 12).map(d => ({ ...d, value: +(d.value / 24).toFixed(1) })) : []

  // Build perf table
  const tableRows = useMemo(() => {
    if (!byVol) return []
    return byVol.rows.slice(0, 30).map(r => {
      const br = byBreach?.rows.find(x => x.key === r.key)
      const av = byAvg?.rows.find(x => x.key === r.key)
      return {
        name: r.key,
        total: r.count,
        breaches: br?.value ?? 0,
        breachPct: r.count > 0 ? ((br?.value ?? 0) / r.count * 100).toFixed(1) : '0.0',
        avgDays: av ? (av.value / 24).toFixed(1) : '—',
      }
    })
  }, [byVol, byBreach, byAvg])

  return (
    <>
      <div className="grid2">
        <div className="card full"><h3>Top 12 Assignees by Volume</h3>{l1 ? <ChartSkeleton height={400} /> : <HBar data={volData} height={Math.max(280, volData.length * 34)} />}</div>
        <div className="card"><h3>Breach Count — Top 12</h3>{l2 ? <ChartSkeleton /> : <HBar data={breachData} />}</div>
        <div className="card"><h3>Avg Resolution (days) — Top 12</h3>{l3 ? <ChartSkeleton /> : <HBar data={avgData} />}</div>
      </div>
      {byVol && (
        <div className="card full" style={{ marginTop: 18 }}>
          <h3>Assignee Performance Table</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Assignee</th><th>Total</th><th>Breaches</th><th>Breach %</th><th>Avg Days</th></tr></thead>
              <tbody>
                {tableRows.map(r => (
                  <tr key={r.name}>
                    <td>{r.name}</td>
                    <td>{r.total}</td>
                    <td>{r.breaches}</td>
                    <td><span className={'badge ' + (Number(r.breachPct) > 20 ? 'b-red' : 'b-green')}>{r.breachPct}%</span></td>
                    <td>{r.avgDays}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}

// ── SLA tab ───────────────────────────────────────────────────────────────────

function SLATab() {
  const { data: bySla,     isLoading: l1 } = useQuery({ queryKey: ['seg','sla','tc'],    queryFn: () => fetchSegment({ dimension: 'slaStatus', metric: 'ticketCount' }) })
  const { data: byPrioBr,  isLoading: l2 } = useQuery({ queryKey: ['seg','priority','bc'], queryFn: () => fetchSegment({ dimension: 'priority',  metric: 'breachCount' }) })
  const { data: byPrioTc,  isLoading: l3 } = useQuery({ queryKey: ['seg','priority','tc'], queryFn: () => fetchSegment({ dimension: 'priority',  metric: 'ticketCount' }) })

  const slaData = bySla ? toChart(bySla.rows) : []
  const total   = bySla?.total.count ?? 0
  const breached = bySla?.rows.find(r => r.key === 'Breached')?.count ?? 0
  const withinSla = total - breached

  const breachRateData = PRIORITY_ORDER.map(p => {
    const tc = byPrioTc?.rows.find(r => r.key === p)?.count ?? 0
    const bc = byPrioBr?.rows.find(r => r.key === p)?.value ?? 0
    return { name: p, value: tc > 0 ? +(bc / tc * 100).toFixed(1) : 0 }
  })

  return (
    <>
      <div className="kpis">
        <Kpi label="Within SLA"      value={num(withinSla)} sub={pct(withinSla, total)} />
        <Kpi label="SLA Breached"    value={num(breached)}  sub={pct(breached, total)} />
        <Kpi label="Compliance Rate" value={pct(withinSla, total)} sub="overall" />
      </div>
      <div className="grid2">
        <div className="card"><h3>SLA Compliance</h3>{l1 ? <ChartSkeleton /> : <Donut data={slaData} />}</div>
        <div className="card"><h3>Breach Rate by Priority (%)</h3>{(l2 || l3) ? <ChartSkeleton /> : <VBar data={breachRateData} color="#ef4444" />}</div>
        <div className="card full"><h3>Breach Count by Priority</h3>{l2 ? <ChartSkeleton /> : <VBar data={toChartOrdered(byPrioBr?.rows ?? [], PRIORITY_ORDER)} color="#f59e0b" />}</div>
      </div>
    </>
  )
}

// ── Root Cause tab ────────────────────────────────────────────────────────────

function RootCauseTab() {
  const { data: byCount,  isLoading: l1 } = useQuery({ queryKey: ['seg','rc','tc'], queryFn: () => fetchSegment({ dimension: 'rootCause', metric: 'ticketCount' }) })
  const { data: byBreach, isLoading: l2 } = useQuery({ queryKey: ['seg','rc','bc'], queryFn: () => fetchSegment({ dimension: 'rootCause', metric: 'breachCount' }) })

  const countData  = byCount  ? toChart(byCount.rows)  : []
  const breachData = byBreach ? toChart(byBreach.rows) : []

  return (
    <div className="grid2">
      <div className="card"><h3>Tickets by Root Cause</h3>{l1 ? <ChartSkeleton /> : <VBar data={countData} color="#a78bfa" />}</div>
      <div className="card"><h3>Root Cause Distribution</h3>{l1 ? <ChartSkeleton /> : <Donut data={countData} />}</div>
      <div className="card full"><h3>SLA Breaches by Root Cause</h3>{l2 ? <ChartSkeleton height={360} /> : <HBar data={breachData} height={Math.max(240, breachData.length * 36)} />}</div>
    </div>
  )
}

// ── Raw Data tab ──────────────────────────────────────────────────────────────

function RawDataTab() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter]   = useState('All')
  const [priorityFilter, setPriorityFilter] = useState('All')
  const [page, setPage] = useState(1)
  const pageSize = 50

  const params: Record<string, string> = { page: String(page), pageSize: String(pageSize) }
  if (statusFilter !== 'All')   params.status   = statusFilter
  if (priorityFilter !== 'All') params.priority = priorityFilter
  if (search.trim())            params.search   = search.trim()

  const { data, isLoading } = useQuery({
    queryKey: ['tickets', page, statusFilter, priorityFilter, search],
    queryFn:  () => fetchTickets(params),
    staleTime: 60_000,
  })

  function slaClass(t: Ticket) {
    const b = t.resolutionBreach === 'YES' || t.firstResponseBreach === 'YES'
    return b ? 'b-red' : t.resolutionBreach === 'NO' ? 'b-green' : 'b-gray'
  }
  function slaLabel(t: Ticket) {
    return t.resolutionBreach === 'YES' || t.firstResponseBreach === 'YES' ? 'Breached' : t.resolutionBreach === 'NO' ? 'OK' : '—'
  }
  function statusClass(s?: string) {
    if (!s) return 'b-gray'
    const l = s.toLowerCase()
    if (l.includes('resolv')) return 'b-green'
    if (l.includes('progress')) return 'b-blue'
    if (l.includes('open') || l.includes('new')) return 'b-amber'
    return 'b-gray'
  }

  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="card full">
      <div className="controls">
        <input placeholder="Search key, summary, assignee…" value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          style={{ minWidth: 260 }} />
        <label>Status</label>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }}>
          {['All','Open','In Progress','Resolved','Closed'].map(s => <option key={s}>{s}</option>)}
        </select>
        <label>Priority</label>
        <select value={priorityFilter} onChange={e => { setPriorityFilter(e.target.value); setPage(1) }}>
          {['All',...PRIORITY_ORDER].map(s => <option key={s}>{s}</option>)}
        </select>
        <span style={{ color: '#94a3b8', fontSize: 13 }}>{num(total)} rows</span>
      </div>

      {isLoading ? <div className="loading-state">Loading…</div> : (
        <>
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th>Key</th><th>Type</th><th>Summary</th><th>Assignee</th>
                <th>Priority</th><th>Migration Path</th><th>Status</th>
                <th>Res. (hrs)</th><th>SLA</th><th>Created</th>
              </tr></thead>
              <tbody>
                {(data?.data ?? []).map((t: Ticket) => (
                  <tr key={t.id}>
                    <td><span style={{ color: '#38bdf8', fontFamily: 'monospace', fontSize: 12 }}>{t.jiraKey}</span></td>
                    <td>{t.issueType || '—'}</td>
                    <td className="wrap">{t.summary}</td>
                    <td>{t.assignee?.fullName || '—'}</td>
                    <td>{t.priority || '—'}</td>
                    <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.combination || '—'}</td>
                    <td><span className={'badge ' + statusClass(t.status)}>{t.status || '—'}</span></td>
                    <td style={{ textAlign: 'right' }}>{t.resolutionHours != null ? num(t.resolutionHours, 1) : '—'}</td>
                    <td><span className={'badge ' + slaClass(t)}>{slaLabel(t)}</span></td>
                    <td>{fmtDate(t.created)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, fontSize: 13, color: '#94a3b8' }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                style={{ background: '#273449', border: '1px solid #334155', color: '#e2e8f0', borderRadius: 6, padding: '5px 12px', cursor: page === 1 ? 'not-allowed' : 'pointer' }}>
                ←
              </button>
              <span>Page {page} of {totalPages} · {num(total)} total</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                style={{ background: '#273449', border: '1px solid #334155', color: '#e2e8f0', borderRadius: 6, padding: '5px 12px', cursor: page === totalPages ? 'not-allowed' : 'pointer' }}>
                →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Root component ────────────────────────────────────────────────────────────

export function Dashboard() {
  const [tab, setTab] = useState('Overview')

  return (
    <div style={{ padding: '28px 32px', background: 'var(--bg)', minHeight: '100%' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, color: '#e2e8f0' }}>
          Migration Ops Dashboard
        </h1>
        <p style={{ margin: 0, color: '#94a3b8', fontSize: 13 }}>
          Live analytics · status, priority, issue type, migration paths, assignees, SLA
        </p>
      </div>

      <div className="dash-tabs">
        {TABS.map(t => (
          <button key={t} className={'dash-tab' + (tab === t ? ' active' : '')} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'Overview'         && <OverviewTab />}
      {tab === 'Priority'         && <PriorityTab />}
      {tab === 'Issue Type'       && <IssueTypeTab />}
      {tab === 'Migration Paths'  && <MigrationPathsTab />}
      {tab === 'Assignees'        && <AssigneesTab />}
      {tab === 'SLA'              && <SLATab />}
      {tab === 'Root Cause'       && <RootCauseTab />}
      {tab === 'Raw Data'         && <RawDataTab />}
    </div>
  )
}
