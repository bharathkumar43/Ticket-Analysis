import React, { useMemo, useState } from "react";
import { BarChartCard, PieChartCard } from "./components/Charts.jsx";
import { ExcelImport, ChangeFileBar } from "./ExcelImport.jsx";
import {
  PRIORITY_ORDER, SLA_THRESHOLDS,
  count, countByPriority, countByType, topMigrationPaths, topAssignees,
  assigneeList, avgResolutionDays, ageing, priorityByBucket,
  pct, num, days, isResolved,
} from "./utils.js";

const TABS = ["Tickets Resolved", "Assignee with SLA", "Ticket Ageing"];

const JIRA_BASE_URL = (import.meta.env.VITE_JIRA_BASE_URL || "").replace(/\/$/, "");

export default function App() {
  const [fileData, setFileData] = useState(null);
  const [tab, setTab] = useState(TABS[0]);

  if (!fileData) {
    return <ExcelImport onLoad={(r) => { setFileData(r); setTab(TABS[0]); }} />;
  }

  const { rows, sheet, warnings, fileName } = fileData;

  return (
    <div className="app">
      <div className="header">
        <h1>🎫 Ticket Analytics Dashboard</h1>
        <p>{num(rows.length)} tickets loaded</p>
      </div>

      <ChangeFileBar
        fileName={fileName || "workbook.xlsx"}
        sheet={sheet}
        warnings={warnings}
        onReset={() => setFileData(null)}
      />

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t} className={"tab" + (tab === t ? " active" : "")} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {tab === "Tickets Resolved" && <TicketsResolved rows={rows} />}
      {tab === "Assignee with SLA" && <AssigneeSLA rows={rows} />}
      {tab === "Ticket Ageing"    && <TicketAgeing rows={rows} jiraUrl={JIRA_BASE_URL} />}
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
function TicketsResolved({ rows }) {
  const total     = rows.length;
  const resolved  = count(rows, (r) => isResolved(r));
  const open      = total - resolved;
  const breached  = count(rows, (r) => r.slaBreached === "Yes");
  const bugs      = count(rows, (r) => r.issueType === "Bug");
  const operational = count(rows, (r) => ["Task", "Sub-task", "Story"].includes(r.issueType));
  const avg       = avgResolutionDays(rows);

  const typeData  = countByType(rows);
  const prioData  = countByPriority(rows);
  const paths     = topMigrationPaths(rows, 8);
  const assignees = topAssignees(rows, 10);

  const codeVsOps   = [{ name: "Code Fixes (Bugs)", value: bugs }, { name: "Operational", value: operational }];
  const assigneeBar = assignees.map((a) => ({ name: a.assignee, value: a.tickets }));

  return (
    <>
      <div className="kpis">
        <Kpi icon="📥" label="Total Received"    value={num(total)}    sub="All Tickets" />
        <Kpi icon="✅" label="Resolved"          value={num(resolved)} sub={pct(resolved, total) + " Resolution Rate"} />
        <Kpi icon="⏳" label="Open / Pending"    value={num(open)}     sub="Not Yet Resolved" />
        <Kpi icon="⚠️" label="SLA Breached"      value={num(breached)} sub={pct(breached, total) + " of Total"} />
        <Kpi icon="🐛" label="Code Fixes (Bugs)" value={num(bugs)}     sub={pct(bugs, total) + " of Total"} />
        <Kpi icon="⚙️" label="Operational"       value={num(operational)} sub="Tasks · Sub-tasks · Stories" />
        <Kpi icon="⏱️" label="Avg Resolution"    value={days(avg)}     sub="Days per Resolved Ticket" />
        <Kpi icon="🔄" label="Reopened"          value="0"             sub="Not tracked in source" />
      </div>

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
    </>
  );
}

/* ===================================================================
   SHEET 2 — Assignee with SLA
   =================================================================== */
function AssigneeSLA({ rows }) {
  const names = useMemo(() => assigneeList(rows), [rows]);
  const [who, setWho] = useState(names[0] || "");
  const [showBreached, setShowBreached] = useState(false);
  const mine = useMemo(() => rows.filter((r) => r.assignee === who), [rows, who]);

  const assigned = mine.length;
  const resolved = count(mine, (r) => isResolved(r));
  const open     = assigned - resolved;
  const breachedTickets = useMemo(() => mine.filter((r) => r.slaBreached === "Yes"), [mine]);
  const breached = breachedTickets.length;
  const within   = assigned - breached;

  const resDays = mine.filter((r) => r.resolutionDays != null).map((r) => r.resolutionDays);
  const avg = resDays.length ? resDays.reduce((a, b) => a + b, 0) / resDays.length : 0;
  const max = resDays.length ? Math.max(...resDays) : 0;
  const min = resDays.length ? Math.min(...resDays) : 0;

  const prioData = countByPriority(mine);
  const typeData = countByType(mine);
  const slaDonut = [{ name: "Within SLA", value: within }, { name: "SLA Breached", value: breached }];

  // Reset drill-down when assignee changes
  const handleAssigneeChange = (name) => { setWho(name); setShowBreached(false); };

  return (
    <>
      <div className="controls">
        <label>🔍 Assignee:</label>
        <select value={who} onChange={(e) => handleAssigneeChange(e.target.value)}>
          {names.map((n) => <option key={n}>{n}</option>)}
        </select>
      </div>

      <div className="kpis">
        <Kpi icon="📥" label="Assigned"       value={num(assigned)} sub="Total Tickets" />
        <Kpi icon="✅" label="Resolved"       value={num(resolved)} sub="Resolved Tickets" />
        <Kpi icon="⏳" label="Open / Pending"  value={num(open)}    sub="Not Yet Resolved" />
        <Kpi
          icon="⚠️"
          label="SLA Breached"
          value={num(breached)}
          sub="Click to view tickets"
          onClick={() => setShowBreached((v) => !v)}
          active={showBreached}
          clickable
        />
        <Kpi icon="📈" label="SLA Breach %"   value={pct(breached, assigned)} sub="Of Total Assigned" />
      </div>

      {showBreached && (
        <div className="card full breached-panel" style={{ marginBottom: 18 }}>
          <div className="breached-header">
            <h3>⚠️ SLA Breached Tickets — {who} ({num(breached)})</h3>
            <button className="btn-sm" onClick={() => setShowBreached(false)}>✕ Close</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Key</th><th>Summary</th><th>Priority</th>
                  <th>Issue Type</th><th>Migration Path</th><th>Res. Days</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {breachedTickets.map((r) => (
                  <tr key={r.key}>
                    <td>
                      {JIRA_BASE_URL
                        ? <a href={`${JIRA_BASE_URL}/browse/${r.key}`} target="_blank" rel="noreferrer" className="ticket-link">{r.key}</a>
                        : r.key}
                    </td>
                    <td className="wrap">{r.summary}</td>
                    <td>{r.priority}</td>
                    <td>{r.issueType}</td>
                    <td>{r.combination || "—"}</td>
                    <td>{r.resolutionDays != null ? days(r.resolutionDays) : "—"}</td>
                    <td><span className={"badge " + (isResolved(r) ? "b-green" : "b-amber")}>{r.status || "—"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="grid">
        <div className="card"><h3>SLA Compliance</h3><PieChartCard data={slaDonut} /></div>
        <div className="card"><h3>Tickets by Priority</h3><BarChartCard data={prioData} color="#a78bfa" /></div>
        <div className="card"><h3>Ticket Types</h3><PieChartCard data={typeData} /></div>
      </div>

      <div className="grid" style={{ marginTop: 18 }}>
        <Table title="Priority Breakdown" head={["Priority", "Assigned"]}
          rows={[...prioData.map((p) => [p.name, num(p.value)]), ["TOTAL", num(assigned)]]} />
        <Table title="Ticket Type Breakdown" head={["Type", "Assigned"]}
          rows={[...typeData.map((t) => [t.name, num(t.value)]), ["TOTAL", num(assigned)]]} />
        <Table title="SLA Compliance Detail" head={["Metric", "Value"]}
          rows={[
            ["✅ Within SLA",          num(within)],
            ["⚠️ SLA Breached",         num(breached)],
            ["Breach Rate",             pct(breached, assigned)],
            ["Avg Resolution (Days)",   days(avg)],
            ["Max Resolution (Days)",   days(max)],
            ["Min Resolution (Days)",   days(min, 4)],
          ]} />
      </div>

      <div className="card full" style={{ marginTop: 18, fontSize: 13, color: "var(--muted)" }}>
        ℹ️ SLA Thresholds: {PRIORITY_ORDER.map((p) => `${p} = ${SLA_THRESHOLDS[p]} day${SLA_THRESHOLDS[p] > 1 ? "s" : ""}`).join("  ·  ")}
      </div>
    </>
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

function TicketLink({ ticketKey, jiraUrl }) {
  if (jiraUrl) {
    return <a href={`${jiraUrl}/browse/${ticketKey}`} target="_blank" rel="noreferrer" className="ticket-link">{ticketKey}</a>;
  }
  return ticketKey;
}

function BucketDrillDown({ bucketKey, tickets, jiraUrl, onClose }) {
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
                <td><TicketLink ticketKey={r.key} jiraUrl={jiraUrl} /></td>
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

function TicketAgeing({ rows, jiraUrl }) {
  const names = useMemo(() => assigneeList(rows), [rows]);
  const [who, setWho] = useState(names[0] || "");
  const [openBucket, setOpenBucket] = useState(null); // "fast" | "mod" | "slow" | null
  const mine = useMemo(() => rows.filter((r) => r.assignee === who), [rows, who]);

  const { res, fast, mod, slow } = ageing(mine);
  const totalRes = res.length;
  const resDays  = res.map((r) => r.resolutionDays);
  const avg = resDays.length ? resDays.reduce((a, b) => a + b, 0) / resDays.length : 0;
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

  function toggleBucket(key) {
    setOpenBucket((prev) => (prev === key ? null : key));
  }

  function handleAssigneeChange(name) {
    setWho(name);
    setOpenBucket(null);
  }

  const bucketTickets = { fast, mod, slow };

  return (
    <>
      <div className="controls">
        <label>🔍 Assignee:</label>
        <select value={who} onChange={(e) => handleAssigneeChange(e.target.value)}>
          {names.map((n) => <option key={n}>{n}</option>)}
        </select>
      </div>

      {noResData ? (
        <div className="empty-state">
          <div className="es-icon">📅</div>
          <h3>No resolution date data found</h3>
          <p>
            The Ageing tab needs either a <strong>Resolution Days</strong> column (numeric),
            or both a <strong>Created</strong> and <strong>Resolved</strong> date column so
            the app can calculate it automatically.
          </p>
          <p style={{ color: "var(--muted)", fontSize: 13 }}>
            Column names accepted: <em>Created, Resolved, Resolution Date, Close Date,
            Resolution Days, Res Days, Days To Resolve, Age (Days)</em>
          </p>
        </div>
      ) : (
        <>
          <div className="kpis">
            <Kpi icon="⚡" label="< 5 Days"       value={num(fast.length)} sub="Click to view tickets"
              clickable active={openBucket === "fast"} onClick={() => toggleBucket("fast")} bucketColor="green" />
            <Kpi icon="⏳" label="5 – 10 Days"    value={num(mod.length)}  sub="Click to view tickets"
              clickable active={openBucket === "mod"}  onClick={() => toggleBucket("mod")}  bucketColor="amber" />
            <Kpi icon="🔴" label="> 10 Days"      value={num(slow.length)} sub="Click to view tickets"
              clickable active={openBucket === "slow"} onClick={() => toggleBucket("slow")} bucketColor="red" />
            <Kpi icon="📈" label="Avg Resolution"  value={days(avg)} sub="Days per Ticket" />
          </div>

          {openBucket && (
            <BucketDrillDown
              bucketKey={openBucket}
              tickets={bucketTickets[openBucket]}
              jiraUrl={jiraUrl}
              onClose={() => setOpenBucket(null)}
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
        </>
      )}

      <div className="card full" style={{ marginTop: 18 }}>
        <h3>📋 All Tickets — {who} ({num(mine.length)} tickets)</h3>
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
                  <td><TicketLink ticketKey={r.key} jiraUrl={jiraUrl} /></td>
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
  );
}
