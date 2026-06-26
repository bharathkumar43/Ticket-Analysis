import React from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, LineChart, Line, ResponsiveContainer,
} from 'recharts'
import { SegmentResult, Dimension, Metric } from '../../types'

const COLORS = [
  '#4f46e5', '#06b6d4', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1',
  '#84cc16', '#a78bfa', '#fb923c', '#34d399', '#60a5fa',
]

function pickChartType(dimension: Dimension, metric: Metric, hasSubDimension: boolean): 'bar' | 'horizontalBar' | 'stacked' | 'pie' | 'donut' {
  if (hasSubDimension) return 'stacked'
  if (metric === 'breachRate') return 'bar'
  if (['rootCause', 'slaStatus', 'status', 'priority'].includes(dimension)) return 'donut'
  if (['customer', 'project'].includes(dimension)) return 'horizontalBar'
  return 'bar'
}

interface SegmentChartProps {
  result: SegmentResult
  dimension: Dimension
  metric: Metric
  subDimension?: Dimension
  topN?: number
  height?: number
}

const metricLabel: Record<Metric, string> = {
  ticketCount: 'Tickets',
  breachCount: 'Breaches',
  breachRate: 'Breach Rate',
  avgDelayDays: 'Avg Delay Days',
  avgResolutionHours: 'Avg Resolution Hours',
  projectCount: 'Projects',
}

const formatValue = (metric: Metric, value: number) => {
  if (metric === 'breachRate') return `${(value * 100).toFixed(1)}%`
  return value.toLocaleString()
}

export function SegmentChart({ result, dimension, metric, subDimension, topN = 15, height = 320 }: SegmentChartProps) {
  const type = pickChartType(dimension, metric, !!subDimension)
  const rows = result.rows.slice(0, topN)

  if (type === 'donut' || type === 'pie') {
    const pieData = rows.map((r, i) => ({ name: r.key, value: r.value, count: r.count }))
    if (result.unassigned.count > 0) {
      pieData.push({ name: 'Unassigned', value: result.unassigned.count, count: result.unassigned.count })
    }

    return (
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={pieData}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={type === 'donut' ? 60 : 0}
            outerRadius={110}
            paddingAngle={2}
            label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
            labelLine
          >
            {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Pie>
          <Tooltip formatter={(v: any) => formatValue(metric, v)} />
        </PieChart>
      </ResponsiveContainer>
    )
  }

  if (type === 'stacked') {
    const seriesKeys = Array.from(new Set(rows.flatMap(r => Object.keys(r.series || {}))))
    const barData = rows.map(r => ({ name: r.key, ...r.series }))

    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={barData} margin={{ top: 10, right: 20, left: 0, bottom: 60 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
          <XAxis dataKey="name" tick={{ fontSize: 12 }} angle={-35} textAnchor="end" />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip />
          <Legend />
          {seriesKeys.map((k, i) => (
            <Bar key={k} dataKey={k} stackId="a" fill={COLORS[i % COLORS.length]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    )
  }

  if (type === 'horizontalBar') {
    const barData = rows.map(r => ({ name: r.key, value: r.value }))
    if (result.unassigned.count > 0) {
      barData.push({ name: 'Unassigned', value: result.unassigned.count })
    }

    return (
      <ResponsiveContainer width="100%" height={Math.max(height, barData.length * 28 + 40)}>
        <BarChart data={barData} layout="vertical" margin={{ top: 10, right: 30, left: 100, bottom: 10 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
          <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={v => formatValue(metric, v)} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={100} />
          <Tooltip formatter={(v: any) => formatValue(metric, v)} />
          <Bar dataKey="value" fill={COLORS[0]} radius={[0, 4, 4, 0]}>
            {barData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    )
  }

  // Default: vertical bar
  const barData = rows.map(r => ({ name: r.key, value: r.value }))
  if (result.unassigned.count > 0 && metric === 'ticketCount') {
    barData.push({ name: 'Unassigned', value: result.unassigned.count })
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={barData} margin={{ top: 10, right: 20, left: 0, bottom: 70 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
        <XAxis dataKey="name" tick={{ fontSize: 12 }} angle={-35} textAnchor="end" interval={0} />
        <YAxis tick={{ fontSize: 12 }} tickFormatter={v => formatValue(metric, v)} />
        <Tooltip formatter={(v: any) => formatValue(metric, v)} labelStyle={{ fontWeight: 600 }} />
        <Bar dataKey="value" name={metricLabel[metric]} radius={[4, 4, 0, 0]}>
          {barData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
