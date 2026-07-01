import React from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ResponsiveContainer,
} from "recharts";
import { COLORS } from "../utils.js";

const CHART_BG = "transparent";
const AXIS_COLOR = "#94a3b8";
const GRID_COLOR = "#334155";

/* -------- Shared tooltip style -------- */
const tooltipStyle = {
  backgroundColor: "#1e293b",
  border: "1px solid #334155",
  borderRadius: 8,
  color: "#e2e8f0",
  fontSize: 13,
};

/* ================================================================
   BarChartCard
   Props:
     data         – [{ name, value }] for simple bars
                    [{ name, "< 5 Days": n, "5-10 Days": n, "> 10 Days": n }] for stacked
     color        – single bar fill (default COLORS[0])
     horizontal   – renders horizontal bars (layout="vertical")
     height       – chart height in px (default 280)
     stackedKeys  – string[] of keys to stack; if provided, renders a stacked bar chart
   ================================================================ */
export function BarChartCard({ data, color = COLORS[0], horizontal = false, height = 280, stackedKeys }) {
  if (!data || !data.length) return <div style={{ color: "#94a3b8", padding: 20 }}>No data</div>;

  const layout = horizontal ? "vertical" : "horizontal";
  const isStacked = Array.isArray(stackedKeys) && stackedKeys.length > 0;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout={layout} margin={{ top: 4, right: 16, bottom: 4, left: horizontal ? 120 : 0 }}>
        <CartesianGrid vertical={false} stroke="#e2e8f0" strokeOpacity={0.4} />
        {horizontal ? (
          <>
            <XAxis type="number" tick={{ fill: AXIS_COLOR, fontSize: 12 }} />
            <YAxis type="category" dataKey="name" tick={{ fill: AXIS_COLOR, fontSize: 12 }} width={115} />
          </>
        ) : (
          <>
            <XAxis dataKey="name" tick={{ fill: AXIS_COLOR, fontSize: 12 }} />
            <YAxis tick={{ fill: AXIS_COLOR, fontSize: 12 }} />
          </>
        )}
        <Tooltip contentStyle={tooltipStyle} />
        {isStacked && <Legend wrapperStyle={{ color: AXIS_COLOR, fontSize: 12 }} />}
        {isStacked
          ? stackedKeys.map((k, i) => (
              <Bar key={k} dataKey={k} stackId="a" fill={COLORS[i % COLORS.length]} radius={i === stackedKeys.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
            ))
          : <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} />
        }
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ================================================================
   PieChartCard  (donut)
   Props:
     data  – [{ name, value }]
     height – chart height in px (default 260)
   ================================================================ */
const RADIAN = Math.PI / 180;
function CustomLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }) {
  if (percent < 0.04) return null;
  const r = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + r * Math.cos(-midAngle * RADIAN);
  const y = cy + r * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={600}>
      {(percent * 100).toFixed(0)}%
    </text>
  );
}

export function PieChartCard({ data, height = 260 }) {
  if (!data || !data.length) return <div style={{ color: "#94a3b8", padding: 20 }}>No data</div>;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius="42%"
          outerRadius="68%"
          paddingAngle={2}
          dataKey="value"
          labelLine={false}
          label={<CustomLabel />}
        >
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} />
        <Legend
          formatter={(v) => <span style={{ color: AXIS_COLOR, fontSize: 12 }}>{v}</span>}
          iconType="circle"
          iconSize={10}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
