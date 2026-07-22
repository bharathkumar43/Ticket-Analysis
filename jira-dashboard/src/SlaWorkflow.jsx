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

export function SlaWorkflow({ rows = [], baseUrl = DEFAULT_NEUTARA_URL, isDemo, fileName, onGoToUpload, onGoToNeutara, onGoToJira }) {
  const stats = useMemo(() => {
    const total = rows.length;
    const breached = rows.filter((r) => r.slaBreached === "Yes");
    const ongoing = breached.filter((r) => !isResolved(r));
    const closed = breached.filter((r) => isResolved(r));
    const byPm = {};
    for (const r of rows) {
      const pm = r.projectManager || "Unassigned";
      if (!byPm[pm]) byPm[pm] = { total: 0, breached: 0 };
      byPm[pm].total++;
      if (r.slaBreached === "Yes") byPm[pm].breached++;
    }
    const pmRows = Object.entries(byPm)
      .map(([pm, v]) => ({ pm, ...v, rate: v.total ? v.breached / v.total : 0 }))
      .sort((a, b) => b.breached - a.breached);

    // Full breach detail — who owns it and when it broke, worst overage first.
    const breachDetail = breached
      .map((r) => {
        const open = !isResolved(r);
        const breachedAt = open ? r.createdAt : (r.resolvedAt || r.createdAt);
        return {
          key:        r.key,
          assignee:   r.assignee || "Unassigned",
          priority:   r.priority,
          open,
          breachedAt,
          overageDays: r.resolutionDays ?? null,
        };
      })
      .sort((a, b) => (b.overageDays || 0) - (a.overageDays || 0));
    const topOngoing = breachDetail.filter((r) => r.open).slice(0, 8);

    return { total, breached, ongoing, closed, pmRows, breachDetail, topOngoing };
  }, [rows]);

  const hasData = stats.total > 0;

  return (
    <div className="sla-workflow" style={{ maxWidth: 820 }}>
      <h2 style={{ marginBottom: 4 }}>SLA Breach Workflow</h2>
      <p style={{ color: "var(--muted, #666)", marginTop: 0, marginBottom: 20 }}>
        The process for pulling ticket data, loading it into the tracker, and triaging SLA breaches — live status for each step below.
      </p>

      <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
        <li style={stepStyle(false)}>
          <StepBadge n={1} />
          <div>
            <div style={titleStyle}>Pull the tickets</div>
            <div style={bodyStyle}>
              Load every ticket from Neutara or directly from Jira, or upload an Excel export for the reporting window and PMs you track.
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              {onGoToNeutara && (
                <button className="btn-sm" onClick={onGoToNeutara}>🎫 Load from Neutara</button>
              )}
              {onGoToJira && (
                <button className="btn-sm" onClick={onGoToJira}>🔗 Load from Jira</button>
              )}
              {onGoToUpload && (
                <button className="btn-sm" onClick={onGoToUpload}>📊 Upload Excel</button>
              )}
            </div>
          </div>
        </li>

        <li style={stepStyle(false)}>
          <StepBadge n={2} />
          <div>
            <div style={titleStyle}>Load it into the tracker</div>
            <div style={bodyStyle}>
              The tracker reads each ticket's created/resolved timestamps to compute SLA breach status, plus the assignee and Project Manager fields.
            </div>
            <div style={liveBoxStyle}>
              {hasData ? (
                <>
                  {isDemo
                    ? <span>🧪 Currently showing <strong>sample data</strong> — no real export loaded yet.</span>
                    : <span>📊 Loaded: <strong>{fileName || "current export"}</strong> — <strong>{num(stats.total)}</strong> tickets</span>
                  }
                </>
              ) : (
                <span>⚪ No tickets loaded yet.</span>
              )}
            </div>
          </div>
        </li>

        <li style={stepStyle(false)}>
          <StepBadge n={3} />
          <div>
            <div style={titleStyle}>Read the breaches</div>
            <div style={bodyStyle}>
              A ticket is flagged when its elapsed business days exceed its priority's SLA threshold — whether it's still open or already resolved. Sort by overage to triage the worst first.
            </div>
            <div style={liveBoxStyle}>
              {hasData ? (
                <span>
                  🚨 <strong>{num(stats.breached.length)}</strong> breached of <strong>{num(stats.total)}</strong> tickets
                  ({pct(stats.breached.length, stats.total)}) —
                  {" "}<strong>{num(stats.ongoing.length)}</strong> still open, <strong>{num(stats.closed.length)}</strong> closed
                </span>
              ) : (
                <span>⚪ Load tickets in step 2 to see live breach counts.</span>
              )}
            </div>
          </div>
        </li>

        <li style={stepStyle(false)}>
          <StepBadge n={4} />
          <div>
            <div style={titleStyle}>Act &amp; assign</div>
            <div style={bodyStyle}>
              Open each breached ticket from its key, confirm the current owner, and prioritize ongoing breaches (still open) over closed ones — these are still burning time.
            </div>
            {hasData && stats.topOngoing.length > 0 && (
              <div style={liveBoxStyle}>
                <div style={{ marginBottom: 6 }}>🔴 Top ongoing breaches to triage first — owner and when the clock started:</div>
                <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border, #e5e5e5)" }}>
                      <th style={{ padding: "4px 8px 4px 0" }}>Ticket</th>
                      <th style={{ padding: "4px 8px" }}>Assignee</th>
                      <th style={{ padding: "4px 8px" }}>Priority</th>
                      <th style={{ padding: "4px 8px" }}>Open since</th>
                      <th style={{ padding: "4px 8px" }}>Days elapsed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.topOngoing.map((r) => (
                      <tr key={r.key}>
                        <td style={{ padding: "4px 8px 4px 0" }}><TicketLink ticketKey={r.key} baseUrl={baseUrl} /></td>
                        <td style={{ padding: "4px 8px" }}>{r.assignee}</td>
                        <td style={{ padding: "4px 8px" }}>{r.priority || "—"}</td>
                        <td style={{ padding: "4px 8px" }}>{formatWhen(r.breachedAt)}</td>
                        <td style={{ padding: "4px 8px" }}>{r.overageDays != null ? r.overageDays : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {hasData && stats.topOngoing.length === 0 && (
              <div style={liveBoxStyle}><span>✅ No ongoing breaches right now.</span></div>
            )}
          </div>
        </li>

        <li style={stepStyle(true)}>
          <StepBadge n={5} />
          <div>
            <div style={titleStyle}>Log the weekly number</div>
            <div style={bodyStyle}>
              Record total tickets, breach count, and breach rate for the window. Track the trend week over week per PM to see if response times are improving.
            </div>
            {hasData && (
              <div style={liveBoxStyle}>
                <div style={{ marginBottom: 8 }}>
                  📋 This window: <strong>{num(stats.total)}</strong> tickets, <strong>{num(stats.breached.length)}</strong> breaches,
                  {" "}breach rate <strong>{pct(stats.breached.length, stats.total)}</strong>
                </div>
                {stats.pmRows.length > 0 && (
                  <table className="sla-wf-pm-table" style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border, #e5e5e5)" }}>
                        <th style={{ padding: "4px 8px 4px 0" }}>PM</th>
                        <th style={{ padding: "4px 8px" }}>Tickets</th>
                        <th style={{ padding: "4px 8px" }}>Breaches</th>
                        <th style={{ padding: "4px 8px" }}>Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.pmRows.map((p) => (
                        <tr key={p.pm}>
                          <td style={{ padding: "4px 8px 4px 0" }}>{p.pm}</td>
                          <td style={{ padding: "4px 8px" }}>{num(p.total)}</td>
                          <td style={{ padding: "4px 8px" }}>{num(p.breached)}</td>
                          <td style={{ padding: "4px 8px" }}>{pct(p.breached, p.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </li>
      </ol>
    </div>
  );
}

function StepBadge({ n }) {
  return (
    <div
      style={{
        flexShrink: 0,
        width: 32,
        height: 32,
        borderRadius: "50%",
        background: "var(--panel2, #f2f2f2)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 600,
      }}
    >
      {n}
    </div>
  );
}

const titleStyle = { fontWeight: 600, marginBottom: 4 };
const bodyStyle = { color: "var(--muted, #555)" };
const liveBoxStyle = {
  marginTop: 10,
  padding: "8px 12px",
  borderRadius: 8,
  background: "var(--panel2, #f7f7f8)",
  border: "1px solid var(--border, #e5e5e5)",
  fontSize: 14,
};
function stepStyle(isLast) {
  return {
    display: "flex",
    gap: 16,
    padding: "16px 0",
    borderBottom: isLast ? "none" : "1px solid var(--border, #e5e5e5)",
  };
}
