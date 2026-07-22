import React, { useMemo } from "react";
import { isResolved, num, pct } from "./utils.js";

const DEFAULT_NEUTARA_URL = import.meta.env.VITE_NEUTARA_URL || "https://neutaraticketing.cftools.live";

function TicketLink({ ticketKey, baseUrl }) {
  if (!ticketKey) return null;
  return (
    <a href={`${baseUrl}/browse/${ticketKey}`} target="_blank" rel="noreferrer" className="sla-wf-key">
      {ticketKey}
    </a>
  );
}

function formatWhen(d) {
  if (!d) return "—";
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

// Reusable SLA breach table — ticket, owner, priority, and exact breach timestamp.
// Shared by the SLA Workflow tab and the Migration Managers view.
export function BreachTracker({ rows = [], baseUrl = DEFAULT_NEUTARA_URL, limit = 8, title = "SLA Breaches" }) {
  const stats = useMemo(() => {
    const total = rows.length;
    const breached = rows.filter((r) => r.slaBreached === "Yes");
    const detail = breached
      .map((r) => {
        const open = !isResolved(r);
        const breachedAt = open ? r.createdAt : (r.resolvedAt || r.createdAt);
        return {
          key:         r.key,
          assignee:    r.assignee || "Unassigned",
          priority:    r.priority,
          open,
          breachedAt,
          overageDays: r.resolutionDays ?? null,
        };
      })
      .sort((a, b) => (b.overageDays || 0) - (a.overageDays || 0));
    const ongoing = detail.filter((r) => r.open);
    const closed = detail.filter((r) => !r.open);
    return { total, breached, detail, ongoing, closed };
  }, [rows]);

  const hasData = stats.total > 0;
  if (!hasData) {
    return <div className="empty-state"><p>No ticket data loaded yet.</p></div>;
  }

  const topRows = stats.ongoing.slice(0, limit);

  return (
    <div className="card full">
      <div className="breached-header">
        <h3>
          {title}{" "}
          <span className="mm-count-badge">{num(stats.breached.length)} of {num(stats.total)} tickets</span>
        </h3>
        <span style={{ fontSize: 13, color: "var(--muted)" }}>
          Breach rate {pct(stats.breached.length, stats.total)} — {num(stats.ongoing.length)} still open, {num(stats.closed.length)} closed
        </span>
      </div>
      {topRows.length === 0 ? (
        <div className="empty-state"><p>✅ No ongoing breaches right now.</p></div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Ticket</th><th>Assignee</th><th>Priority</th><th>Open since</th><th>Days elapsed</th>
              </tr>
            </thead>
            <tbody>
              {topRows.map((r) => (
                <tr key={r.key}>
                  <td><TicketLink ticketKey={r.key} baseUrl={baseUrl} /></td>
                  <td>{r.assignee}</td>
                  <td>{r.priority || "—"}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{formatWhen(r.breachedAt)}</td>
                  <td>{r.overageDays != null ? r.overageDays : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
