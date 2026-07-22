import React, { useMemo } from "react";
import { TICKET_TEAMS } from "./ticketTeams.js";
import { isResolved, num, pct, PRIORITY_ORDER } from "./utils.js";

const STALE_DAYS = 7;
const OLD_DAYS = 30;
const TREND_WINDOW_DAYS = 30;
const AGE_BUCKETS = [
  { label: "0–7 days",   min: 0,  max: 7 },
  { label: "8–15 days",  min: 8,  max: 15 },
  { label: "16–30 days", min: 16, max: 30 },
  { label: "31–60 days", min: 31, max: 60 },
  { label: "60+ days",   min: 61, max: Infinity },
];

const NOT_YET_AVAILABLE = [
  { label: "Near-SLA (due within a few hours)", why: "needs the exact SLA due timestamp from Jira's SLA field, not just the computed breach flag" },
  { label: "Reopened Tickets",                  why: "needs the ticket's status-change history (changelog), which isn't fetched today" },
  { label: "Blocked / Waiting on Customer",      why: "needs a dedicated status or field for this — current data only has the ticket's current status name" },
  { label: "Resolved Without Closure",           why: "needs Resolved and Closed to be tracked as distinct statuses; they're currently grouped together" },
  { label: "Duplicate Tickets",                  why: "needs a \"duplicate of\" link/field, not currently fetched" },
  { label: "Missing Attachments",                why: "needs attachment metadata, not currently fetched" },
  { label: "Customer Response Waiting Time",     why: "needs comment/response timestamps, not currently fetched" },
];

function daysSince(date) {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return null;
  return (Date.now() - d.getTime()) / 86400000;
}

function isStale(r, thresholdDays) {
  const lastActivity = r.updatedAt || r.createdAt;
  const age = daysSince(lastActivity);
  return age !== null && age > thresholdDays;
}

function isOverdue(r) {
  if (!r.dueDate) return false;
  const d = r.dueDate instanceof Date ? r.dueDate : new Date(r.dueDate);
  return !isNaN(d.getTime()) && d.getTime() < Date.now();
}

function isMissingLabels(r) {
  return !r.labels || !String(r.labels).trim();
}

function computeHygiene(rows) {
  const open = rows.filter((r) => !isResolved(r));
  const unassigned = open.filter((r) => !r.assignee || r.assignee === "Unassigned");
  const slaBreached = open.filter((r) => r.slaBreached === "Yes");
  const overdue = open.filter(isOverdue);
  const stale = open.filter((r) => isStale(r, STALE_DAYS));
  const old = open.filter((r) => (r.resolutionDays ?? 0) > OLD_DAYS);
  const missingLabels = open.filter(isMissingLabels);

  const priorityDist = PRIORITY_ORDER.map((p) => ({
    priority: p,
    count: open.filter((r) => r.priority === p).length,
  }));

  const ageBuckets = AGE_BUCKETS.map((b) => ({
    ...b,
    count: open.filter((r) => {
      const d = r.resolutionDays ?? 0;
      return d >= b.min && d <= b.max;
    }).length,
  }));

  const windowStart = Date.now() - TREND_WINDOW_DAYS * 86400000;
  const createdInWindow = rows.filter((r) => r.createdAt && new Date(r.createdAt).getTime() >= windowStart).length;
  const resolvedInWindow = rows.filter((r) => r.resolvedAt && new Date(r.resolvedAt).getTime() >= windowStart).length;

  return {
    total: rows.length,
    open, unassigned, slaBreached, overdue, stale, old, missingLabels,
    priorityDist, ageBuckets, createdInWindow, resolvedInWindow,
  };
}

function SummaryCard({ icon, label, value, tone }) {
  return (
    <div className="card" style={{ padding: "14px 16px" }}>
      <div style={{ fontSize: 12, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}>
        <span>{icon}</span><span>{label}</span>
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4, color: tone || "inherit" }}>{value}</div>
    </div>
  );
}

