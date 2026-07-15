import React, { useState, useMemo } from "react";

const DEFAULT_BACKEND = import.meta.env.VITE_BACKEND_URL || window.location.origin;

const STATUS_COLORS = {
  "To Do": "b-blue", "In Progress": "b-amber", "Done": "b-green",
  "Resolved": "b-green", "Closed": "b-green", "Open": "b-blue",
};
const PRIORITY_COLORS = {
  "Highest": "b-red", "High": "b-red", "Medium": "b-amber",
  "Low": "b-green", "Lowest": "b-green",
};

function badge(val, map, fallback = "b-blue") {
  return <span className={`badge ${map[val] || fallback}`}>{val || "—"}</span>;
}

export function NeutaraTickets({ beToken }) {
  const [rows,    setRows]    = useState([]);
  const [total,   setTotal]   = useState(0);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [loaded,  setLoaded]  = useState(false);

  const [search,   setSearch]   = useState("");
  const [status,   setStatus]   = useState("All");
  const [priority, setPriority] = useState("All");
  const [assignee, setAssignee] = useState("All");

  async function fetchTickets() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${DEFAULT_BACKEND}/api/neutara/live-issues?max=500`, {
        headers: { Authorization: `Bearer ${beToken}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setRows(data.rows || []);
      setTotal(data.total || data.rows?.length || 0);
      setLoaded(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const statuses   = useMemo(() => ["All", ...new Set(rows.map(r => r.status).filter(Boolean))], [rows]);
  const priorities = useMemo(() => ["All", ...new Set(rows.map(r => r.priority).filter(Boolean))], [rows]);
  const assignees  = useMemo(() => ["All", ...new Set(rows.map(r => r.assignee).filter(Boolean))], [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (status   !== "All" && r.status   !== status)   return false;
      if (priority !== "All" && r.priority !== priority) return false;
      if (assignee !== "All" && r.assignee !== assignee) return false;
      if (q && !`${r.key} ${r.summary} ${r.assignee}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, search, status, priority, assignee]);

  // Summary stats
  const openCount     = rows.filter(r => !["Done","Resolved","Closed"].includes(r.status)).length;
  const resolvedCount = rows.filter(r =>  ["Done","Resolved","Closed"].includes(r.status)).length;
  const breachedCount = rows.filter(r => r.slaBreached === "Yes").length;

  if (!loaded) {
    return (
      <div className="card full" style={{ textAlign: "center", padding: "48px 24px" }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>🎫</div>
        <h3 style={{ marginBottom: 8 }}>Neutara Ticketing</h3>
        <p style={{ color: "var(--muted)", marginBottom: 24 }}>
          Load all live tickets from neutaraticketing.cftools.live
        </p>
        {error && <div className="jc-error" style={{ marginBottom: 16 }}>⚠️ {error}</div>}
        <button className="btn-primary" onClick={fetchTickets} disabled={loading}>
          {loading ? "Loading tickets…" : "Load Tickets from Neutara"}
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Stats bar */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {[
          { label: "Total",    value: total,         color: "var(--accent)" },
          { label: "Open",     value: openCount,     color: "#f59e0b" },
          { label: "Resolved", value: resolvedCount, color: "#22c55e" },
          { label: "SLA Breached", value: breachedCount, color: "#ef4444" },
        ].map(s => (
          <div key={s.label} className="card" style={{ flex: "1 1 120px", padding: "12px 16px", minWidth: 110 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="card full" style={{ padding: "12px 16px" }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input className="jc-input" style={{ flex: "1 1 200px", maxWidth: 280 }}
            placeholder="Search key, summary, assignee…"
            value={search} onChange={e => setSearch(e.target.value)} />
          <select className="jc-input" style={{ flex: "0 0 140px" }} value={status} onChange={e => setStatus(e.target.value)}>
            {statuses.map(s => <option key={s}>{s}</option>)}
          </select>
          <select className="jc-input" style={{ flex: "0 0 140px" }} value={priority} onChange={e => setPriority(e.target.value)}>
            {priorities.map(p => <option key={p}>{p}</option>)}
          </select>
          <select className="jc-input" style={{ flex: "0 0 180px" }} value={assignee} onChange={e => setAssignee(e.target.value)}>
            {assignees.map(a => <option key={a}>{a}</option>)}
          </select>
          <span className="topbar-stat">{filtered.length} / {rows.length} tickets</span>
          <button className="btn-secondary" style={{ marginLeft: "auto" }} onClick={fetchTickets} disabled={loading}>
            {loading ? "Refreshing…" : "↻ Refresh"}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="card full">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Key</th>
                <th>Summary</th>
                <th>Assignee</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Type</th>
                <th>SLA</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: "center", color: "var(--muted)", padding: 32 }}>No tickets match the current filters</td></tr>
              ) : filtered.map(r => (
                <tr key={r.key}>
                  <td><a href={`${import.meta.env.VITE_NEUTARA_URL || "https://neutaraticketing.cftools.live"}/browse/${r.key}`}
                    target="_blank" rel="noreferrer" style={{ color: "var(--accent)", fontWeight: 600 }}>{r.key}</a></td>
                  <td style={{ maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.summary}>{r.summary}</td>
                  <td>{r.assignee}</td>
                  <td>{badge(r.status, STATUS_COLORS)}</td>
                  <td>{badge(r.priority, PRIORITY_COLORS)}</td>
                  <td>{r.issueType}</td>
                  <td>{r.slaBreached === "Yes"
                    ? <span className="badge b-red">Breached</span>
                    : <span className="badge b-green">OK</span>}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
