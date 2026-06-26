import React from 'react'

interface KPITileProps {
  label: string
  value: string | number
  sub?: string
  color?: string
  loading?: boolean
}

export function KPITile({ label, value, sub, color = '#4f46e5', loading }: KPITileProps) {
  return (
    <div style={{
      background: '#fff',
      borderRadius: 12,
      border: '1px solid #e5e7eb',
      padding: '20px 24px',
      minWidth: 140,
      flex: 1,
    }}>
      <div style={{ fontSize: 13, color: '#6b7280', fontWeight: 500, marginBottom: 6 }}>{label}</div>
      {loading ? (
        <div style={{ height: 36, background: '#f3f4f6', borderRadius: 6, animation: 'pulse 1.5s infinite' }} />
      ) : (
        <>
          <div style={{ fontSize: 32, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
          {sub && <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>{sub}</div>}
        </>
      )}
    </div>
  )
}
