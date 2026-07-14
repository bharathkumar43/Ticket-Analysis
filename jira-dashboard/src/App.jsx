import React, { useEffect, useMemo, useState } from "react";
import { BarChartCard, PieChartCard } from "./components/Charts.jsx";
import { ExcelImport } from "./ExcelImport.jsx";
import { JiraConnect } from "./JiraConnect.jsx";
import { Login } from "./Login.jsx";
import { TicketHistory } from "./TicketHistory.jsx";
import { ActionItems } from "./ActionItems.jsx";
import { MigrationManagers } from "./MigrationManagers.jsx";
import { EmailSettings } from "./EmailSettings.jsx";
import { MonthlyDataStore } from "./MonthlyDataStore.jsx";
import { NeutaraTickets } from "./NeutaraTickets.jsx";
import { generateDemoData } from "./demoData.js";
import { makeLocalActionItemsStore } from "./actionItemsStore.js";
import { makeBackendActionItemsStore } from "./actionItemsApi.js";
import { loadSession, clearSession } from "./jiraApi.js";
import { TEAMS, TEAM_NAMES, teamOf } from "./teams.js";
import { PROJECT_ESCALATIONS, projectTeam } from "./projectEscalations.js";
import { MEMBER_PERFORMANCE, teamAvgInProgress, memberPerf } from "./memberPerformance.js";
import {
  PRIORITY_ORDER, SLA_THRESHOLDS,
  count, countByPriority, countByType, topMigrationPaths, topAssignees,
  assigneeList, avgResolutionDays, ageing, priorityByBucket,
  pct, num, days, isResolved,
} from "./utils.js";

const ANALYTICS_TABS = ["Tickets Resolved", "Assignee with SLA", "Ticket Ageing", "Engineer Patterns"];
const MANAGER_SEGMENT_TABS = ["ENT", "SMB"];

// Sections that are real, working pages in this app.
const REAL_SECTIONS = new Set(["MBR Analytics", "Action Items", "Migration Managers", "History"]);

const NAV_GROUPS = [
  { label: "Analytics", items: [
    { name: "MBR Analytics",      icon: "🎫" },
    { name: "Migration Managers", icon: "🧭" },
  ]},
  { label: "Actions", items: [
    { name: "Action Items", icon: "📋" },
    { name: "History",      icon: "🗂️" },
  ]},
];

const TAB_ICONS = {
  "Tickets Resolved":  "✅",
  "Assignee with SLA": "🎯",
  "Ticket Ageing":     "⏳",
  "Engineer Patterns": "🧑‍💻",
};

const JIRA_BASE_URL = (import.meta.env.VITE_JIRA_BASE_URL || "").replace(/\/$/, "");

function countOverdue(items) {
  const today = new Date().toISOString().slice(0, 10);
  return items.filter((it) => it.status !== "Resolved" && it.dueDate && it.dueDate < today).length;
}

