// ===== Logic mirrors the Excel sheet formulas exactly =====

export const COLORS = [
  "#38bdf8", "#22c55e", "#f59e0b", "#a78bfa", "#ef4444",
  "#14b8a6", "#eab308", "#f472b6", "#60a5fa", "#fb923c",
  "#34d399", "#c084fc", "#fbbf24", "#f87171", "#4ade80",
];

// Priority order as shown on the sheets
export const PRIORITY_ORDER = ["Highest", "High", "Medium", "Low", "Lowest"];

// SLA thresholds shown on "Assignee with SLA": Highest=1, High=2, Medium=5, Low=10, Lowest=14
export const SLA_THRESHOLDS = { Highest: 1, High: 2, Medium: 5, Low: 10, Lowest: 14 };

// The 4 issue types on the sheets. "Bug (Code Fix)" label maps to issueType "Bug".
export const ISSUE_TYPES = [
  { label: "Bug (Code Fix)", key: "Bug" },
  { label: "Task", key: "Task" },
  { label: "Sub-task", key: "Sub-task" },
  { label: "Story", key: "Story" },
];

export const count = (rows, fn) => rows.filter(fn).length;

export function countByPriority(rows) {
  return PRIORITY_ORDER.map((p) => ({ name: p, value: count(rows, (r) => r.priority === p) }));
}

export function countByType(rows) {
  return ISSUE_TYPES.map((t) => ({ name: t.label, key: t.key, value: count(rows, (r) => r.issueType === t.key) }));
}

// Top migration paths (Sheet1 "Combination" column) — matches "Top Migration Paths" table
export function topMigrationPaths(rows, topN = 8) {
  const m = {};
  for (const r of rows) {
    const k = (r.combination || "").trim();
    if (!k) continue;
    m[k] = (m[k] || 0) + 1;
  }
  return Object.entries(m)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, topN);
}

// Top assignees by volume + SLA breach % — matches "Top 10 Assignees" table
export function topAssignees(rows, topN = 10) {
  const m = {};
  for (const r of rows) {
    const a = r.assignee || "Unassigned";
    if (!m[a]) m[a] = { assignee: a, tickets: 0, breached: 0 };
    m[a].tickets++;
    if (r.slaBreached === "Yes") m[a].breached++;
  }
  return Object.values(m)
    .map((s) => ({ ...s, slaPct: s.tickets ? s.breached / s.tickets : 0 }))
    .sort((a, b) => b.tickets - a.tickets)
    .slice(0, topN);
}

// Full list of assignees for the dropdowns (sorted, excludes blank/Unassigned)
export function assigneeList(rows) {
  const set = new Set(rows.map((r) => r.assignee).filter((a) => a && a !== "Unassigned"));
  return [...set].sort((a, b) => a.localeCompare(b));
}

const RESOLVED_STATUSES = new Set(["resolved", "closed", "done", "completed", "fixed"]);
export const isResolved = (r) => RESOLVED_STATUSES.has((r.status || "").toLowerCase().trim());

// Avg resolution days for resolved tickets — AVERAGEIF(Status="Resolved", ResolutionDays)
export function avgResolutionDays(rows) {
  const r = rows.filter((x) => isResolved(x) && x.resolutionDays != null);
  if (!r.length) return 0;
  return r.reduce((a, x) => a + x.resolutionDays, 0) / r.length;
}

// Ageing buckets by resolution time — matches "Ticket Ageing" sheet
export function ageing(rows) {
  const res = rows.filter((r) => r.resolutionDays != null);
  const fast = res.filter((r) => r.resolutionDays < 5);
  const mod = res.filter((r) => r.resolutionDays >= 5 && r.resolutionDays <= 10);
  const slow = res.filter((r) => r.resolutionDays > 10);
  return { res, fast, mod, slow };
}

// Priority split inside each ageing bucket — matches "Priority in Each Ageing Bucket" table
export function priorityByBucket(rows) {
  const { fast, mod, slow } = ageing(rows);
  const inB = (arr, p) => arr.filter((r) => r.priority === p).length;
  return PRIORITY_ORDER.map((p) => ({
    name: p,
    "< 5 Days": inB(fast, p),
    "5-10 Days": inB(mod, p),
    "> 10 Days": inB(slow, p),
  }));
}

export const pct = (n, total) => (!total ? "0.0%" : ((n / total) * 100).toFixed(1) + "%");
export const num = (n) => Number(n).toLocaleString("en-US");
export const days = (n, d = 2) => Number(n).toFixed(d);

export const statusBadge = (s) =>
  s === "Resolved" ? "b-green" : s === "Open" ? "b-amber" : s === "In Progress" ? "b-blue" : "b-gray";
