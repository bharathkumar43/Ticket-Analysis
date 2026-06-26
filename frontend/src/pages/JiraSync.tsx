import React, { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../api/client'
import { JiraSyncRun } from '../types'

// ── helpers ───────────────────────────────────────────────────────────────────

async function fetchStatus() {
  const r = await apiClient.get('/jira/status')
  return r.data as {
    lastRun: JiraSyncRun | null
    recentRuns: JiraSyncRun[]
    schedule: string
    baseJql: string
  }
}

async function fetchJqlPreview(jql: string, fromDate?: string, toDate?: string) {
  const params: Record<string, string> = { jql }
  if (fromDate) params.fromDate = fromDate
  if (toDate) params.toDate = toDate
  const r = await apiClient.get('/jira/jql-preview', { params })
  return r.data.jql as string
}

async function triggerSync(jql: string, fromDate?: string, toDate?: string): Promise<JiraSyncRun> {
  const body: Record<string, string> = { jql }
  if (fromDate) body.fromDate = fromDate
  if (toDate) body.toDate = toDate
  const r = await apiClient.post('/jira/sync', body)
  return r.data
}

// ── sub-components ────────────────────────────────────────────────────────────

function Badge({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    SUCCESS: ['#10b981', '#d1fae5'],
    FAILED: ['#ef4444', '#fee2e2'],
    RUNNING: ['#f59e0b', '#fef3c7'],
  }
  const [color, bg] = map[status] ?? ['#6b7280', '#f3f4f6']
  return (
    <span style={{ background: bg, color, padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
      {status}
    </span>
  )
}

function RunRow({ run }: { run: JiraSyncRun }) {
  const started = new Date(run.startedAt).toLocaleString()
  const duration = run.finishedAt
    ? `${((new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) / 1000).toFixed(1)}s`
    : '—'
  return (
    <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
      <td style={{ padding: '8px 12px', fontSize: 13, color: '#374151' }}>{started}</td>
      <td style={{ padding: '8px 12px' }}><Badge status={run.status} /></td>
      <td style={{ padding: '8px 12px', fontSize: 13, color: '#374151', textAlign: 'right' }}>{run.fetched}</td>
      <td style={{ padding: '8px 12px', fontSize: 13, color: '#374151', textAlign: 'right' }}>{run.upserted}</td>
      <td style={{ padding: '8px 12px', fontSize: 13, color: '#374151', textAlign: 'right' }}>{duration}</td>
      <td style={{ padding: '8px 12px', fontSize: 12, color: '#6b7280', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {run.error || <span style={{ color: '#9ca3af' }}>—</span>}
      </td>
    </tr>
  )
}

// ── main component ────────────────────────────────────────────────────────────

export function JiraSync() {
  const queryClient = useQueryClient()

  // ── date state (default = current month)
  const now = new Date()
  const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const firstOfNext = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const firstOfNextStr = `${firstOfNext.getFullYear()}-${String(firstOfNext.getMonth() + 1).padStart(2, '0')}-01`

  const [fromDate, setFromDate] = useState(firstOfMonth)
  const [toDate, setToDate] = useState(firstOfNextStr)
  const [useCustomRange, setUseCustomRange] = useState(true)

  // ── custom JQL state
  const [customJql, setCustomJql] = useState('')
  const [jqlEdited, setJqlEdited] = useState(false)

  // ── test connection state
  const [testResult, setTestResult] = useState<{ connected: boolean; user?: string; error?: string } | null>(null)
  const [testLoading, setTestLoading] = useState(false)

  // ── load status
  const { data: status, isLoading } = useQuery({
    queryKey: ['jira-status'],
    queryFn: fetchStatus,
    refetchInterval: 4000,
  })

  // Seed customJql from config on first load (only if user hasn't manually edited it)
  useEffect(() => {
    if (status?.baseJql && !jqlEdited) {
      setCustomJql(status.baseJql)
    }
  }, [status?.baseJql, jqlEdited])

  // ── auto-check connection on page load
  const { data: connStatus, refetch: recheckConn } = useQuery({
    queryKey: ['jira-conn'],
    queryFn: async () => {
      const r = await apiClient.get('/jira/test')
      return r.data as { connected: boolean; user?: string; error?: string }
    },
    staleTime: 30000,
    retry: false,
  })

  // ── live JQL preview — refreshes when JQL text or dates change
  const previewJql = customJql.trim() || status?.baseJql || ''
  const { data: jqlPreview } = useQuery({
    queryKey: [
      'jql-preview',
      previewJql,
      useCustomRange ? fromDate : '',
      useCustomRange ? toDate : '',
    ],
    queryFn: () => fetchJqlPreview(
      previewJql,
      useCustomRange ? fromDate : undefined,
      useCustomRange ? toDate : undefined,
    ),
    enabled: !!previewJql,
  })

  // ── sync mutation
  const syncMutation = useMutation({
    mutationFn: () => triggerSync(
      previewJql,
      useCustomRange ? fromDate : undefined,
      useCustomRange ? toDate : undefined,
    ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jira-status'] })
      recheckConn()
    },
  })

  async function handleTest() {
    setTestLoading(true)
    try {
      const r = await apiClient.get('/jira/test')
      setTestResult(r.data)
    } catch {
      setTestResult({ connected: false, error: 'Request failed' })
    } finally {
      setTestLoading(false)
    }
  }

  const isRunning = status?.lastRun?.status === 'RUNNING'

  // Quick month presets
  const monthPresets = [-2, -1, 0].map(offset => {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1)
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1)
    const label = d.toLocaleString('default', { month: 'long', year: 'numeric' })
    const from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
    const to = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`
    return { label, from, to }
  })

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '32px 36px', maxWidth: 1100 }}>
      <h1 style={{ margin: '0 0 6px', fontSize: 24, fontWeight: 700, color: '#1e1b4b' }}>Jira Sync</h1>
      <p style={{ margin: '0 0 16px', color: '#6b7280', fontSize: 14 }}>
        Enter a JQL query, choose a date range, and pull matching tickets from Jira
      </p>

      {/* ── Connection banner ── */}
      {connStatus && (
        <div style={{
          marginBottom: 20, padding: '12px 16px', borderRadius: 10,
          background: connStatus.connected ? '#f0fdf4' : '#fef2f2',
          border: `1px solid ${connStatus.connected ? '#bbf7d0' : '#fecaca'}`,
          display: 'flex', alignItems: 'flex-start', gap: 10,
        }}>
          <span style={{ fontSize: 16, marginTop: 1 }}>{connStatus.connected ? '✓' : '⚠'}</span>
          <div style={{ flex: 1 }}>
            {connStatus.connected ? (
              <span style={{ fontSize: 13, color: '#15803d', fontWeight: 600 }}>
                Connected to Jira{connStatus.user && connStatus.user !== 'unknown' ? ` · ${connStatus.user}` : ''}
              </span>
            ) : (
              <>
                <div style={{ fontSize: 13, color: '#dc2626', fontWeight: 600, marginBottom: 3 }}>
                  Jira authentication failed — sync will not fetch any tickets
                </div>
                <div style={{ fontSize: 12, color: '#991b1b' }}>
                  Your API token is invalid or expired.{' '}
                  <strong>1)</strong> Go to <strong>id.atlassian.com/manage-profile/security/api-tokens</strong> and create a new token.{' '}
                  <strong>2)</strong> Replace <code>JIRA_API_TOKEN</code> in <code>backend/.env</code>.{' '}
                  <strong>3)</strong> Restart the backend.
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── JQL input (full width) ── */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: 24, marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#374151' }}>JQL Query</div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
              Tickets matching this query will be fetched. Date range is appended automatically below.
            </div>
          </div>
          {jqlEdited && status?.baseJql && (
            <button
              onClick={() => { setCustomJql(status.baseJql); setJqlEdited(false) }}
              style={{
                fontSize: 12, color: '#4f46e5', background: 'none', border: '1px solid #c7d2fe',
                borderRadius: 7, padding: '5px 12px', cursor: 'pointer',
              }}
            >
              Reset to configured JQL
            </button>
          )}
        </div>
        <textarea
          value={customJql}
          onChange={e => { setCustomJql(e.target.value); setJqlEdited(true) }}
          placeholder="e.g. project = L1 AND issuetype = Bug"
          spellCheck={false}
          rows={3}
          style={{
            width: '100%', fontFamily: 'monospace', fontSize: 13,
            padding: '10px 12px', borderRadius: 8,
            border: '1px solid #d1d5db', resize: 'vertical',
            outline: 'none', lineHeight: 1.6, boxSizing: 'border-box',
            color: '#1e1b4b', background: '#fafafa',
          }}
        />
        {jqlEdited && (
          <div style={{ marginTop: 6, fontSize: 12, color: '#f59e0b' }}>
            Using custom JQL — this overrides the JQL configured in backend/.env
          </div>
        )}
      </div>

      {/* ── Date range + Config (2 columns) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>

        {/* Left: date range + preview + sync button */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#374151', marginBottom: 16 }}>Date Range</div>

          {/* Mode toggle */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {[
              { id: true, label: 'Date range' },
              { id: false, label: 'Incremental' },
            ].map(({ id, label }) => (
              <button
                key={String(id)}
                onClick={() => setUseCustomRange(id)}
                style={{
                  padding: '7px 14px', borderRadius: 8, border: '1px solid',
                  borderColor: useCustomRange === id ? '#4f46e5' : '#d1d5db',
                  background: useCustomRange === id ? '#eef2ff' : '#fff',
                  color: useCustomRange === id ? '#4f46e5' : '#6b7280',
                  fontWeight: useCustomRange === id ? 600 : 400,
                  fontSize: 13, cursor: 'pointer',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {useCustomRange ? (
            <>
              {/* Quick month presets */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 6 }}>Quick select</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {monthPresets.map(p => (
                    <button
                      key={p.from}
                      onClick={() => { setFromDate(p.from); setToDate(p.to) }}
                      style={{
                        padding: '5px 11px', borderRadius: 7,
                        border: `1px solid ${fromDate === p.from && toDate === p.to ? '#4f46e5' : '#d1d5db'}`,
                        background: fromDate === p.from && toDate === p.to ? '#eef2ff' : '#fff',
                        color: fromDate === p.from && toDate === p.to ? '#4f46e5' : '#6b7280',
                        fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Date inputs */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#6b7280' }}>
                  From (inclusive)
                  <input
                    type="date" value={fromDate}
                    onChange={e => setFromDate(e.target.value)}
                    style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13 }}
                  />
                </label>
                <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#6b7280' }}>
                  To (exclusive)
                  <input
                    type="date" value={toDate}
                    onChange={e => setToDate(e.target.value)}
                    style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13 }}
                  />
                </label>
              </div>
            </>
          ) : (
            <div style={{ marginBottom: 16, padding: '10px 14px', background: '#f9fafb', borderRadius: 8, fontSize: 13, color: '#6b7280' }}>
              Will fetch tickets updated since the last successful sync
              {status?.lastRun?.startedAt && (
                <span style={{ color: '#374151', fontWeight: 500 }}>
                  {' '}({new Date(status.lastRun.startedAt).toLocaleDateString()})
                </span>
              )}
            </div>
          )}

          {/* JQL preview */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 6 }}>Exact JQL that will be sent to Jira</div>
            <pre style={{
              background: '#1e1b4b', color: '#a5b4fc', borderRadius: 8,
              padding: '12px 14px', fontSize: 12, margin: 0,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.7,
              maxHeight: 160, overflowY: 'auto',
            }}>
              {jqlPreview || (previewJql ? 'Loading preview…' : 'Enter a JQL query above')}
            </pre>
          </div>

          {/* Sync button */}
          <button
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending || isRunning || !previewJql}
            style={{
              width: '100%', background: '#4f46e5', color: '#fff', border: 'none',
              borderRadius: 8, padding: '11px', fontSize: 14, fontWeight: 600,
              cursor: syncMutation.isPending || isRunning || !previewJql ? 'not-allowed' : 'pointer',
              opacity: syncMutation.isPending || isRunning || !previewJql ? 0.6 : 1,
            }}
          >
            {syncMutation.isPending || isRunning ? '⟳ Syncing…' : '▶ Run Sync Now'}
          </button>

          {/* Sync result */}
          {syncMutation.isSuccess && (() => {
            const run = syncMutation.data as any
            if (run?.status === 'FAILED') {
              const isAuth = run.error?.includes('authentication failed')
              return (
                <div style={{ marginTop: 10, padding: '10px 14px', background: '#fef2f2', borderRadius: 8, border: '1px solid #fecaca' }}>
                  <div style={{ fontSize: 13, color: '#dc2626', fontWeight: 600, marginBottom: 4 }}>Sync failed</div>
                  <div style={{ fontSize: 12, color: '#991b1b' }}>{run.error}</div>
                  {isAuth && (
                    <div style={{ marginTop: 6, fontSize: 12, color: '#6b7280' }}>
                      Update <code>JIRA_API_TOKEN</code> in <code>backend/.env</code> with a fresh token from id.atlassian.com, then restart the backend.
                    </div>
                  )}
                </div>
              )
            }
            return (
              <div style={{ marginTop: 10, padding: '10px 14px', background: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0' }}>
                <div style={{ fontSize: 13, color: '#15803d', fontWeight: 600 }}>
                  Sync complete — {run?.fetched ?? 0} fetched, {run?.upserted ?? 0} upserted
                </div>
              </div>
            )
          })()}
          {syncMutation.isError && (
            <div style={{ marginTop: 10, padding: '10px 14px', background: '#fef2f2', borderRadius: 8, border: '1px solid #fecaca' }}>
              <div style={{ fontSize: 13, color: '#dc2626', fontWeight: 600, marginBottom: 4 }}>Sync error</div>
              <div style={{ fontSize: 12, color: '#991b1b' }}>
                {(syncMutation.error as any)?.response?.data?.error?.message || 'Sync failed — check backend logs'}
              </div>
            </div>
          )}
        </div>

        {/* Right: config info + test connection */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#374151', marginBottom: 16 }}>Configuration</div>

          {isLoading ? (
            <div style={{ color: '#9ca3af' }}>Loading…</div>
          ) : (
            <>
              {[
                { label: 'Jira Base URL', value: 'See backend/.env (JIRA_BASE_URL)' },
                { label: 'Configured base JQL', value: status?.baseJql || 'Not configured (set JIRA_JQL in backend/.env)' },
                { label: 'Auto-sync schedule (cron)', value: status?.schedule },
              ].map(({ label, value }) => (
                <div key={label} style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, color: '#9ca3af', fontWeight: 500, marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: 12, color: '#374151', fontFamily: 'monospace', wordBreak: 'break-all' }}>{value || '—'}</div>
                </div>
              ))}

              {/* Last sync summary */}
              {status?.lastRun && (
                <div style={{ background: '#f9fafb', borderRadius: 8, padding: 12, marginBottom: 14 }}>
                  <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 6 }}>Last sync</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <Badge status={status.lastRun.status} />
                    <span style={{ fontSize: 12, color: '#6b7280' }}>
                      {new Date(status.lastRun.startedAt).toLocaleString()}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>
                    Fetched: <strong>{status.lastRun.fetched}</strong> · Upserted: <strong>{status.lastRun.upserted}</strong>
                  </div>
                  {status.lastRun.error && (
                    <div style={{ marginTop: 6, fontSize: 12, color: '#ef4444', wordBreak: 'break-word' }}>{status.lastRun.error}</div>
                  )}
                </div>
              )}

              <button
                onClick={handleTest}
                disabled={testLoading}
                style={{
                  background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db',
                  borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 500,
                  cursor: 'pointer', width: '100%',
                }}
              >
                {testLoading ? 'Testing…' : 'Test Connection'}
              </button>
              {testResult !== null && (
                <div style={{ marginTop: 8, fontSize: 13, color: testResult.connected ? '#10b981' : '#ef4444' }}>
                  {testResult.connected
                    ? `✓ Connected${testResult.user && testResult.user !== 'unknown' ? ` as ${testResult.user}` : ''}`
                    : `✗ ${testResult.error || 'Connection failed'}`
                  }
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Sync history ── */}
      {status?.recentRuns && status.recentRuns.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#374151', marginBottom: 16 }}>Sync History (last 10)</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                  {['Started', 'Status', 'Fetched', 'Upserted', 'Duration', 'Error / JQL used'].map(h => (
                    <th key={h} style={{
                      padding: '8px 12px',
                      textAlign: h === 'Started' || h === 'Error / JQL used' ? 'left' : 'right',
                      color: '#6b7280', fontWeight: 600, whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {status.recentRuns.map(run => <RunRow key={run.id} run={run} />)}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
