import React from 'react'

interface SelectOption { value: string; label: string }

interface FilterPanelProps {
  filters: {
    from?: string
    to?: string
    priority?: string
    status?: string
    customerId?: string
    managerId?: string
    breach?: string
    lifecycle?: string
  }
  onChange: (f: FilterPanelProps['filters']) => void
  managers?: { id: string; fullName: string }[]
  customers?: { id: string; canonical: string }[]
  showLifecycle?: boolean
}

const priorityOptions: SelectOption[] = [
  { value: '', label: 'All Priorities' },
  { value: 'Highest', label: 'Highest' },
  { value: 'High', label: 'High' },
  { value: 'Medium', label: 'Medium' },
  { value: 'Low', label: 'Low' },
  { value: 'Lowest', label: 'Lowest' },
]

const breachOptions: SelectOption[] = [
  { value: '', label: 'All SLA' },
  { value: 'any', label: 'Breached (any)' },
  { value: 'resolution', label: 'Resolution breached' },
  { value: 'firstResponse', label: 'First response breached' },
]

const statusOptions: SelectOption[] = [
  { value: '', label: 'All Statuses' },
  { value: 'Open', label: 'Open' },
  { value: 'In Progress', label: 'In Progress' },
  { value: 'Resolved', label: 'Resolved' },
  { value: 'Closed', label: 'Closed' },
  { value: 'Done', label: 'Done' },
]

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: SelectOption[] }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        padding: '7px 10px', borderRadius: 7, border: '1px solid #d1d5db',
        fontSize: 13, background: '#fff', cursor: 'pointer', minWidth: 150,
      }}
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

function DateInput({ label, value, onChange }: { label: string; value?: string; onChange: (v: string) => void }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12, color: '#6b7280' }}>
      {label}
      <input
        type="date"
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid #d1d5db', fontSize: 13 }}
      />
    </label>
  )
}

export function FilterPanel({ filters, onChange, managers = [], customers = [], showLifecycle }: FilterPanelProps) {
  const set = (key: keyof FilterPanelProps['filters']) => (value: string) =>
    onChange({ ...filters, [key]: value || undefined })

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end',
      padding: '16px', background: '#f9fafb', borderRadius: 10, border: '1px solid #e5e7eb',
    }}>
      <DateInput label="From" value={filters.from} onChange={set('from')} />
      <DateInput label="To" value={filters.to} onChange={set('to')} />

      <Select value={filters.priority || ''} onChange={set('priority')} options={priorityOptions} />
      <Select value={filters.status || ''} onChange={set('status')} options={statusOptions} />
      <Select value={filters.breach || ''} onChange={set('breach')} options={breachOptions} />

      {managers.length > 0 && (
        <Select
          value={filters.managerId || ''}
          onChange={set('managerId')}
          options={[{ value: '', label: 'All Managers' }, ...managers.map(m => ({ value: m.id, label: m.fullName }))]}
        />
      )}

      {customers.length > 0 && (
        <Select
          value={filters.customerId || ''}
          onChange={set('customerId')}
          options={[{ value: '', label: 'All Customers' }, ...customers.map(c => ({ value: c.id, label: c.canonical }))]}
        />
      )}

      {showLifecycle && (
        <Select
          value={filters.lifecycle || ''}
          onChange={set('lifecycle')}
          options={[
            { value: '', label: 'All Lifecycles' },
            { value: 'ACTIVE', label: 'Active' },
            { value: 'COMPLETED', label: 'Completed' },
          ]}
        />
      )}

      {Object.values(filters).some(Boolean) && (
        <button
          onClick={() => onChange({})}
          style={{
            padding: '7px 14px', borderRadius: 7, border: '1px solid #e5e7eb',
            background: '#fff', cursor: 'pointer', fontSize: 13, color: '#6b7280',
          }}
        >
          Clear filters
        </button>
      )}
    </div>
  )
}