export function TicketHygiene({ rows = [] }) {
  const h = useMemo(() => computeHygiene(rows), [rows]);

  const teamsData = useMemo(() => {
    return Object.entries(TICKET_TEAMS).map(([team, members]) => {
      const memberRows = members.map((name) => {
        const nameLower = name.toLowerCase().trim();
        const personOpen = h.open.filter((r) => (r.assignee || "").toLowerCase().trim() === nameLower);
        return {
          name,
          open: personOpen.length,
          stale: personOpen.filter((r) => isStale(r, STALE_DAYS)).length,
          breached: personOpen.filter((r) => r.slaBreached === "Yes").length,
          overdue: personOpen.filter(isOverdue).length,
          old: personOpen.filter((r) => (r.resolutionDays ?? 0) > OLD_DAYS).length,
        };
      });
      return { team, members: memberRows };
    });
  }, [h.open]);

  if (rows.length === 0) {
    return <div className="empty-state"><p>No ticket data loaded yet — load an export to see the hygiene report.</p></div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h2 style={{ marginBottom: 4 }}>Ticket Hygiene</h2>
        <p style={{ color: "var(--muted)", marginTop: 0 }}>
          {num(h.total)} tickets loaded — {num(h.open.length)} currently open.
        </p>
      </div>

      {/* Summary cards */}
      <div className="ai-kpis" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
        <SummaryCard icon="🟢" label="Open Tickets"    value={num(h.open.length)} />
        <SummaryCard icon="👤" label="Unassigned"       value={num(h.unassigned.length)} tone={h.unassigned.length ? "var(--red)" : undefined} />
        <SummaryCard icon="⏰" label="SLA Breached"     value={num(h.slaBreached.length)} tone={h.slaBreached.length ? "var(--red)" : undefined} />
        <SummaryCard icon="📅" label="Overdue"          value={num(h.overdue.length)} tone={h.overdue.length ? "var(--red)" : undefined} />
        <SummaryCard icon={`🔴`} label={`Stale > ${STALE_DAYS}d`} value={num(h.stale.length)} tone={h.stale.length ? "var(--amber)" : undefined} />
        <SummaryCard icon="📌" label={`Old > ${OLD_DAYS}d`} value={num(h.old.length)} tone={h.old.length ? "var(--amber)" : undefined} />
        <SummaryCard icon="📝" label="Missing Labels"   value={num(h.missingLabels.length)} />
      </div>

      {/* Priority distribution + Aging */}
      <div className="grid">
        <div className="card">
          <h3>🏷️ Priority Distribution (open)</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Priority</th><th>Count</th><th>% Share</th></tr></thead>
              <tbody>
                {h.priorityDist.map((p) => (
                  <tr key={p.priority}>
                    <td>{p.priority}</td>
                    <td>{num(p.count)}</td>
                    <td>{pct(p.count, h.open.length)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <h3>📈 Aging Report (open)</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Bucket</th><th>Count</th><th>% Share</th></tr></thead>
              <tbody>
                {h.ageBuckets.map((b) => (
                  <tr key={b.label}>
                    <td>{b.label}</td>
                    <td>{num(b.count)}</td>
                    <td>{pct(b.count, h.open.length)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Resolution trend */}
      <div className="card full">
        <h3>📊 Resolution Trend — last {TREND_WINDOW_DAYS} days</h3>
        <div style={{ display: "flex", gap: 32, fontSize: 14 }}>
          <div>Created: <strong>{num(h.createdInWindow)}</strong></div>
          <div>Resolved: <strong>{num(h.resolvedInWindow)}</strong></div>
          <div>Net change: <strong style={{ color: h.createdInWindow > h.resolvedInWindow ? "var(--red)" : "var(--green)" }}>
            {h.createdInWindow - h.resolvedInWindow > 0 ? "+" : ""}{num(h.createdInWindow - h.resolvedInWindow)}
          </strong></div>
        </div>
      </div>

      {/* Per-team, per-person hygiene table */}
      {teamsData.map(({ team, members }) => (
        <div key={team} className="card full" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ background: "#4472C4", color: "#fff", padding: "10px 16px" }}>
            <h3 style={{ margin: 0, color: "#fff" }}>{team}</h3>
          </div>
          <div className="table-wrap">
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#D9E2F3" }}>
                  <th style={thStyle}>Name</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>Open</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>Stale &gt;{STALE_DAYS}d</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>SLA Breached</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>Overdue</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>Old &gt;{OLD_DAYS}d</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.name}>
                    <td style={tdStyle}>{m.name}</td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>{m.open}</td>
                    <td style={{ ...tdStyle, textAlign: "center", color: m.stale > 0 ? "#8B0000" : "inherit" }}>{m.stale}</td>
                    <td style={{ ...tdStyle, textAlign: "center", color: m.breached > 0 ? "#8B0000" : "inherit" }}>{m.breached}</td>
                    <td style={{ ...tdStyle, textAlign: "center", color: m.overdue > 0 ? "#8B0000" : "inherit" }}>{m.overdue}</td>
                    <td style={{ ...tdStyle, textAlign: "center", color: m.old > 0 ? "#8B0000" : "inherit" }}>{m.old}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {/* What's not covered yet */}
      <div className="card full" style={{ fontSize: 13 }}>
        <h3>ℹ️ Not yet available in this report</h3>
        <p style={{ color: "var(--muted)", marginTop: 0 }}>These need data our ticket sources don't fetch today:</p>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          {NOT_YET_AVAILABLE.map((m) => (
            <li key={m.label} style={{ marginBottom: 4 }}>
              <strong>{m.label}</strong> — <span style={{ color: "var(--muted)" }}>{m.why}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const thStyle = { textAlign: "left", padding: "8px 16px", borderBottom: "1px solid #b7c6e6", fontWeight: 700 };
const tdStyle = { padding: "6px 16px", borderBottom: "1px solid #e5e5e5" };
