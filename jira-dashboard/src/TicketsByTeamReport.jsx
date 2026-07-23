import React, { useEffect, useMemo, useState } from "react";
import { TICKET_TEAMS } from "./ticketTeams.js";
import { fetchLiveIssues } from "./jiraApi.js";

// CFITS = L1 board, L2B = L2 board — fetched as two independently-verified
// queries and merged, rather than one combined `project IN (...)` query, so
// there's no ambiguity about which project's rows did or didn't come back.
const CFITS_JQL = "project = CFITS AND status NOT IN (Resolved, Closed) ORDER BY created DESC";
const L2B_JQL   = "status != Resolved AND project = L2B ORDER BY created DESC";

function downloadCsv(filename, headers, rows) {
  const csv = [headers, ...rows]
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportTeamCsv(team, members, totalOpen, totalBreached) {
  downloadCsv(
    `${team.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-tickets.csv`,
    ["Name", "Open Tickets", "SLA Breached Tickets"],
    [...members.map((m) => [m.name, m.open, m.breached]), ["Total", totalOpen, totalBreached]]
  );
}

function exportCombinedCsv(teamsData, unmatched) {
  const rows = [];
  for (const { team, members, totalOpen, totalBreached } of teamsData) {
    for (const m of members) rows.push([team, m.name, m.open, m.breached]);
    rows.push([team, "Total", totalOpen, totalBreached]);
  }
  if (unmatched.length > 0) {
    for (const m of unmatched) rows.push(["Not in any roster", m.name, m.open, m.breached]);
  }
  downloadCsv("team-tickets-report.csv", ["Team", "Name", "Open Tickets", "SLA Breached Tickets"], rows);
}

// Automatically loads live tickets from Jira and tallies each rostered person's
// currently-open tickets and how many are SLA-breached, grouped by team.
// Well above any realistic CFITS+L2B combined ticket count — a per-person
// report must never silently truncate, or some people's older tickets just
// vanish from their count with no indication anything was cut off.
const MAX_TICKETS = 5000;

export function TicketsByTeamReport({ backendUrl, beToken }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const [lastLoaded, setLastLoaded] = useState(null);

  const canAutoLoad = !!(backendUrl && beToken);

  async function loadFromJira() {
    if (!canAutoLoad) return;
    setLoading(true);
    setError(null);
    try {
      const [cfits, l2b] = await Promise.all([
        fetchLiveIssues(backendUrl, beToken, CFITS_JQL, null, MAX_TICKETS),
        fetchLiveIssues(backendUrl, beToken, L2B_JQL, null, MAX_TICKETS),
      ]);
      setRows([...(cfits.rows || []), ...(l2b.rows || [])]);
      setWarnings([...(cfits.warnings || []), ...(l2b.warnings || [])]);
      setLastLoaded(new Date());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFromJira();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendUrl, beToken]);

  // Every rostered name, lowercased, so we can tell which assignees in the live
  // Jira data (e.g. new L2B engineers) aren't in any team roster yet — those
  // tickets would otherwise silently vanish from every count below.
  const rosterSet = useMemo(() => {
    const s = new Set();
    for (const members of Object.values(TICKET_TEAMS)) {
      for (const name of members) s.add(name.toLowerCase().trim());
    }
    return s;
  }, []);

  // The JQL already scopes to "active" (status NOT IN (Resolved, Closed)) —
  // don't re-filter with utils.js's isResolved(), which also treats "Done"/
  // "Completed"/"Fixed" as resolved. If a board's terminal status is named
  // "Done" rather than "Resolved"/"Closed", that double-filter was silently
  // dropping its still-active tickets from every count below.
  const teamsData = useMemo(() => {
    return Object.entries(TICKET_TEAMS).map(([team, members]) => {
      const memberRows = members.map((name) => {
        const nameLower = name.toLowerCase().trim();
        const openTickets = rows.filter((r) => (r.assignee || "").toLowerCase().trim() === nameLower);
        const breached = openTickets.filter((r) => r.slaBreached === "Yes");
        return { name, open: openTickets.length, breached: breached.length };
      });
      const totalOpen = memberRows.reduce((s, m) => s + m.open, 0);
      const totalBreached = memberRows.reduce((s, m) => s + m.breached, 0);
      return { team, members: memberRows, totalOpen, totalBreached };
    });
  }, [rows]);

  const unmatched = useMemo(() => {
    const byAssignee = {};
    for (const r of rows) {
      const assignee = r.assignee || "Unassigned";
      if (rosterSet.has(assignee.toLowerCase().trim())) continue;
      if (!byAssignee[assignee]) byAssignee[assignee] = { name: assignee, open: 0, breached: 0 };
      byAssignee[assignee].open++;
      if (r.slaBreached === "Yes") byAssignee[assignee].breached++;
    }
    return Object.values(byAssignee).sort((a, b) => b.open - a.open);
  }, [rows, rosterSet]);
  // Raw per-project counts straight from Jira's response — the fastest way to
  // see whether L2B is actually returning any tickets at all, independent of
  // any roster-matching logic.
  const projectBreakdown = useMemo(() => {
    const byProject = {};
    for (const r of rows) {
      const p = r.project || "(unknown)";
      byProject[p] = (byProject[p] || 0) + 1;
    }
    return Object.entries(byProject).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const unmatchedTotal = unmatched.reduce((s, m) => s + m.open, 0);
  const unmatchedBreached = unmatched.reduce((s, m) => s + m.breached, 0);

  if (!canAutoLoad) {
    return <div className="empty-state"><p>Sign in to auto-load the team report from Jira.</p></div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 13, color: "var(--muted)" }}>
          {loading
            ? "⏳ Loading tickets from Jira…"
            : lastLoaded
              ? `📊 ${rows.length} tickets — last loaded ${lastLoaded.toLocaleTimeString()}`
              : "No data loaded yet"}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn-sm" onClick={loadFromJira} disabled={loading}>
            🔄 {loading ? "Refreshing…" : "Refresh"}
          </button>
          <button className="btn-sm" onClick={() => exportCombinedCsv(teamsData, unmatched)} disabled={rows.length === 0}>
            📥 Download Full Report
          </button>
        </div>
      </div>

      <div style={{ fontSize: 12, color: "var(--muted)", fontFamily: "monospace", padding: "6px 10px", background: "var(--panel2, #f7f7f8)", borderRadius: 6 }}>
        CFITS JQL: {CFITS_JQL}<br />
        L2B JQL: {L2B_JQL}
      </div>

      {!loading && lastLoaded && rows.length > 0 && (
        <div style={{ fontSize: 13, padding: "8px 10px", background: "var(--panel2, #f7f7f8)", borderRadius: 6, border: "1px solid var(--border, #e5e5e5)" }}>
          <strong>Tickets fetched per project:</strong>{" "}
          {projectBreakdown.map(([p, count]) => `${p}: ${count}`).join("  ·  ")}
          {!projectBreakdown.some(([p]) => p === "L2B") && (
            <div style={{ color: "#92400e", marginTop: 4 }}>
              ⚠️ No L2B tickets came back at all — Jira isn't returning anything for that project in this query.
            </div>
          )}
        </div>
      )}

      {!loading && lastLoaded && rows.length === 0 && (
        <div className="jc-error" style={{ background: "#fef3c7", color: "#92400e", borderColor: "#d97706" }}>
          ⚠️ Jira returned 0 tickets for this exact query. Paste the JQL above into Jira's own issue search to verify —
          if Jira also shows 0 there, either the project key(s) are wrong, there really are no open tickets right now,
          or the Jira account behind the API token doesn't have Browse permission on one of these projects.
        </div>
      )}

      {error && <div className="jc-error">⚠️ {error}</div>}
      {warnings.map((w, i) => (
        <div key={i} className="jc-error" style={{ background: "#fef3c7", color: "#92400e", borderColor: "#d97706" }}>
          ⚠️ {w} — counts below may be incomplete.
        </div>
      ))}

      {rows.length === 0 && !loading ? (
        <div className="empty-state"><p>No ticket data yet — click Refresh to try again.</p></div>
      ) : (
        teamsData.map(({ team, members, totalOpen, totalBreached }) => (
          <div key={team} className="card full" style={{ padding: 0, overflow: "hidden" }}>
            <div
              style={{
                background: "#4472C4", color: "#fff", padding: "10px 16px",
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}
            >
              <h3 style={{ margin: 0, color: "#fff" }}>{team}</h3>
              <button className="btn-sm" onClick={() => exportTeamCsv(team, members, totalOpen, totalBreached)}>
                📥 Export
              </button>
            </div>
            <div className="table-wrap">
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#D9E2F3" }}>
                    <th style={thStyle}>Name</th>
                    <th style={{ ...thStyle, textAlign: "center" }}>Open Tickets</th>
                    <th style={{ ...thStyle, textAlign: "center" }}>SLA Breached Tickets</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr key={m.name}>
                      <td style={tdStyle}>{m.name}</td>
                      <td style={{ ...tdStyle, textAlign: "center", color: m.open > 0 ? "#8B0000" : "inherit" }}>{m.open}</td>
                      <td style={{ ...tdStyle, textAlign: "center", color: m.breached > 0 ? "#8B0000" : "inherit" }}>{m.breached}</td>
                    </tr>
                  ))}
                  <tr style={{ background: "#D9E2F3", fontWeight: 700 }}>
                    <td style={tdStyle}>Total</td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>{totalOpen}</td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>{totalBreached}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}

      {unmatched.length > 0 && (
        <div className="card full" style={{ padding: 0, overflow: "hidden", borderColor: "var(--amber, #d97706)" }}>
          <div style={{ background: "var(--amber, #d97706)", color: "#fff", padding: "10px 16px" }}>
            <h3 style={{ margin: 0, color: "#fff" }}>
              ⚠️ Not in any team roster ({unmatchedTotal} open ticket{unmatchedTotal !== 1 ? "s" : ""})
            </h3>
            <div style={{ fontSize: 12, marginTop: 2 }}>
              These assignees aren't listed in ticketTeams.js — their tickets are excluded from the totals above. Add them to a roster to include them.
            </div>
          </div>
          <div className="table-wrap">
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#fef3c7" }}>
                  <th style={thStyle}>Assignee</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>Open Tickets</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>SLA Breached Tickets</th>
                </tr>
              </thead>
              <tbody>
                {unmatched.map((m) => (
                  <tr key={m.name}>
                    <td style={tdStyle}>{m.name}</td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>{m.open}</td>
                    <td style={{ ...tdStyle, textAlign: "center", color: m.breached > 0 ? "#8B0000" : "inherit" }}>{m.breached}</td>
                  </tr>
                ))}
                <tr style={{ background: "#fef3c7", fontWeight: 700 }}>
                  <td style={tdStyle}>Total</td>
                  <td style={{ ...tdStyle, textAlign: "center" }}>{unmatchedTotal}</td>
                  <td style={{ ...tdStyle, textAlign: "center" }}>{unmatchedBreached}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

const thStyle = { textAlign: "left", padding: "8px 16px", borderBottom: "1px solid #b7c6e6", fontWeight: 700 };
const tdStyle = { padding: "6px 16px", borderBottom: "1px solid #e5e5e5" };
