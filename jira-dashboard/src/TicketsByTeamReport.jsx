import React, { useEffect, useMemo, useState } from "react";
import { TICKET_TEAMS } from "./ticketTeams.js";
import { isResolved } from "./utils.js";
import { fetchLiveIssues } from "./jiraApi.js";

const DEFAULT_JQL = "project in (CFITS, PRI, L2B) ORDER BY updated DESC";

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

function exportCombinedCsv(teamsData) {
  const rows = [];
  for (const { team, members, totalOpen, totalBreached } of teamsData) {
    for (const m of members) rows.push([team, m.name, m.open, m.breached]);
    rows.push([team, "Total", totalOpen, totalBreached]);
  }
  downloadCsv("team-tickets-report.csv", ["Team", "Name", "Open Tickets", "SLA Breached Tickets"], rows);
}

// Automatically loads live tickets from Jira and tallies each rostered person's
// currently-open tickets and how many are SLA-breached, grouped by team.
export function TicketsByTeamReport({ backendUrl, beToken }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastLoaded, setLastLoaded] = useState(null);

  const canAutoLoad = !!(backendUrl && beToken);

  async function loadFromJira() {
    if (!canAutoLoad) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchLiveIssues(backendUrl, beToken, DEFAULT_JQL);
      setRows(result.rows || []);
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

  const teamsData = useMemo(() => {
    return Object.entries(TICKET_TEAMS).map(([team, members]) => {
      const memberRows = members.map((name) => {
        const nameLower = name.toLowerCase().trim();
        const personTickets = rows.filter((r) => (r.assignee || "").toLowerCase().trim() === nameLower);
        const openTickets = personTickets.filter((r) => !isResolved(r));
        const breached = openTickets.filter((r) => r.slaBreached === "Yes");
        return { name, open: openTickets.length, breached: breached.length };
      });
      const totalOpen = memberRows.reduce((s, m) => s + m.open, 0);
      const totalBreached = memberRows.reduce((s, m) => s + m.breached, 0);
      return { team, members: memberRows, totalOpen, totalBreached };
    });
  }, [rows]);

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
          <button className="btn-sm" onClick={() => exportCombinedCsv(teamsData)} disabled={rows.length === 0}>
            📥 Download Full Report
          </button>
        </div>
      </div>

      {error && <div className="jc-error">⚠️ {error}</div>}

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
    </div>
  );
}

const thStyle = { textAlign: "left", padding: "8px 16px", borderBottom: "1px solid #b7c6e6", fontWeight: 700 };
const tdStyle = { padding: "6px 16px", borderBottom: "1px solid #e5e5e5" };