function ManagersRawTable({ rows, columns }) {
  const [search, setSearch] = useState("");
  const filtered = search
    ? rows.filter((r) => columns.some((c) => String(r[c] ?? "").toLowerCase().includes(search.toLowerCase())))
    : rows;
  return (
    <div className="card full">
      <div style={{ display: "flex", gap: 12, marginBottom: 14, alignItems: "center" }}>
        <input className="jc-input" style={{ maxWidth: 280 }} placeholder="Search uploaded data…"
          value={search} onChange={(e) => setSearch(e.target.value)} />
        <span className="topbar-stat">{filtered.length} of {rows.length} rows</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
          <tbody>
            {filtered.map((row, i) => (
              <tr key={i}>{columns.map((c) => <td key={c}>{String(row[c] ?? "")}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HistoryPage({ items }) {
  const [tab, setTab] = useState("MBR");
  const resolved = items.filter((it) => it.status === "Resolved");
  const mbrCount  = resolved.filter((it) => it.meetingType === "MBR").length;
  const ldCount   = resolved.filter((it) => it.meetingType === "Leadership").length;
  const filtered  = resolved.filter((it) => it.meetingType === tab);

  function priorityBadge(p) {
    if (p === "High") return "b-red";
    if (p === "Low")  return "b-green";
    return "b-amber";
  }

  return (
    <>
      <div className="ai-header-row" style={{ marginBottom: 20 }}>
        <div>
          <h2 className="ai-title">History</h2>
          <p className="ai-subtitle">{resolved.length} resolved action item{resolved.length !== 1 ? "s" : ""} across all meetings</p>
        </div>
      </div>

      <div className="mm-segment" style={{ marginBottom: 24 }}>
        <button className={"mm-segment-btn" + (tab === "MBR" ? " active" : "")} onClick={() => setTab("MBR")}>
          📋 MBR {mbrCount > 0 && <span className="mm-count-badge">{mbrCount}</span>}
        </button>
        <button className={"mm-segment-btn" + (tab === "Leadership" ? " active" : "")} onClick={() => setTab("Leadership")}>
          👥 Leadership {ldCount > 0 && <span className="mm-count-badge">{ldCount}</span>}
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state" style={{ marginTop: 24 }}>
          <div className="es-icon">📋</div>
          <h3>No resolved {tab} items yet</h3>
          <p>Action items from {tab} meetings marked as Resolved will appear here.</p>
        </div>
      ) : (
        <div className="card full">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Title</th>
                  <th>Owner</th>
                  <th>Priority</th>
                  <th>Due Date</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((it) => (
                  <tr key={it.id}>
                    <td><span className="ai-id">{"AI-" + it.seq}</span></td>
                    <td className="wrap">{it.title}</td>
                    <td>{it.owner || "—"}</td>
                    <td><span className={"badge " + priorityBadge(it.priority)}>{it.priority}</span></td>
                    <td>{it.dueDate || "—"}</td>
                    <td className="wrap" style={{ color: "var(--muted)", fontSize: 13 }}>{it.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

function parseJwt(token) {
  try { return JSON.parse(atob(token.split(".")[1])); } catch { return null; }
}

function ComingSoon({ title, icon }) {
  return (
    <div className="empty-state" style={{ marginTop: 24 }}>
      <div className="es-icon">{icon || "🚧"}</div>
      <h3>{title}</h3>
      <p>This section isn't built yet — it's a placeholder in the navigation for now.</p>
    </div>
  );
}

function NotificationsPage({ items }) {
  const today = new Date().toISOString().slice(0, 10);
  const overdue = items
    .filter((it) => it.status !== "Resolved" && it.dueDate && it.dueDate < today)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  if (!overdue.length) {
    return (
      <div className="empty-state" style={{ marginTop: 24 }}>
        <div className="es-icon">🔔</div>
        <h3>No notifications</h3>
        <p>You're all caught up — no overdue action items right now.</p>
      </div>
    );
  }

  return (
    <div className="card full">
      <h3>🔔 Overdue Action Items ({overdue.length})</h3>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Action Item</th><th>Meeting</th><th>Owner</th><th>Due Date</th></tr></thead>
          <tbody>
            {overdue.map((it) => (
              <tr key={it.id}>
                <td className="wrap">{it.title}</td>
                <td><span className="badge b-blue">{it.meetingType}</span></td>
                <td>{it.owner || "—"}</td>
                <td><span className="badge b-red">{it.dueDate}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function App() {
  const [fileData,    setFileData]    = useState(() => generateDemoData());
  const [section,     setSection]     = useState("MBR Analytics");
  const [managersFileData, setManagersFileData] = useState(null); // { rows, columns, fileName }
  const [showMbrArchive,   setShowMbrArchive]   = useState(false);
  const [showMgrArchive,   setShowMgrArchive]   = useState(false);
  const [showNeutara,      setShowNeutara]      = useState(false);
  const [subTab,      setSubTab]      = useState(ANALYTICS_TABS[0]);
  const [managerTab,  setManagerTab]  = useState(MANAGER_SEGMENT_TABS[0]);
  const [jiraCtx,     setJiraCtx]     = useState(() => {                // { backendUrl, beToken, jiraCreds } | null
    const s = loadSession();
    if (!s) return null;
    return { backendUrl: s.backendUrl, beToken: s.beToken, jiraCreds: { email: s.jiraEmail, apiToken: s.jiraApiToken, baseUrl: s.jiraBaseUrl } };
  });
  const [historyKey,  setHistoryKey]  = useState(null);
  const [landingMode, setLandingMode] = useState("choose"); // "choose" | "excel" | "jira"
  const [itemsVersion, setItemsVersion] = useState(0);
  const [actionItemsSnapshot, setActionItemsSnapshot] = useState([]);

  const backendConnected = !!(jiraCtx?.backendUrl && jiraCtx?.beToken);
  const jwtPayload  = jiraCtx?.beToken ? parseJwt(jiraCtx.beToken) : null;
  const currentUser = jwtPayload?.userId || "";
  const displayName = currentUser.includes("@") ? currentUser.split("@")[0] : currentUser;
  const userInitials = displayName ? displayName.slice(0, 2).toUpperCase() : "MO";

  useEffect(() => {
    let cancelled = false;
    const store = backendConnected ? makeBackendActionItemsStore(jiraCtx.backendUrl, jiraCtx.beToken) : makeLocalActionItemsStore();
    store.list().then((list) => { if (!cancelled) setActionItemsSnapshot(list); }).catch(() => { if (!cancelled) setActionItemsSnapshot([]); });
    return () => { cancelled = true; };
  }, [backendConnected, jiraCtx?.backendUrl, jiraCtx?.beToken, itemsVersion]);

  function handleLoad(result) {
    if (result.jiraToken) {
      setJiraCtx({ backendUrl: result.jiraBackendUrl, beToken: result.jiraToken, jiraCreds: result.jiraCreds || null });
    }
    setFileData(result);
    setSection("MBR Analytics");
    setSubTab(ANALYTICS_TABS[0]);
    setLandingMode("choose");
  }

  async function handleManagersFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    try {
      const data = await file.arrayBuffer();
      const XLSX = await import("xlsx");
      const wb = XLSX.read(data, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
      const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
      setManagersFileData({ rows, columns, fileName: file.name });
    } catch (err) {
      console.error("Failed to read managers excel:", err);
    }
  }

  function selectSection(name) {
    setSection(name);
    if (name === "MBR Analytics") setSubTab(ANALYTICS_TABS[0]);
  }

  function openHistory(key) {
    setHistoryKey((prev) => (prev === key ? null : key));
  }

  /* ── Login gate ─────────────────────────────────────────────────────── */
  if (!jiraCtx) {
    return <Login onLoggedIn={setJiraCtx} />;
  }

  /* ── Upload / connect overlays ─────────────────────────────────────── */
  if (landingMode === "excel") {
    return (
      <div style={{ position: "relative" }}>
        <button className="btn-sm" style={{ position: "fixed", top: 16, left: 16, zIndex: 10 }}
          onClick={() => setLandingMode("choose")}>← Back</button>
        <ExcelImport onLoad={handleLoad} />
      </div>
    );
  }
  if (landingMode === "jira") {
    return (
      <div className="import-wrap" style={{ position: "relative" }}>
        <button className="btn-sm" style={{ position: "fixed", top: 16, left: 16, zIndex: 10 }}
          onClick={() => setLandingMode("choose")}>← Back</button>
        <JiraConnect onLoad={handleLoad} />
      </div>
    );
  }

  /* ── Landing screen (only reached if there's somehow no data at all) ── */
  if (!fileData) {
    return (
      <div className="import-wrap">
        <div className="import-logo">🎫</div>
        <h2>Ticket Analytics Dashboard</h2>
        <p className="import-sub">How would you like to load ticket data?</p>
        <div className="landing-options">
          <div className="landing-card" onClick={() => setLandingMode("excel")}>
            <div className="lc-icon">📊</div>
            <div className="lc-title">Upload Excel</div>
            <div className="lc-desc">Drop an .xlsx / .csv file exported from Jira</div>
          </div>
          <div className="landing-card" onClick={() => setLandingMode("jira")}>
            <div className="lc-icon">🔗</div>
            <div className="lc-title">Connect to Jira</div>
            <div className="lc-desc">Fetch live tickets via the backend API · see full ticket history</div>
          </div>
        </div>
      </div>
    );
  }

  const { rows, warnings, isDemo } = fileData;
  const overdueCount = countOverdue(actionItemsSnapshot);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img src="/logo.jpg" alt="CloudFuze" className="sidebar-logo-img" />
          <span className="sidebar-brand-text-solo">MIGRATION OPS</span>
        </div>
        <nav className="sidebar-nav">
          {NAV_GROUPS.map((group) => (
            <div className="sidebar-group" key={group.label || "top"}>
              {group.label && <div className="sidebar-group-label">{group.label}</div>}
              {group.items.map((item) => (
                <button
                  key={item.name}
                  className={"sidebar-link" + (section === item.name ? " active" : "")}
                  onClick={() => selectSection(item.name)}
                >
                  <span className="sidebar-link-icon">{item.icon}</span>
                  <span>{item.name}</span>
                  {item.name === "Action Items" && overdueCount > 0 && (
                    <span className="sidebar-badge">{overdueCount}</span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <div className="shell-main">
        <header className="topbar">
          <div className="topbar-breadcrumb">
            <span>Home</span> <span className="tb-sep">›</span>{" "}
            <span className={section === "MBR Analytics" ? "" : "tb-current"}>{section}</span>
            {section === "MBR Analytics" && (
              <> <span className="tb-sep">›</span> <span className="tb-current">{subTab}</span></>
            )}
          </div>
          <div className="topbar-right">
            <span className="topbar-stat">{num(rows.length)} tickets{jiraCtx ? " · 🔗 Jira live" : ""}</span>
            {overdueCount > 0 && (
              <span className="topbar-bell" title={`${overdueCount} overdue action item(s)`}>
                🔔<span className="topbar-bell-dot">{overdueCount}</span>
              </span>
            )}
            {!isDemo && (
              <button className="btn-sm" onClick={() => { setFileData(generateDemoData()); setHistoryKey(null); }}>
                ↩ Reset data
              </button>
            )}
            <span className="topbar-profile" title={backendConnected ? `Signed in as ${currentUser}` : "Not signed in — using local/sample data"}>
              <span className="topbar-avatar">{userInitials}</span>
              {backendConnected ? (displayName || "Signed in") : "Guest"}
            </span>
            {backendConnected && (
              <button className="btn-sm" onClick={() => { clearSession(); setJiraCtx(null); setHistoryKey(null); sessionStorage.removeItem("skippedLogin"); setSkippedLogin(false); }}>
                ⏻ Log out
              </button>
            )}
          </div>
        </header>

        <div className="shell-content">
          {section === "MBR Analytics" && (
            <div className="file-bar" style={{ background: isDemo ? "#fffbeb" : "var(--panel2)", borderColor: isDemo ? "var(--amber)" : "var(--border)" }}>
              {isDemo
                ? <span>🧪 <strong>Viewing sample data</strong> — upload your own ticket export or connect to Jira to see real numbers.</span>
                : <span>📊 <strong>{fileData?.fileName || "Uploaded data"}</strong> — {num(rows.length)} tickets loaded</span>
              }
              {isDemo && <button className="btn-sm" onClick={() => setLandingMode("excel")}>📊 Upload Excel</button>}
              {isDemo && <button className="btn-sm" onClick={() => setLandingMode("jira")}>🔗 Connect to Jira</button>}
              <button className="btn-sm" style={{ marginLeft: "auto" }} onClick={() => setShowMbrArchive((v) => !v)}>
                📁 {showMbrArchive ? "Hide Archive" : "Monthly Archive"}
              </button>
            </div>
          )}

          {warnings && warnings.length > 0 && section === "MBR Analytics" && (
            <div className="warn-row" style={{ marginBottom: 14 }}>
              {warnings.map((w, i) => <span key={i} className="warn-chip">⚠️ {w}</span>)}
            </div>
          )}

          {section === "MBR Analytics" && showMbrArchive && (
            <MonthlyDataStore
              jiraCtx={jiraCtx}
              uploadType="MBR"
              currentRows={rows}
              currentFileName={fileData?.fileName}
              onLoadRows={(dbRows, fileName) => {
                setFileData({ rows: dbRows, fileName, warnings: [], isDemo: false });
                setShowMbrArchive(false);
              }}
            />
          )}

          {section === "MBR Analytics" && (
            <>
              <div className="tabs" style={{ marginTop: 0 }}>
                {ANALYTICS_TABS.map((t) => (
                  <button key={t} className={"tab" + (subTab === t ? " active" : "")} onClick={() => setSubTab(t)}>
                    {TAB_ICONS[t]} {t}
                  </button>
                ))}
              </div>
              {subTab === "Tickets Resolved" && <TicketsResolved rows={rows} jiraUrl={jiraCtx?.jiraCreds?.baseUrl || JIRA_BASE_URL} onHistory={jiraCtx ? openHistory : null} />}
              {subTab === "Assignee with SLA" && <AssigneeSLA rows={rows} jiraUrl={jiraCtx?.jiraCreds?.baseUrl || JIRA_BASE_URL} onHistory={jiraCtx ? openHistory : null} />}
              {subTab === "Ticket Ageing"       && <TicketAgeing rows={rows} jiraUrl={jiraCtx?.jiraCreds?.baseUrl || JIRA_BASE_URL} onHistory={jiraCtx ? openHistory : null} />}
              {subTab === "Engineer Patterns"   && <EngineerPatterns rows={rows} />}
            </>
          )}

          {section === "Action Items" && <ActionItems onChange={() => setItemsVersion((v) => v + 1)} jiraCtx={jiraCtx} />}
          {section === "Migration Managers" && (
            <>
              <div className="ai-header-row">
                <div>
                  <h2 className="ai-title" style={{ marginBottom: 2 }}>Migration Managers</h2>
                  <p className="ai-subtitle">
                    {managersFileData
                      ? <><strong>{managersFileData.fileName}</strong> — {managersFileData.rows.length} rows</>
                      : "Track and manage Enterprise (ENT) and SMB migration managers and their projects."}
                  </p>
                </div>
                <div className="ai-header-actions">
                  {managersFileData && (
                    <button className="btn-sm" onClick={() => setManagersFileData(null)}>✕ Clear upload</button>
                  )}
                  <label className="jc-btn" style={{ cursor: "pointer", fontSize: 13, padding: "7px 16px", display: "inline-flex", alignItems: "center", gap: 6 }}>
                    📊 Upload Excel
                    <input type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }}
                      onChange={handleManagersFileChange} />
                  </label>
                  <button className="btn-sm" onClick={() => setShowMgrArchive((v) => !v)}>
                    📁 {showMgrArchive ? "Hide Archive" : "Archive"}
                  </button>
                  <button
                    className={"btn-sm" + (showNeutara ? " active" : "")}
                    onClick={() => setShowNeutara((v) => !v)}
                    style={{ background: showNeutara ? "var(--accent)" : undefined, color: showNeutara ? "#fff" : undefined }}
                  >
                    🎫 {showNeutara ? "Hide Live Tickets" : "Live Tickets"}
                  </button>
                </div>
              </div>

              {showNeutara && (
                <NeutaraTickets beToken={jiraCtx?.beToken} />
              )}

              {showMgrArchive && (
                <MonthlyDataStore
                  jiraCtx={jiraCtx}
                  uploadType="MIGRATION"
                  currentRows={managersFileData?.rows}
                  currentFileName={managersFileData?.fileName}
                  onLoadRows={(dbRows, fileName) => {
                    setManagersFileData({
                      rows: dbRows,
                      columns: dbRows.length > 0 ? Object.keys(dbRows[0]) : [],
                      fileName,
                    });
                    setShowMgrArchive(false);
                  }}
                />
              )}

              {managersFileData ? (
                <ManagersRawTable rows={managersFileData.rows} columns={managersFileData.columns} />
              ) : (
                <>
                  <p className="mm-sample-tag">📋 Showing sample data — upload your own Excel to see real numbers.</p>
                  <div className="mm-segment">
                    {MANAGER_SEGMENT_TABS.map((t) => (
                      <button key={t} className={"mm-segment-btn" + (managerTab === t ? " active" : "")} onClick={() => setManagerTab(t)}>
                        {t === "ENT" ? "🏢" : "🏬"} {t}
                      </button>
                    ))}
                  </div>
                  <MigrationManagers segment={managerTab} />
                </>
              )}
            </>
          )}
          {section === "History" && <HistoryPage items={actionItemsSnapshot} />}
          {!REAL_SECTIONS.has(section) && (
            <ComingSoon title={section} icon={NAV_GROUPS.flatMap((g) => g.items).find((i) => i.name === section)?.icon} />
          )}
        </div>
      </div>

      {/* Ticket history drawer — rendered at top level, works across all tabs */}
      {historyKey && jiraCtx && (
        <TicketHistory
          ticketKey={historyKey}
          backendUrl={jiraCtx.backendUrl}
          token={jiraCtx.beToken}
          jiraCreds={jiraCtx.jiraCreds}
          onClose={() => setHistoryKey(null)}
        />
      )}
    </div>
  );
}

/* -------- Shared components -------- */
function Kpi({ icon, label, value, sub, onClick, active, clickable, bucketColor }) {
  const colorClass = bucketColor ? ` kpi-bucket-${bucketColor}` : " kpi-bucket-red";
  return (
    <div
      className={"kpi" + (clickable ? " kpi-clickable" + colorClass : "") + (active ? " kpi-active" : "")}
      onClick={onClick}
      title={clickable ? "Click to view tickets" : undefined}
    >
      <div className="label">{icon} {label}</div>
      <div className="value">{value}</div>
      <div className="sub">{sub}</div>
      {clickable && <div className="kpi-caret">{active ? "▲" : "▼"}</div>}
    </div>
  );
}

function Table({ title, head, rows }) {
  return (
    <div className="card">
      {title && <h3>{title}</h3>}
      <div className="table-wrap">
        <table>
          <thead><tr>{head.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

/* ===================================================================
   SHEET 1 — Tickets Resolved
   =================================================================== */
function TicketsResolved({ rows, jiraUrl, onHistory }) {
  const [kpiDrill, setKpiDrill] = useState(null); // { title, tickets }

  const resolvedRows   = rows.filter((r) => isResolved(r));
  const openRows       = rows.filter((r) => !isResolved(r));
  const breachedRows   = rows.filter((r) => r.slaBreached === "Yes");
  const bugRows        = rows.filter((r) => r.issueType === "Bug");
  const operRows       = rows.filter((r) => ["Task", "Sub-task", "Story"].includes(r.issueType));

  const total       = rows.length;
  const totalPerfTickets     = MEMBER_PERFORMANCE.reduce((s, p) => s + p.tickets, 0);
  const overallAvgInProgress = totalPerfTickets
    ? (MEMBER_PERFORMANCE.reduce((s, p) => s + p.avgInProgressHrs * p.tickets, 0) / totalPerfTickets).toFixed(2)
    : null;

  const typeData  = countByType(rows);
  const prioData  = countByPriority(rows);
  const paths     = topMigrationPaths(rows, 8);
  const assignees = topAssignees(rows, 10);

  const codeVsOps   = [{ name: "Code Fixes (Bugs)", value: bugRows.length }, { name: "Operational", value: operRows.length }];
  const assigneeBar = assignees.map((a) => ({ name: a.assignee, value: a.tickets }));

  function openDrill(title, tickets) {
    setKpiDrill((prev) => (prev?.title === title ? null : { title, tickets }));
  }

  return (
    <>
      <div className="kpis">
        <Kpi icon="📥" label="Total Received"    value={num(total)}             sub="All Tickets"                        clickable active={kpiDrill?.title === "Total Received"}    onClick={() => openDrill("Total Received",    rows)}        bucketColor="green" />
        <Kpi icon="✅" label="Resolved"          value={num(resolvedRows.length)} sub={pct(resolvedRows.length, total) + " Resolution Rate"} clickable active={kpiDrill?.title === "Resolved"}         onClick={() => openDrill("Resolved",         resolvedRows)} bucketColor="green" />
        <Kpi icon="⏳" label="Open / Pending"    value={num(openRows.length)}    sub="Not Yet Resolved"                  clickable active={kpiDrill?.title === "Open / Pending"}    onClick={() => openDrill("Open / Pending",    openRows)}    bucketColor="amber" />
        <Kpi icon="⚠️" label="SLA Breached"      value={num(breachedRows.length)} sub={pct(breachedRows.length, total) + " of Total"}       clickable active={kpiDrill?.title === "SLA Breached"}      onClick={() => openDrill("SLA Breached",      breachedRows)} bucketColor="red"   />
        <Kpi icon="🐛" label="Code Fixes (Bugs)" value={num(bugRows.length)}     sub={pct(bugRows.length, total) + " of Total"}              clickable active={kpiDrill?.title === "Code Fixes (Bugs)"} onClick={() => openDrill("Code Fixes (Bugs)", bugRows)}    bucketColor="red"   />
        <Kpi icon="⚙️" label="Operational"       value={num(operRows.length)}    sub="Tasks · Sub-tasks · Stories"       clickable active={kpiDrill?.title === "Operational"}       onClick={() => openDrill("Operational",       operRows)}    bucketColor="green" />
        <Kpi icon="⏱️" label="Avg In Progress"   value={overallAvgInProgress ? overallAvgInProgress + " hrs" : "—"}    sub="Weighted avg hrs in progress" />
        <Kpi icon="🔄" label="Reopened"          value="0"                       sub="Not tracked in source" />
      </div>

      {kpiDrill && (
        <SLADrillDown
          title={kpiDrill.title}
          tickets={kpiDrill.tickets}
          onClose={() => setKpiDrill(null)}
          jiraUrl={jiraUrl}
          onHistory={onHistory}
        />
      )}

      <div className="grid">
        <div className="card"><h3>Code Fixes vs Operational</h3><PieChartCard data={codeVsOps} /></div>
        <div className="card"><h3>Tickets by Priority</h3><BarChartCard data={prioData} color="#a78bfa" /></div>
      </div>

      <div className="grid" style={{ marginTop: 18 }}>
        <Table title="Ticket Type Breakdown" head={["Issue Type", "Count", "% Share"]}
          rows={[...typeData.map((t) => [t.name, num(t.value), pct(t.value, total)]), ["TOTAL", num(total), "100.0%"]]} />
        <Table title="Priority Distribution" head={["Priority", "Count", "% Share"]}
          rows={prioData.map((p) => [p.name, num(p.value), pct(p.value, total)])} />
      </div>

      <div className="grid" style={{ marginTop: 18 }}>
        <Table title="Top Migration Paths" head={["Migration Path", "Tickets", "% Share"]}
          rows={paths.map((p) => [p.name, num(p.value), pct(p.value, total)])} />
        <Table title="Top 10 Assignees" head={["Assignee", "Tickets", "SLA Breach %"]}
          rows={assignees.map((a) => [a.assignee, num(a.tickets), pct(a.breached, a.tickets)])} />
      </div>

      <div className="card full" style={{ marginTop: 18 }}>
        <h3>Top 10 Assignees by Volume</h3>
        <BarChartCard data={assigneeBar} horizontal height={400} />
      </div>

      {/* Team Performance — avg in progress per member and team */}
      <div className="card full" style={{ marginTop: 18 }}>
        <h3>📊 Team Performance — Avg In Progress (Hrs)</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Team</th><th>Member</th><th>Tickets</th><th>Resolved</th>
                <th>Avg Resolution (Hrs)</th><th>Avg In Progress (Hrs)</th>
              </tr>
            </thead>
            <tbody>
              {["Content Team", "Messaging", "Email"].map((team) => {
                const members = MEMBER_PERFORMANCE.filter((p) => p.team === team);
                const teamAvg = teamAvgInProgress(team);
                return [
                  ...members.map((p, i) => (
                    <tr key={team + p.name}>
                      {i === 0 && (
                        <td rowSpan={members.length + 1} style={{ fontWeight: 700, verticalAlign: "top", borderRight: "2px solid var(--border)", whiteSpace: "nowrap" }}>
                          {team}
                        </td>
                      )}
                      <td>{p.name}</td>
                      <td>{num(p.tickets)}</td>
                      <td>{num(p.resolved)}</td>
                      <td>{p.avgResHrs}</td>
                      <td style={{ fontWeight: 600 }}>{p.avgInProgressHrs}</td>
                    </tr>
                  )),
                  <tr key={team + "-avg"} style={{ background: "var(--surface)" }}>
                    <td colSpan={2} style={{ fontWeight: 700, color: "var(--muted)", fontSize: 12 }}>Team Avg</td>
                    <td colSpan={2} />
                    <td style={{ fontWeight: 700, color: "var(--accent)" }}>{teamAvg != null ? teamAvg.toFixed(2) + " hrs" : "—"}</td>
                  </tr>,
                ];
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

/* ===================================================================
   SHEET 2 — Assignee with SLA  (team-based, all numbers clickable)
   =================================================================== */

/* Shared drill-down panel used across the tab */
function TicketTable({ tickets, jiraUrl, onHistory }) {
  if (!tickets.length) return <p style={{ color: "var(--muted)", padding: "8px 0" }}>No tickets in this group.</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Key</th><th>Summary</th><th>Priority</th>
            <th>Assignee</th><th>Issue Type</th><th>Res. Days</th><th>SLA</th><th>Status</th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((r) => {
            return (
              <tr key={r.key}>
                <td><TicketLink ticketKey={r.key} jiraUrl={jiraUrl || JIRA_BASE_URL} onHistory={null} /></td>
                <td className="wrap">{r.summary}</td>
                <td>{r.priority}</td>
                <td>{r.assignee}</td>
                <td>{r.issueType}</td>
                <td>{r.resolutionDays != null ? days(r.resolutionDays) : "—"}</td>
                <td><span className={"badge " + (r.slaBreached === "Yes" ? "b-red" : "b-green")}>
                  {r.slaBreached === "Yes" ? "Breached" : "OK"}
                </span></td>
                <td><span className={"badge " + (isResolved(r) ? "b-green" : "b-amber")}>{r.status || "—"}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SLADrillDown({ title, tickets, onClose, jiraUrl, onHistory }) {
  const [activeSection, setActiveSection] = useState("retry");
  if (!tickets) return null;
  const retryTickets = tickets.filter((r) => /retry|conflict|stuck/i.test(r.summary || ""));
  const otherTickets = tickets.filter((r) => !/retry|conflict|stuck/i.test(r.summary || ""));
  const segregate = retryTickets.length > 0 && otherTickets.length > 0;
  return (
    <div className="card full sla-drill-panel" style={{ margin: "0 0 20px" }}>
      <div className="breached-header">
        <h3>{title} ({num(tickets.length)} tickets)</h3>
        <button className="btn-sm" onClick={onClose}>✕ Close</button>
      </div>
      {tickets.length === 0
        ? <p style={{ color: "var(--muted)", padding: "12px 0" }}>No tickets in this group.</p>
        : segregate
          ? (
            <>
              <div className="drill-section-tabs">
                <button
                  className={"drill-tab drill-tab-retry" + (activeSection === "retry" ? " drill-tab-active" : "")}
                  onClick={() => setActiveSection((p) => p === "retry" ? null : "retry")}>
                  🔁 Retry Tickets
                  <span className="drill-section-count">{retryTickets.length}</span>
                </button>
                <button
                  className={"drill-tab drill-tab-other" + (activeSection === "other" ? " drill-tab-active" : "")}
                  onClick={() => setActiveSection((p) => p === "other" ? null : "other")}>
                  📋 Other Tickets
                  <span className="drill-section-count">{otherTickets.length}</span>
                </button>
              </div>
              {activeSection === "retry" && <TicketTable tickets={retryTickets} jiraUrl={jiraUrl} onHistory={onHistory} />}
              {activeSection === "other" && <TicketTable tickets={otherTickets} jiraUrl={jiraUrl} onHistory={onHistory} />}
            </>
          )
          : <TicketTable tickets={tickets} jiraUrl={jiraUrl} onHistory={onHistory} />
      }
    </div>
  );
}

/* A number cell that looks like a link */
function ClickNum({ value, onClick, colorClass = "" }) {
  return (
    <span className={"click-num " + colorClass} onClick={onClick} title="Click to view tickets">
      {value}
    </span>
  );
}

function AssigneeSLA({ rows, jiraUrl, onHistory }) {
  const [team,           setTeam]           = useState("");
  const [applied,        setApplied]        = useState(null);
  const [kpiDrill,       setKpiDrill]       = useState(null);
  const [selectedMember, setSelectedMember] = useState(null);
  const [memberCardDrill,setMemberCardDrill]= useState(null);
  const [escalationsDrill, setEscalationsDrill] = useState(false);

  const allProjects = useMemo(() => {
    const s = new Set(rows.map((r) => r.project).filter(Boolean));
    return ["All", ...Array.from(s).sort()];
  }, [rows]);

  const [project, setProject] = useState("All");

  function handleApply() {
    if (!team) return;
    setApplied({ team, project });
    setKpiDrill(null);
    setSelectedMember(null);
    setMemberCardDrill(null);
    setEscalationsDrill(false);
  }

  function openKpiDrill(title, tickets) {
    setEscalationsDrill(false);
    setKpiDrill((prev) => (prev?.title === title ? null : { title, tickets }));
  }

  /* Filtered rows for the applied team */
  const teamRows = useMemo(() => {
    if (!applied) return [];
    const members = TEAMS[applied.team] || [];
    const memberSet = new Set(members.map((m) => m.toLowerCase()));
    return rows.filter((r) => {
      if (!memberSet.has((r.assignee || "").toLowerCase().trim())) return false;
      if (applied.project !== "All" && r.project !== applied.project) return false;
      return true;
    });
  }, [applied, rows]);

  /* Team-level totals */
  const tTotal    = teamRows.length;
  const tResolved = teamRows.filter((r) => isResolved(r));
  const tOpen     = teamRows.filter((r) => !isResolved(r));
  const tBreached = teamRows.filter((r) => r.slaBreached === "Yes");
  const tWithin   = teamRows.filter((r) => r.slaBreached !== "Yes");

  /* Charts use team rows */
  const prioData = useMemo(() => countByPriority(teamRows), [teamRows]);
  const typeData = useMemo(() => countByType(teamRows),     [teamRows]);
  const slaDonut = [
    { name: "Within SLA",  value: tWithin.length  },
    { name: "SLA Breached", value: tBreached.length },
  ];

  /* Team-level avg over SLA */
  const tOverDays = useMemo(() => {
    if (!tBreached.length) return null;
    const total = tBreached.reduce((sum, r) => {
      const th = SLA_THRESHOLDS[r.priority] || 5;
      return sum + Math.max(0, (r.resolutionDays || 0) - th);
    }, 0);
    return total / tBreached.length;
  }, [tBreached]);

  /* Escalations for the applied team */
  const teamEscalations = useMemo(() => {
    if (!applied) return [];
    return teamRows
      .filter((r) => r.slaBreached === "Yes")
      .sort((a, b) => {
        const oa = (a.resolutionDays || 0) - (SLA_THRESHOLDS[a.priority] || 5);
        const ob = (b.resolutionDays || 0) - (SLA_THRESHOLDS[b.priority] || 5);
        return ob - oa;
      });
  }, [applied, teamRows]);

  const teamProjectEscalations = useMemo(() =>
    applied ? PROJECT_ESCALATIONS.filter((e) => projectTeam(e.combination) === applied.team) : [],
    [applied]
  );

  /* Per-member stats */
  const memberStats = useMemo(() => {
    if (!applied) return [];
    return (TEAMS[applied.team] || []).map((m) => {
      const mRows    = teamRows.filter((r) => r.assignee.toLowerCase() === m.toLowerCase());
      const mRes     = mRows.filter((r) => isResolved(r));
      const mOpen    = mRows.filter((r) => !isResolved(r));
      const mBreach  = mRows.filter((r) => r.slaBreached === "Yes");
      const mWithin  = mRows.filter((r) => r.slaBreached !== "Yes");
      const rdArr    = mRows.filter((r) => r.resolutionDays != null).map((r) => r.resolutionDays);
      const mAvg     = rdArr.length ? (rdArr.reduce((a, b) => a + b, 0) / rdArr.length).toFixed(1) : "—";
      const mOverDays = mBreach.length
        ? mBreach.reduce((sum, r) => {
            const th = SLA_THRESHOLDS[r.priority] || 5;
            return sum + Math.max(0, (r.resolutionDays || 0) - th);
          }, 0) / mBreach.length
        : null;
      return { name: m, all: mRows, resolved: mRes, open: mOpen, breached: mBreach, within: mWithin, avg: mAvg, overDays: mOverDays };
    });
  }, [applied, teamRows]);

  return (
    <div className="team-overview">
      {/* ── Filter bar ── */}
      <div className="to-filterbar">
        <div className="to-filter-group">
          <label>Team:</label>
          <select value={team} onChange={(e) => setTeam(e.target.value)}>
            <option value="">— Select —</option>
            {TEAM_NAMES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div className="to-filter-group">
          <label>Project:</label>
          <select value={project} onChange={(e) => setProject(e.target.value)}>
            {allProjects.map((p) => <option key={p}>{p}</option>)}
          </select>
        </div>
        <button className="to-apply-btn" onClick={handleApply} disabled={!team}>Apply</button>
      </div>

      {/* ── Prompt ── */}
      {!applied && (
        <div className="empty-state" style={{ marginTop: 32 }}>
          <div className="es-icon">📊</div>
          <h3>Select a team to view SLA data</h3>
          <p>Choose a team above and click <strong>Apply</strong> to see SLA metrics and per-member breakdown.</p>
          <div className="team-preview-grid">
            {TEAM_NAMES.map((t) => (
              <div key={t} className="team-preview-card" onClick={() => setTeam(t)}>
                <div className="tp-name">{t}</div>
                <div className="tp-count">{TEAMS[t].length} members</div>
                <div className="tp-members">{TEAMS[t].slice(0, 3).join(", ")}{TEAMS[t].length > 3 ? ` +${TEAMS[t].length - 3} more` : ""}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Results ── */}
      {applied && (
        <>
          <div className="to-result-header">
            <span>📊 <strong>{applied.team}</strong></span>
            {applied.project !== "All" && <span className="to-tag">{applied.project}</span>}
          </div>

          {/* Team-level KPIs — all clickable */}
          <div className="to-kpis" style={{ marginBottom: 20 }}>
            <ToKpi label="TOTAL ASSIGNED"  value={<span className="kv-blue">{num(tTotal)}</span>}            onClick={() => openKpiDrill("All Tickets — " + applied.team,    teamRows)}  />
            <ToKpi label="RESOLVED"        value={<span className="kv-green">{num(tResolved.length)}</span>} onClick={() => openKpiDrill("Resolved — " + applied.team,       tResolved)} />
            <ToKpi label="OPEN / PENDING"  value={<span className="kv-black">{num(tOpen.length)}</span>}     onClick={() => openKpiDrill("Open / Pending — " + applied.team, tOpen)}     />
            <ToKpi label="SLA BREACHED"    value={<span className="kv-red">{num(tBreached.length)}</span>}   onClick={() => openKpiDrill("SLA Breached — " + applied.team,   tBreached)}
              sub={pct(tBreached.length, tTotal) + " breach rate"} />
            <ToKpi label="ESCALATIONS"     value={<span className="kv-red">{num(teamProjectEscalations.length)}</span>}
              sub="Active project escalations" onClick={() => { setKpiDrill(null); setEscalationsDrill((p) => !p); }} />
          </div>

          {/* Escalations panel — project escalations + SLA-breached tickets */}
          {escalationsDrill && (
            <div className="card full" style={{ margin: "0 0 20px" }}>
              <div className="breached-header">
                <h3>🚨 Escalations — {applied.team}</h3>
                <button className="btn-sm" onClick={() => setEscalationsDrill(false)}>✕ Close</button>
              </div>
              {teamProjectEscalations.length > 0 && (
                <>
                  <h4 style={{ margin: "0 0 8px", color: "var(--muted)", fontWeight: 600, fontSize: 13 }}>
                    Project Escalations ({teamProjectEscalations.length})
                  </h4>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Migration Manager</th><th>Project Name</th><th>Combination</th>
                          <th>Issue / Escalation</th><th>Current Phase</th>
                        </tr>
                      </thead>
                      <tbody>
                        {teamProjectEscalations.map((e, i) => (
                          <tr key={i}>
                            <td style={{ whiteSpace: "nowrap", fontWeight: 600 }}>{e.manager}</td>
                            <td style={{ whiteSpace: "nowrap" }}>{e.project}</td>
                            <td><span className="combo-badge">{e.combination || "—"}</span></td>
                            <td className="wrap" style={{ fontSize: 13, color: "var(--text)" }}>{e.issues || <span style={{ color: "var(--muted)" }}>—</span>}</td>
                            <td><span className="phase-badge">{e.phase}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              {teamProjectEscalations.length === 0 && (
                <p style={{ color: "var(--muted)", padding: "12px 0" }}>No escalations found for {applied.team}.</p>
              )}
            </div>
          )}

          {/* KPI drill-down panel — appears between KPIs and charts */}
          {kpiDrill && <SLADrillDown title={kpiDrill.title} tickets={kpiDrill.tickets} onClose={() => setKpiDrill(null)} jiraUrl={jiraUrl} onHistory={onHistory} />}

          {/* Charts — 3 in one row */}
          <div className="charts-3col">
            <div className="card"><h3>SLA Compliance</h3><PieChartCard data={slaDonut} /></div>
            <div className="card"><h3>Tickets by Priority</h3><BarChartCard data={prioData} color="#a78bfa" /></div>
            <div className="card"><h3>Ticket Types</h3><PieChartCard data={typeData} /></div>
          </div>

          {/* Member selector */}
          <div className="member-selector">
            <div className="ms-label">Select a member to view their SLA details</div>
            <div className="ms-chips">
              {memberStats.map((m) => (
                <button key={m.name}
                  className={"member-chip" + (selectedMember === m.name ? " mc-active" : "")}
                  onClick={() => { setSelectedMember((p) => p === m.name ? null : m.name); setMemberCardDrill(null); }}>
                  <span className="mc-avatar">{m.name.trim()[0].toUpperCase()}</span>
                  <span className="mc-name">{m.name}</span>
                  {m.breached.length > 0 && <span className="mc-breach-dot" title="Has SLA breached tickets" />}
                </button>
              ))}
            </div>
          </div>

          {/* Selected member detail cards */}
          {selectedMember && (() => {
            const m = memberStats.find((ms) => ms.name === selectedMember);
            if (!m) return null;
            const CARDS = [
              { label: "Total Tickets",  value: num(m.all.length),      tickets: m.all,      title: selectedMember + " — All Tickets",    color: "blue"  },
              { label: "Resolved",       value: num(m.resolved.length),  tickets: m.resolved, title: selectedMember + " — Resolved",       color: "green" },
              { label: "Open / Pending", value: num(m.open.length),      tickets: m.open,     title: selectedMember + " — Open / Pending", color: "gray"  },
              { label: "SLA Breached",   value: num(m.breached.length),  tickets: m.breached, title: selectedMember + " — SLA Breached",   color: "red"   },
              { label: "Within SLA",     value: num(m.within.length),    tickets: m.within,   title: selectedMember + " — Within SLA",     color: "green" },
              { label: "Avg In Progress", value: (() => { const p = memberPerf(m.name); return p ? p.avgInProgressHrs + " hrs" : "—"; })(), tickets: null, title: null, color: "gray" },
            ];
            return (
              <div className="member-detail">
                <div className="member-detail-header">
                  <div className="md-avatar">{selectedMember.trim()[0].toUpperCase()}</div>
                  <div>
                    <div className="md-name">{selectedMember}</div>
                    <div className="md-sub">
                      {num(m.all.length)} tickets · {pct(m.breached.length, m.all.length)} breach rate
                      {m.overDays != null && <> · avg <span style={{ color: "var(--red)", fontWeight: 700 }}>+{days(m.overDays)}</span> over SLA</>}
                    </div>
                  </div>
                </div>
                <div className="member-cards">
                  {CARDS.map((card, i) => {
                    const isActive = memberCardDrill?.title === card.title && card.tickets;
                    return (
                      <div key={i}
                        className={"member-card mc-" + card.color + (isActive ? " mc-card-active" : "")}
                        onClick={card.tickets ? () => setMemberCardDrill((p) => p?.title === card.title ? null : { title: card.title, tickets: card.tickets }) : undefined}
                        style={{ cursor: card.tickets ? "pointer" : "default" }}>
                        <div className="mc-label">{card.label}</div>
                        <div className="mc-value">{card.value}</div>
                        {card.tickets && <div className="mc-hint">▼ Click to view tickets</div>}
                      </div>
                    );
                  })}
                </div>
                {memberCardDrill && (
                  <SLADrillDown
                    title={memberCardDrill.title}
                    tickets={memberCardDrill.tickets}
                    onClose={() => setMemberCardDrill(null)}
                    jiraUrl={jiraUrl}
                    onHistory={onHistory}
                  />
                )}
              </div>
            );
          })()}

          <div className="card full" style={{ marginTop: 18, fontSize: 13, color: "var(--muted)" }}>
            ℹ️ SLA Thresholds: {PRIORITY_ORDER.map((p) => `${p} = ${SLA_THRESHOLDS[p]} day${SLA_THRESHOLDS[p] > 1 ? "s" : ""}`).join("  ·  ")}
          </div>
        </>
      )}
    </div>
  );
}

/* ===================================================================
   SHEET 3 — Ticket Ageing
   =================================================================== */

const BUCKET_META = {
  fast: { label: "< 5 Days",     title: "⚡ Fast  (< 5 Days)",        colorClass: "bucket-fast" },
  mod:  { label: "5 – 10 Days",  title: "⏳ Moderate  (5 – 10 Days)", colorClass: "bucket-mod"  },
  slow: { label: "> 10 Days",    title: "🔴 Delayed  (> 10 Days)",    colorClass: "bucket-slow" },
};

const FALLBACK_JIRA_URL = "https://cf2020.atlassian.net";

function TicketLink({ ticketKey, jiraUrl, onHistory }) {
  const effectiveUrl = jiraUrl || FALLBACK_JIRA_URL;
  if (effectiveUrl) {
    const link = (
      <a href={`${effectiveUrl}/browse/${ticketKey}`} target="_blank" rel="noreferrer" className="ticket-link">
        {ticketKey}
      </a>
    );
    if (onHistory) {
      return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          {link}
          <span className="th-key-btn" onClick={() => onHistory(ticketKey)} title="View ticket history" style={{ fontSize: 11, cursor: "pointer" }}>🕐</span>
        </span>
      );
    }
    return link;
  }
  return ticketKey;
}

function BucketDrillDown({ bucketKey, tickets, jiraUrl, onClose, onHistory }) {
  const { title, colorClass } = BUCKET_META[bucketKey];
  return (
    <div className={`card full bucket-panel ${colorClass}`} style={{ marginBottom: 18 }}>
      <div className="breached-header">
        <h3>{title} — {num(tickets.length)} tickets</h3>
        <button className="btn-sm" onClick={onClose}>✕ Close</button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Key</th><th>Summary</th><th>Priority</th>
              <th>Migration Path</th><th>Age (Days)</th><th>SLA</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map((r) => (
              <tr key={r.key}>
                <td><TicketLink ticketKey={r.key} jiraUrl={jiraUrl} onHistory={onHistory} /></td>
                <td className="wrap">{r.summary}</td>
                <td>{r.priority}</td>
                <td>{r.combination || "—"}</td>
                <td>{r.resolutionDays != null ? days(r.resolutionDays) : "—"}</td>
                <td>
                  <span className={"badge " + (r.slaBreached === "Yes" ? "b-red" : "b-green")}>
                    {r.slaBreached === "Yes" ? "Breached" : "OK"}
                  </span>
                </td>
                <td><span className={"badge " + (isResolved(r) ? "b-green" : "b-amber")}>{r.status || "—"}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TicketAgeing({ rows, jiraUrl, onHistory }) {
  const [team,       setTeam]       = useState("");
  const [member,     setMember]     = useState(null);
  const [openBucket, setOpenBucket] = useState(null);

  const teamMembers = useMemo(() => (team ? TEAMS[team] || [] : []), [team]);

  function handleTeamChange(t) {
    setTeam(t);
    setMember(null);
    setOpenBucket(null);
  }

  function handleMemberSelect(m) {
    setMember((prev) => (prev === m ? null : m));
    setOpenBucket(null);
  }

  const mine = useMemo(() => {
    if (!member) return [];
    return rows.filter((r) => r.assignee.toLowerCase() === member.toLowerCase());
  }, [rows, member]);

  const perfData = useMemo(() => memberPerf(member), [member]);

  const { res, fast, mod, slow } = ageing(mine);
  const totalRes = res.length;
  const resDays  = res.map((r) => r.resolutionDays);
  const max = resDays.length ? Math.max(...resDays) : 0;
  const min = resDays.length ? Math.min(...resDays) : 0;

  const ageDonut = [
    { name: "< 5 Days (Fast)",      value: fast.length },
    { name: "5-10 Days (Moderate)", value: mod.length  },
    { name: "> 10 Days (Delayed)",  value: slow.length },
  ];
  const buckets = priorityByBucket(mine);

  const globalResCount = rows.filter((r) => r.resolutionDays != null).length;
  const noResData = globalResCount === 0;

  const bucketTickets = { fast, mod, slow };

  return (
    <>
      {/* Step 1 — Team selector */}
      <div className="to-filterbar">
        <div className="to-filter-group">
          <label>Team:</label>
          <select value={team} onChange={(e) => handleTeamChange(e.target.value)}>
            <option value="">— Select —</option>
            {TEAM_NAMES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
      </div>

      {/* Step 2 — Member chips (shown once team selected) */}
      {team && (
        <div className="member-selector">
          <div className="ms-label">Select a member to view their ageing data</div>
          <div className="ms-chips">
            {teamMembers.map((m) => (
              <button key={m}
                className={"member-chip" + (member === m ? " mc-active" : "")}
                onClick={() => handleMemberSelect(m)}>
                <span className="mc-avatar">{m.trim()[0].toUpperCase()}</span>
                <span className="mc-name">{m}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Prompt states */}
      {!team && (
        <div className="empty-state" style={{ marginTop: 32 }}>
          <div className="es-icon">📅</div>
          <h3>Select a team to get started</h3>
          <p>Choose a team above to see its members, then pick a person to view their ticket ageing data.</p>
        </div>
      )}
      {team && !member && (
        <div className="empty-state" style={{ marginTop: 24 }}>
          <div className="es-icon">👤</div>
          <h3>Select a team member</h3>
          <p>Click one of the member chips above to view their ageing breakdown.</p>
        </div>
      )}

      {/* Data — shown only when a member is selected */}
      {member && (
        noResData ? (
          <div className="empty-state">
            <div className="es-icon">📅</div>
            <h3>No resolution date data found</h3>
            <p>
              The Ageing tab needs either a <strong>Resolution Days</strong> column (numeric),
              or both a <strong>Created</strong> and <strong>Resolved</strong> date column so
              the app can calculate it automatically.
            </p>
          </div>
        ) : (
          <>
            <div className="to-result-header" style={{ marginTop: 20 }}>
              <span>📊 <strong>{member}</strong></span>
              <span className="to-tag">{team}</span>
            </div>

            <div className="kpis">
              <Kpi icon="⚡" label="< 5 Days"      value={num(fast.length)} sub="Click to view tickets"
                clickable active={openBucket === "fast"} onClick={() => setOpenBucket((p) => p === "fast" ? null : "fast")} bucketColor="green" />
              <Kpi icon="⏳" label="5 – 10 Days"   value={num(mod.length)}  sub="Click to view tickets"
                clickable active={openBucket === "mod"}  onClick={() => setOpenBucket((p) => p === "mod"  ? null : "mod")}  bucketColor="amber" />
              <Kpi icon="🔴" label="> 10 Days"     value={num(slow.length)} sub="Click to view tickets"
                clickable active={openBucket === "slow"} onClick={() => setOpenBucket((p) => p === "slow" ? null : "slow")} bucketColor="red" />
              <Kpi icon="📈" label="Avg In Progress" value={perfData ? perfData.avgInProgressHrs + " hrs" : "—"} sub="Avg hours in progress" />
            </div>

            {openBucket && (
              <BucketDrillDown
                bucketKey={openBucket}
                tickets={bucketTickets[openBucket]}
                jiraUrl={jiraUrl}
                onClose={() => setOpenBucket(null)}
                onHistory={onHistory}
              />
            )}

            <div className="grid">
              <div className="card"><h3>Ageing Distribution</h3><PieChartCard data={ageDonut} /></div>
              <div className="card">
                <h3>Priority Split by Ageing Bucket</h3>
                <BarChartCard data={buckets} stackedKeys={["< 5 Days", "5-10 Days", "> 10 Days"]} height={300} />
              </div>
            </div>

            <div className="grid" style={{ marginTop: 18 }}>
              <Table title="Ageing Summary" head={["Bucket", "Tickets", "% of Total"]}
                rows={[
                  ["< 5 Days  (Fast)",        num(fast.length), pct(fast.length, totalRes)],
                  ["5 – 10 Days  (Moderate)", num(mod.length),  pct(mod.length,  totalRes)],
                  ["> 10 Days  (Delayed)",    num(slow.length), pct(slow.length, totalRes)],
                  ["TOTAL",                   num(totalRes),    "100.0%"],
                  ["Max (Days)",              days(max),        ""],
                  ["Min (Days)",              days(min, 4),     ""],
                ]} />
              <Table title="Priority in Each Ageing Bucket" head={["Priority", "< 5 Days", "5–10 Days", "> 10 Days"]}
                rows={buckets.map((b) => [b.name, num(b["< 5 Days"]), num(b["5-10 Days"]), num(b["> 10 Days"])])} />
            </div>

            <div className="card full" style={{ marginTop: 18 }}>
              <h3>📋 All Tickets — {member} ({num(mine.length)} tickets)</h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Key</th><th>Summary</th><th>Priority</th>
                      <th>Migration Path</th><th>Age (Days)</th><th>SLA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mine.map((r) => (
                      <tr key={r.key}>
                        <td><TicketLink ticketKey={r.key} jiraUrl={jiraUrl} onHistory={onHistory} /></td>
                        <td className="wrap">{r.summary}</td>
                        <td>{r.priority}</td>
                        <td>{r.combination || "—"}</td>
                        <td>{r.resolutionDays != null ? days(r.resolutionDays) : "—"}</td>
                        <td>
                          <span className={"badge " + (r.slaBreached === "Yes" ? "b-red" : "b-green")}>
                            {r.slaBreached === "Yes" ? "Breached" : "OK"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )
      )}
    </>
  );
}

/* ===================================================================
   TEAM SLA — one per team (Content Team, Messaging, Email)
   Escalations panel + full SLA metrics, no team-picker needed
   =================================================================== */
function TeamSLA({ teamName, rows, jiraUrl, onHistory }) {
  const [project,        setProject]        = useState("All");
  const [kpiDrill,       setKpiDrill]       = useState(null);
  const [selectedMember, setSelectedMember] = useState(null);
  const [memberCardDrill,setMemberCardDrill]= useState(null);

  const allProjects = useMemo(() => {
    const s = new Set(rows.map((r) => r.project).filter(Boolean));
    return ["All", ...Array.from(s).sort()];
  }, [rows]);

  const teamRows = useMemo(() => {
    const members   = TEAMS[teamName] || [];
    const memberSet = new Set(members.map((m) => m.toLowerCase()));
    return rows.filter((r) => {
      if (!memberSet.has((r.assignee || "").toLowerCase().trim())) return false;
      if (project !== "All" && r.project !== project) return false;
      return true;
    });
  }, [teamName, rows, project]);

  /* Escalations = SLA-breached tickets sorted most overdue first */
  const escalations = useMemo(() =>
    teamRows
      .filter((r) => r.slaBreached === "Yes")
      .sort((a, b) => {
        const oa = (a.resolutionDays || 0) - (SLA_THRESHOLDS[a.priority] || 5);
        const ob = (b.resolutionDays || 0) - (SLA_THRESHOLDS[b.priority] || 5);
        return ob - oa;
      }),
    [teamRows]
  );

  /* Project-level escalations for this team */
  const projectEscalations = useMemo(() =>
    PROJECT_ESCALATIONS.filter((e) => projectTeam(e.combination) === teamName),
    [teamName]
  );

  const tTotal    = teamRows.length;
  const tResolved = teamRows.filter((r) => isResolved(r));
  const tOpen     = teamRows.filter((r) => !isResolved(r));
  const tBreached = teamRows.filter((r) => r.slaBreached === "Yes");
  const tWithin   = teamRows.filter((r) => r.slaBreached !== "Yes");

  const prioData = useMemo(() => countByPriority(teamRows), [teamRows]);
  const typeData = useMemo(() => countByType(teamRows),     [teamRows]);
  const slaDonut = [
    { name: "Within SLA",   value: tWithin.length  },
    { name: "SLA Breached", value: tBreached.length },
  ];

  /* Team-level avg over SLA */
  const tOverDays = useMemo(() => {
    if (!tBreached.length) return null;
    const total = tBreached.reduce((sum, r) => {
      const th = SLA_THRESHOLDS[r.priority] || 5;
      return sum + Math.max(0, (r.resolutionDays || 0) - th);
    }, 0);
    return total / tBreached.length;
  }, [tBreached]);

  const memberStats = useMemo(() =>
    (TEAMS[teamName] || []).map((m) => {
      const mRows   = teamRows.filter((r) => r.assignee.toLowerCase() === m.toLowerCase());
      const mRes    = mRows.filter((r) => isResolved(r));
      const mOpen   = mRows.filter((r) => !isResolved(r));
      const mBreach = mRows.filter((r) => r.slaBreached === "Yes");
      const mWithin = mRows.filter((r) => r.slaBreached !== "Yes");
      const rdArr   = mRows.filter((r) => r.resolutionDays != null).map((r) => r.resolutionDays);
      const mAvg    = rdArr.length ? (rdArr.reduce((a, b) => a + b, 0) / rdArr.length).toFixed(1) : "—";
      const mOverDays = mBreach.length
        ? mBreach.reduce((sum, r) => {
            const th = SLA_THRESHOLDS[r.priority] || 5;
            return sum + Math.max(0, (r.resolutionDays || 0) - th);
          }, 0) / mBreach.length
        : null;
      return { name: m, all: mRows, resolved: mRes, open: mOpen, breached: mBreach, within: mWithin, avg: mAvg, overDays: mOverDays };
    }),
    [teamName, teamRows]
  );

  function openKpiDrill(title, tickets) {
    setKpiDrill((prev) => (prev?.title === title ? null : { title, tickets }));
  }

  return (
    <div className="team-overview">
      {/* Project filter */}
      <div className="to-filterbar">
        <div className="to-filter-group">
          <label>Project:</label>
          <select value={project} onChange={(e) => { setProject(e.target.value); setKpiDrill(null); setSelectedMember(null); setMemberCardDrill(null); }}>
            {allProjects.map((p) => <option key={p}>{p}</option>)}
          </select>
        </div>
        <span style={{ color: "var(--muted)", fontSize: 13 }}>
          {num(tTotal)} tickets · {TEAMS[teamName].length} members
        </span>
      </div>

      {/* ── Project-level escalations ── */}
      {projectEscalations.length > 0 && (
        <div className="card full proj-escalations-panel" style={{ marginBottom: 20 }}>
          <div className="breached-header">
            <h3>🚨 Project Escalations — {projectEscalations.length} project{projectEscalations.length !== 1 ? "s" : ""}</h3>
            <span style={{ color: "var(--muted)", fontSize: 13 }}>Active customer escalations for {teamName}</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Migration Manager</th><th>Project Name</th><th>Combination</th>
                  <th>Issue / Escalation</th><th>Current Phase</th>
                </tr>
              </thead>
              <tbody>
                {projectEscalations.map((e, i) => (
                  <tr key={i}>
                    <td style={{ whiteSpace: "nowrap", fontWeight: 600 }}>{e.manager}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{e.project}</td>
                    <td><span className="combo-badge">{e.combination || "—"}</span></td>
                    <td className="wrap" style={{ fontSize: 13, color: "var(--text)" }}>{e.issues || <span style={{ color: "var(--muted)" }}>—</span>}</td>
                    <td><span className="phase-badge">{e.phase}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Jira ticket escalations (SLA breached) ── */}
      {escalations.length > 0 && (
        <div className="card full escalations-panel" style={{ marginBottom: 20 }}>
          <div className="breached-header">
            <h3>🔴 SLA Breached Tickets — {num(escalations.length)}</h3>
            <span style={{ color: "var(--muted)", fontSize: 13 }}>
              Sorted by most overdue first
            </span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Key</th><th>Summary</th><th>Priority</th>
                  <th>Assignee</th><th>Days Held</th><th>SLA Limit</th><th>Over By</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {escalations.map((r) => {
                  const threshold = SLA_THRESHOLDS[r.priority] || 5;
                  const overDays  = r.resolutionDays != null ? r.resolutionDays - threshold : null;
                  return (
                    <tr key={r.key}>
                      <td><TicketLink ticketKey={r.key} jiraUrl={JIRA_BASE_URL} onHistory={onHistory} /></td>
                      <td className="wrap">{r.summary}</td>
                      <td>{r.priority}</td>
                      <td>{r.assignee}</td>
                      <td>{r.resolutionDays != null ? days(r.resolutionDays) : "—"}</td>
                      <td>{threshold}d</td>
                      <td>
                        <span className="over-sla-badge">
                          {overDays != null ? `+${days(overDays)}` : "—"}
                        </span>
                      </td>
                      <td><span className={"badge " + (isResolved(r) ? "b-green" : "b-amber")}>{r.status || "—"}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tTotal === 0 ? (
        <div className="empty-state">
          <div className="es-icon">🔍</div>
          <h3>No tickets found for {teamName}</h3>
          <p>No tickets are assigned to {teamName} members{project !== "All" ? ` in project ${project}` : ""}.</p>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="to-kpis" style={{ marginBottom: 20 }}>
            <ToKpi label="TOTAL ASSIGNED"  value={<span className="kv-blue">{num(tTotal)}</span>}            onClick={() => openKpiDrill("All Tickets — " + teamName,    teamRows)}  />
            <ToKpi label="RESOLVED"        value={<span className="kv-green">{num(tResolved.length)}</span>} onClick={() => openKpiDrill("Resolved — " + teamName,       tResolved)} />
            <ToKpi label="OPEN / PENDING"  value={<span className="kv-black">{num(tOpen.length)}</span>}     onClick={() => openKpiDrill("Open / Pending — " + teamName, tOpen)}     />
            <ToKpi label="SLA BREACHED"    value={<span className="kv-red">{num(tBreached.length)}</span>}   onClick={() => openKpiDrill("SLA Breached — " + teamName,   tBreached)}
              sub={pct(tBreached.length, tTotal) + " breach rate"} />
            <ToKpi label="WITHIN SLA"      value={<span className="kv-green">{num(tWithin.length)}</span>}   onClick={() => openKpiDrill("Within SLA — " + teamName,     tWithin)}   />
          </div>

          {/* KPI drill-down between KPIs and charts */}
          {kpiDrill && <SLADrillDown title={kpiDrill.title} tickets={kpiDrill.tickets} onClose={() => setKpiDrill(null)} jiraUrl={jiraUrl} onHistory={onHistory} />}

          {/* Charts — 3 in one line */}
          <div className="charts-3col">
            <div className="card"><h3>SLA Compliance</h3><PieChartCard data={slaDonut} /></div>
            <div className="card"><h3>Tickets by Priority</h3><BarChartCard data={prioData} color="#a78bfa" /></div>
            <div className="card"><h3>Ticket Types</h3><PieChartCard data={typeData} /></div>
          </div>

          {/* Member selector */}
          <div className="member-selector">
            <div className="ms-label">Select a member to view their SLA details</div>
            <div className="ms-chips">
              {memberStats.map((m) => (
                <button key={m.name}
                  className={"member-chip" + (selectedMember === m.name ? " mc-active" : "")}
                  onClick={() => { setSelectedMember((p) => p === m.name ? null : m.name); setMemberCardDrill(null); }}>
                  <span className="mc-avatar">{m.name.trim()[0].toUpperCase()}</span>
                  <span className="mc-name">{m.name}</span>
                  {m.breached.length > 0 && <span className="mc-breach-dot" title="Has SLA breached tickets" />}
                </button>
              ))}
            </div>
          </div>

          {/* Selected member detail cards */}
          {selectedMember && (() => {
            const m = memberStats.find((ms) => ms.name === selectedMember);
            if (!m) return null;
            const CARDS = [
              { label: "Total Tickets",  value: num(m.all.length),      tickets: m.all,      title: selectedMember + " — All Tickets",    color: "blue"  },
              { label: "Resolved",       value: num(m.resolved.length),  tickets: m.resolved, title: selectedMember + " — Resolved",       color: "green" },
              { label: "Open / Pending", value: num(m.open.length),      tickets: m.open,     title: selectedMember + " — Open / Pending", color: "gray"  },
              { label: "SLA Breached",   value: num(m.breached.length),  tickets: m.breached, title: selectedMember + " — SLA Breached",   color: "red"   },
              { label: "Within SLA",     value: num(m.within.length),    tickets: m.within,   title: selectedMember + " — Within SLA",     color: "green" },
              { label: "Avg In Progress", value: (() => { const p = memberPerf(m.name); return p ? p.avgInProgressHrs + " hrs" : "—"; })(), tickets: null, title: null, color: "gray" },
            ];
            return (
              <div className="member-detail">
                <div className="member-detail-header">
                  <div className="md-avatar">{selectedMember.trim()[0].toUpperCase()}</div>
                  <div>
                    <div className="md-name">{selectedMember}</div>
                    <div className="md-sub">
                      {num(m.all.length)} tickets · {pct(m.breached.length, m.all.length)} breach rate
                      {m.overDays != null && <> · avg <span style={{ color: "var(--red)", fontWeight: 700 }}>+{days(m.overDays)}</span> over SLA</>}
                    </div>
                  </div>
                </div>
                <div className="member-cards">
                  {CARDS.map((card, i) => {
                    const isActive = memberCardDrill?.title === card.title && card.tickets;
                    return (
                      <div key={i}
                        className={"member-card mc-" + card.color + (isActive ? " mc-card-active" : "")}
                        onClick={card.tickets ? () => setMemberCardDrill((p) => p?.title === card.title ? null : { title: card.title, tickets: card.tickets }) : undefined}
                        style={{ cursor: card.tickets ? "pointer" : "default" }}>
                        <div className="mc-label">{card.label}</div>
                        <div className="mc-value">{card.value}</div>
                        {card.tickets && <div className="mc-hint">▼ Click to view tickets</div>}
                      </div>
                    );
                  })}
                </div>
                {memberCardDrill && (
                  <SLADrillDown
                    title={memberCardDrill.title}
                    tickets={memberCardDrill.tickets}
                    onClose={() => setMemberCardDrill(null)}
                    jiraUrl={jiraUrl}
                    onHistory={onHistory}
                  />
                )}
              </div>
            );
          })()}

          <div className="card full" style={{ marginTop: 18, fontSize: 13, color: "var(--muted)" }}>
            ℹ️ SLA Thresholds: {PRIORITY_ORDER.map((p) => `${p} = ${SLA_THRESHOLDS[p]} day${SLA_THRESHOLDS[p] > 1 ? "s" : ""}`).join("  ·  ")}
          </div>
        </>
      )}
    </div>
  );
}

/* ===================================================================
   ENGINEER PATTERNS
   =================================================================== */
function EngineerPatterns({ rows }) {
  const [team,     setTeam]     = useState("");
  const [expanded, setExpanded] = useState(null);

  const memberData = useMemo(() => {
    if (!team) return [];
    return (TEAMS[team] || []).map((m) => {
      const mRows = rows.filter((r) => r.assignee.toLowerCase() === m.toLowerCase());
      if (!mRows.length) return { name: m, total: 0, combinations: [], issueTypes: [], priorities: [], breached: 0, breachRate: "0.0", needsImprovement: [], topCombo: null };

      /* Combinations */
      const comboMap = {};
      mRows.forEach((r) => {
        const key = r.combination || "Unspecified";
        if (!comboMap[key]) comboMap[key] = { total: 0, breached: 0 };
        comboMap[key].total++;
        if (r.slaBreached === "Yes") comboMap[key].breached++;
      });
      const combinations = Object.entries(comboMap)
        .map(([combo, d]) => ({ combo, total: d.total, breached: d.breached, breachRate: ((d.breached / d.total) * 100).toFixed(1) }))
        .sort((a, b) => b.total - a.total);

      /* Issue types */
      const typeMap = {};
      mRows.forEach((r) => { const t = r.issueType || "Unknown"; typeMap[t] = (typeMap[t] || 0) + 1; });
      const issueTypes = Object.entries(typeMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

      /* Priorities */
      const prioMap = {};
      mRows.forEach((r) => { const p = r.priority || "Unknown"; prioMap[p] = (prioMap[p] || 0) + 1; });
      const priorities = Object.entries(prioMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

      const breached    = mRows.filter((r) => r.slaBreached === "Yes").length;
      const breachRate  = ((breached / mRows.length) * 100).toFixed(1);
      const needsImprovement = combinations.filter((c) => parseFloat(c.breachRate) > 30 && c.total >= 2);

      return { name: m, total: mRows.length, combinations, issueTypes, priorities, breached, breachRate, needsImprovement, topCombo: combinations[0] || null };
    });
  }, [team, rows]);

  return (
    <div className="team-overview">
      <div className="to-filterbar">
        <div className="to-filter-group">
          <label>Team:</label>
          <select value={team} onChange={(e) => { setTeam(e.target.value); setExpanded(null); }}>
            <option value="">— Select —</option>
            {TEAM_NAMES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        {team && <span style={{ color: "var(--muted)", fontSize: 13 }}>{TEAMS[team].length} engineers · click a card to expand</span>}
      </div>

      {!team && (
        <div className="empty-state" style={{ marginTop: 32 }}>
          <div className="es-icon">🔬</div>
          <h3>Select a team to explore engineer patterns</h3>
          <p>Pick a team to see each engineer's top activity areas, ticket mix, and where they have the most room to improve SLA performance.</p>
          <div className="team-preview-grid">
            {TEAM_NAMES.map((t) => (
              <div key={t} className="team-preview-card" onClick={() => setTeam(t)}>
                <div className="tp-name">{t}</div>
                <div className="tp-count">{TEAMS[t].length} engineers</div>
                <div className="tp-members">{TEAMS[t].slice(0, 3).join(", ")}{TEAMS[t].length > 3 ? ` +${TEAMS[t].length - 3} more` : ""}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {team && (
        <div className="ep-list">
          {memberData.map((m) => (
            <EngineerCard
              key={m.name}
              data={m}
              expanded={expanded === m.name}
              onToggle={() => setExpanded((p) => (p === m.name ? null : m.name))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EngineerCard({ data, expanded, onToggle }) {
  const { name, total, combinations, issueTypes, priorities, breached, breachRate, needsImprovement, topCombo } = data;
  const topCombos = combinations.slice(0, 6);
  const breachNum  = parseFloat(breachRate);

  return (
    <div className={"ep-card" + (expanded ? " ep-card-open" : "")}>
      {/* ── Header (always visible) ── */}
      <div className="ep-header" onClick={onToggle}>
        <div className="ep-avatar">{name.trim()[0].toUpperCase()}</div>
        <div className="ep-info">
          <div className="ep-name">{name}</div>
          <div className="ep-meta">
            {num(total)} tickets
            {topCombo && <> · Most active in: <strong>{topCombo.combo}</strong> ({topCombo.total} tickets)</>}
          </div>
        </div>
        <div className="ep-badges">
          <span className={"ep-sla-badge " + (breachNum > 30 ? "ep-badge-red" : breachNum > 15 ? "ep-badge-amber" : "ep-badge-green")}>
            {breachRate}% SLA breach
          </span>
          {needsImprovement.length > 0 && (
            <span className="ep-improve-badge">⚠️ {needsImprovement.length} risk area{needsImprovement.length > 1 ? "s" : ""}</span>
          )}
          <span className="ep-chevron">{expanded ? "▲" : "▼"}</span>
        </div>
      </div>

      {/* ── Expanded body ── */}
      {expanded && (
        <div className="ep-body">

          {/* Strength — top combination */}
          <div className="ep-insight-row">
            <div className="ep-insight ep-insight-top">
              <div className="ep-insight-label">💪 Most Active In</div>
              <div className="ep-insight-value">{topCombo ? topCombo.combo : "—"}</div>
              <div className="ep-insight-sub">{topCombo ? `${topCombo.total} tickets · ${topCombo.breachRate}% breach rate` : ""}</div>
            </div>
            {needsImprovement.length > 0 ? (
              <div className="ep-insight ep-insight-risk">
                <div className="ep-insight-label">🎯 Needs Improvement</div>
                {needsImprovement.slice(0, 2).map((c, i) => (
                  <div key={i} className="ep-insight-value" style={{ fontSize: 14, marginBottom: 4 }}>
                    {c.combo} <span className="badge b-red" style={{ fontSize: 11 }}>{c.breachRate}% breach</span>
                  </div>
                ))}
                {needsImprovement.length > 2 && <div className="ep-insight-sub">+{needsImprovement.length - 2} more</div>}
              </div>
            ) : (
              <div className="ep-insight ep-insight-ok">
                <div className="ep-insight-label">✅ SLA Health</div>
                <div className="ep-insight-value">No high-risk areas</div>
                <div className="ep-insight-sub">All migration paths below 30% breach threshold</div>
              </div>
            )}
          </div>

          {/* Migration path table */}
          <div className="ep-section">
            <div className="ep-section-title">📁 Migration Path Activity (top {topCombos.length})</div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Migration Path</th><th>Tickets</th><th>% of Work</th><th>SLA Breached</th><th>Breach Rate</th><th>Pattern Signal</th>
                  </tr>
                </thead>
                <tbody>
                  {topCombos.map((c, i) => {
                    const share = total ? ((c.total / total) * 100).toFixed(1) : "0.0";
                    const risk  = parseFloat(c.breachRate);
                    const signal = i === 0 ? "🏆 Primary focus" : risk > 30 && c.total >= 2 ? "⚠️ Improve SLA" : risk > 15 ? "⚡ Watch closely" : "✅ Healthy";
                    return (
                      <tr key={i} style={{ background: risk > 30 && c.total >= 2 ? "rgba(239,68,68,.05)" : undefined }}>
                        <td style={{ fontWeight: i === 0 ? 600 : undefined }}>{c.combo}</td>
                        <td>{num(c.total)}</td>
                        <td>{share}%</td>
                        <td>{num(c.breached)}</td>
                        <td><span className={"badge " + (risk > 30 ? "b-red" : risk > 15 ? "b-amber" : "b-green")}>{c.breachRate}%</span></td>
                        <td style={{ fontSize: 12 }}>{signal}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Issue type + Priority side by side */}
          <div className="ep-2col">
            <div className="ep-section">
              <div className="ep-section-title">🏷️ Issue Type Mix</div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Issue Type</th><th>Count</th><th>% Share</th></tr></thead>
                  <tbody>
                    {issueTypes.map((t, i) => (
                      <tr key={i}>
                        <td>{t.name}</td>
                        <td>{num(t.value)}</td>
                        <td>{total ? ((t.value / total) * 100).toFixed(1) : 0}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="ep-section">
              <div className="ep-section-title">🔢 Priority Distribution</div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Priority</th><th>Count</th><th>% Share</th></tr></thead>
                  <tbody>
                    {priorities.map((p, i) => (
                      <tr key={i}>
                        <td>{p.name}</td>
                        <td>{num(p.value)}</td>
                        <td>{total ? ((p.value / total) * 100).toFixed(1) : 0}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Needs improvement detail */}
          {needsImprovement.length > 0 && (
            <div className="ep-section ep-improve-section">
              <div className="ep-section-title">🎯 Improvement Opportunities — SLA Breach Rate &gt; 30%</div>
              <div className="ep-improve-grid">
                {needsImprovement.map((c, i) => (
                  <div key={i} className="ep-improve-card">
                    <div className="ep-ic-combo">{c.combo}</div>
                    <div className="ep-ic-stats">
                      <span className="badge b-red">{c.breachRate}% breach rate</span>
                      <span style={{ color: "var(--muted)", fontSize: 12 }}>{c.total} ticket{c.total > 1 ? "s" : ""} · {c.breached} breached</span>
                    </div>
                    <div className="ep-ic-tip">Focus on faster resolution for this path to bring breach rate below 30%.</div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}

function ToKpi({ label, value, sub, valueClass = "kv-black", onClick }) {
  return (
    <div className={"to-kpi" + (onClick ? " to-kpi-clickable" : "")} onClick={onClick}>
      <div className="to-kpi-label">{label}</div>
      <div className={`to-kpi-value ${valueClass}`}>{value}</div>
      {sub && <div className="to-kpi-sub">{sub}</div>}
    </div>
  );
}
