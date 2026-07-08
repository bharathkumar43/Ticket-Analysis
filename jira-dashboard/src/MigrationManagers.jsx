import React, { useMemo, useState } from "react";
import { PieChartCard, BarChartCard } from "./components/Charts.jsx";
import { getManagers } from "./migrationManagersData.js";

const PAGE_SIZE = 7;
const PROJECT_STATUSES = ["On Track", "At Risk", "Delayed", "Completed"];

function formatDate(d) {
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) +
    " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function healthBadgeClass(label) {
  if (label === "Good") return "b-green";
  if (label === "Fair") return "b-amber";
  return "b-red";
}

function timeAgoLabel(d, referenceDate) {
  const diffMs = referenceDate.getTime() - d.getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export function MigrationManagers({ segment }) {
  const allManagers = useMemo(() => getManagers(segment), [segment]);
  const [search, setSearch] = useState("");
  const [accountManagerFilter, setAccountManagerFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [tierFilter, setTierFilter] = useState("All");
  const [page, setPage] = useState(1);

  const accountManagers = useMemo(() => [...new Set(allManagers.map((m) => m.accountManager))].sort(), [allManagers]);

  const filtered = allManagers.filter((m) => {
    const q = search.trim().toLowerCase();
    const matchesSearch = !q || m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q);
    const matchesAM = accountManagerFilter === "All" || m.accountManager === accountManagerFilter;
    const matchesTier = tierFilter === "All" || m.tier === tierFilter;
    const matchesStatus =
      statusFilter === "All" ||
      (statusFilter === "On Track" && m.onTrack > 0) ||
      (statusFilter === "At Risk" && m.atRisk > 0) ||
      (statusFilter === "Delayed" && m.delayed > 0) ||
      (statusFilter === "Completed" && m.completed > 0);
    return matchesSearch && matchesAM && matchesTier && matchesStatus;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const totalManagers = allManagers.length;
  const totalProjects = allManagers.reduce((s, m) => s + m.activeProjects, 0);
  const onTrack = allManagers.reduce((s, m) => s + m.onTrack, 0);
  const atRisk = allManagers.reduce((s, m) => s + m.atRisk, 0);
  const delayed = allManagers.reduce((s, m) => s + m.delayed, 0);
  const completed = allManagers.reduce((s, m) => s + m.completed, 0);
  const pct = (n) => totalProjects ? `${((n / totalProjects) * 100).toFixed(1)}% of total` : "";

  const referenceDate = useMemo(() => new Date(Math.max(...allManagers.map((m) => m.lastUpdated.getTime()))), [allManagers]);

  const statusDonut = [
    { name: "On Track", value: onTrack },
    { name: "At Risk", value: atRisk },
    { name: "Delayed", value: delayed },
    { name: "Completed", value: completed },
  ];

  const tierDonut = ["Tier 1", "Tier 2", "Tier 3"].map((t) => ({
    name: t, value: allManagers.filter((m) => m.tier === t).length,
  }));

  const workloadBar = [...allManagers].sort((a, b) => b.activeProjects - a.activeProjects).slice(0, 8)
    .map((m) => ({ name: m.name, value: m.activeProjects }));

  const topPerformers = [...allManagers].sort((a, b) => b.healthScore - a.healthScore).slice(0, 3);

  const avgHealth = Math.round(allManagers.reduce((s, m) => s + m.healthScore, 0) / (allManagers.length || 1));

  const alerts = useMemo(() => {
    const list = [];
    for (const m of allManagers) {
      if (m.delayed > 0) list.push({ key: m.id + "-delayed", color: "var(--red)", text: `${m.delayed} project${m.delayed !== 1 ? "s" : ""} delayed for ${m.name}`, when: m.lastUpdated });
      if (m.atRisk >= 2) list.push({ key: m.id + "-risk", color: "var(--amber)", text: `${m.atRisk} projects at risk for ${m.name}`, when: m.lastUpdated });
    }
    return list.sort((a, b) => b.when.getTime() - a.when.getTime()).slice(0, 5);
  }, [allManagers]);

  function clearFilters() {
    setSearch(""); setAccountManagerFilter("All"); setStatusFilter("All"); setTierFilter("All"); setPage(1);
  }

  function exportCsv() {
    const headers = ["Manager", "Email", "Account Manager", "Tier", "Active Projects", "On Track", "At Risk", "Delayed", "Completed", "Health Score"];
    const rows = filtered.map((m) => [m.name, m.email, m.accountManager, m.tier, m.activeProjects, m.onTrack, m.atRisk, m.delayed, m.completed, m.healthScore]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${segment.toLowerCase()}-migration-managers.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mm-wrap">
      <p className="mm-sample-tag">🧪 Sample data — no real manager/project source is connected yet.</p>

      <div className="mm-layout">
        <div className="mm-main">
          <div className="ai-kpis" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
            <div className="ai-kpi">
              <div className="ai-kpi-icon ai-icon-blue">👥</div>
              <div><div className="ai-kpi-value">{totalManagers}</div><div className="ai-kpi-label">Total Managers</div></div>
            </div>
            <div className="ai-kpi">
              <div className="ai-kpi-icon ai-icon-indigo">📁</div>
              <div><div className="ai-kpi-value">{totalProjects}</div><div className="ai-kpi-label">Active Projects</div></div>
            </div>
            <div className="ai-kpi">
              <div className="ai-kpi-icon ai-icon-green">✅</div>
              <div><div className="ai-kpi-value">{onTrack}</div><div className="ai-kpi-label">On Track</div><div className="mm-kpi-sub">{pct(onTrack)}</div></div>
            </div>
            <div className="ai-kpi">
              <div className="ai-kpi-icon ai-icon-amber">⚠️</div>
              <div><div className="ai-kpi-value">{atRisk}</div><div className="ai-kpi-label">At Risk</div><div className="mm-kpi-sub">{pct(atRisk)}</div></div>
            </div>
            <div className="ai-kpi">
              <div className="ai-kpi-icon ai-icon-red">⏰</div>
              <div><div className="ai-kpi-value">{delayed}</div><div className="ai-kpi-label">Delayed</div><div className="mm-kpi-sub">{pct(delayed)}</div></div>
            </div>
            <div className="ai-kpi">
              <div className="ai-kpi-icon ai-icon-indigo">🏆</div>
              <div><div className="ai-kpi-value">{completed}</div><div className="ai-kpi-label">Completed</div></div>
            </div>
          </div>

          <div className="ai-filterbar">
            <div className="to-filter-group" style={{ flex: "2 1 200px" }}>
              <label>Search Manager</label>
              <input placeholder="Search by name or email…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
            </div>
            <div className="to-filter-group">
              <label>Account Manager</label>
              <select value={accountManagerFilter} onChange={(e) => { setAccountManagerFilter(e.target.value); setPage(1); }}>
                <option>All</option>{accountManagers.map((a) => <option key={a}>{a}</option>)}
              </select>
            </div>
            <div className="to-filter-group">
              <label>Project Status</label>
              <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
                <option>All</option>{PROJECT_STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="to-filter-group">
              <label>Manager Tier</label>
              <select value={tierFilter} onChange={(e) => { setTierFilter(e.target.value); setPage(1); }}>
                <option>All</option>{["Tier 1", "Tier 2", "Tier 3"].map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <button className="btn-sm" onClick={clearFilters}>↺ Clear Filters</button>
            <button className="btn-sm" onClick={exportCsv} style={{ marginLeft: "auto" }}>📥 Export</button>
          </div>

          <div className="card full">
            <div className="breached-header">
              <h3>{segment === "ENT" ? "Enterprise (ENT)" : "SMB"} Migration Managers <span className="mm-count-badge">{allManagers.length} Managers</span></h3>
            </div>
            {filtered.length === 0 ? (
              <div className="empty-state">
                <div className="es-icon">🔍</div>
                <h3>No managers match these filters</h3>
                <p>Try clearing filters.</p>
              </div>
            ) : (
              <>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Manager</th><th>Account Manager</th><th>Tier</th><th>Active Projects</th>
                        <th>On Track</th><th>At Risk</th><th>Delayed</th><th>Completed</th>
                        <th>Health Score</th><th>Last Updated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageItems.map((m) => (
                        <tr key={m.id}>
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span className="mc-avatar" style={{ width: 28, height: 28, fontSize: 11 }}>{m.initials}</span>
                              <div>
                                <div style={{ fontWeight: 600 }}>{m.name}</div>
                                <div style={{ fontSize: 11, color: "var(--muted)" }}>{m.email}</div>
                              </div>
                            </div>
                          </td>
                          <td>{m.accountManager}</td>
                          <td><span className="badge b-blue">{m.tier}</span></td>
                          <td>{m.activeProjects}</td>
                          <td style={{ color: "var(--green)", fontWeight: 600 }}>{m.onTrack}</td>
                          <td style={{ color: "var(--amber)", fontWeight: 600 }}>{m.atRisk}</td>
                          <td style={{ color: "var(--red)", fontWeight: 600 }}>{m.delayed}</td>
                          <td style={{ color: "var(--brand)", fontWeight: 600 }}>{m.completed}</td>
                          <td>
                            <span style={{ fontWeight: 700, marginRight: 6 }}>{m.healthScore}</span>
                            <span className={"badge " + healthBadgeClass(m.healthLabel)}>{m.healthLabel}</span>
                          </td>
                          <td style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>{formatDate(m.lastUpdated)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="ai-pagination">
                  <span>Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="btn-sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>← Prev</button>
                    <button className="btn-sm" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>Next →</button>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="grid" style={{ marginTop: 18 }}>
            <div className="card"><h3>Manager Workload Distribution</h3><BarChartCard data={workloadBar} horizontal height={280} /></div>
            <div className="card"><h3>Tier Distribution</h3><PieChartCard data={tierDonut} height={280} /></div>
          </div>
        </div>

        <aside className="ai-side">
          <div className="card">
            <h3 style={{ marginBottom: 4 }}>Projects by Status ({segment})</h3>
            <PieChartCard data={statusDonut} height={230} />
          </div>

          <div className="card">
            <h3 style={{ marginBottom: 12 }}>🏆 Top Performers</h3>
            <div className="ai-reminder-list">
              {topPerformers.map((m, i) => (
                <div key={m.id} className="ai-reminder ai-reminder-low" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{["🥇", "🥈", "🥉"][i]} {m.name}</span>
                  <span className="badge b-green">{m.healthScore}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginBottom: 12 }}>Recent Alerts</h3>
            {alerts.length === 0 ? (
              <p style={{ color: "var(--muted)", fontSize: 13 }}>No alerts.</p>
            ) : (
              <div className="ai-reminder-list">
                {alerts.map((a) => (
                  <div key={a.key} className="ai-reminder" style={{ borderLeftColor: a.color }}>
                    <div style={{ fontSize: 13 }}>{a.text}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{timeAgoLabel(a.when, referenceDate)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <h3 style={{ marginBottom: 4 }}>Health Score Overview</h3>
            <div style={{ fontSize: 32, fontWeight: 700, color: "var(--heading-blue)" }}>{avgHealth}</div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>Average across all {segment} managers</div>
          </div>
        </aside>
      </div>
    </div>
  );
}
