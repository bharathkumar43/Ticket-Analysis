import React, { useState } from 'react'

interface Column<T> {
  header: string
  accessor: keyof T | ((row: T) => React.ReactNode)
  align?: 'left' | 'right' | 'center'
  sortable?: boolean
}

interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  rowKey: keyof T | ((row: T) => string)
  emptyMessage?: string
}

export function DataTable<T extends object>({ columns, data, rowKey, emptyMessage = 'No data' }: DataTableProps<T>) {
  const [sortCol, setSortCol] = useState<number | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const getKey = (row: T) => typeof rowKey === 'function' ? rowKey(row) : String(row[rowKey])

  const sorted = [...data].sort((a, b) => {
    if (sortCol === null) return 0
    const col = columns[sortCol]
    const va = typeof col.accessor === 'function' ? String(col.accessor(a)) : String(a[col.accessor] ?? '')
    const vb = typeof col.accessor === 'function' ? String(col.accessor(b)) : String(b[col.accessor] ?? '')
    const na = parseFloat(va), nb = parseFloat(vb)
    const cmp = !isNaN(na) && !isNaN(nb) ? na - nb : va.localeCompare(vb)
    return sortDir === 'asc' ? cmp : -cmp
  })

  return (
    <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid #e5e7eb' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
            {columns.map((col, i) => (
              <th
                key={i}
                style={{
                  padding: '10px 14px',
                  textAlign: col.align || 'left',
                  fontWeight: 600,
                  color: '#374151',
                  whiteSpace: 'nowrap',
                  cursor: col.sortable ? 'pointer' : 'default',
                  userSelect: 'none',
                }}
                onClick={() => {
                  if (!col.sortable) return
                  if (sortCol === i) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
                  else { setSortCol(i); setSortDir('desc') }
                }}
              >
                {col.header}
                {col.sortable && sortCol === i && (
                  <span style={{ marginLeft: 4 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={columns.length} style={{ padding: '24px', textAlign: 'center', color: '#9ca3af' }}>
                {emptyMessage}
              </td>
            </tr>
          ) : (
            sorted.map((row, ri) => (
              <tr key={getKey(row)} style={{ borderBottom: '1px solid #f3f4f6', background: ri % 2 === 0 ? '#fff' : '#fafafa' }}>
                {columns.map((col, ci) => (
                  <td key={ci} style={{ padding: '9px 14px', textAlign: col.align || 'left', color: '#374151' }}>
                    {typeof col.accessor === 'function' ? col.accessor(row) : String(row[col.accessor] ?? '—')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
