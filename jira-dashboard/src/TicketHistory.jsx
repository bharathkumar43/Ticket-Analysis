import React, { useEffect, useState, useCallback } from "react";
import { fetchIssueChangelog } from "./jiraApi.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDays(days) {
  if (days < 0.1) return "< 1 hr";
  if (days < 1)   return `${Math.round(days * 24)} hr${Math.round(days * 24) !== 1 ? "s" : ""}`;
  if (days < 30)  return `${days.toFixed(1)} day${days.toFixed(1) !== "1.0" ? "s" : ""}`;
  const months = Math.floor(days / 30);
  return `${months} mo`;
}

function diffDays(a, b) {
  return (b.getTime() - a.getTime()) / 86400000;
}

/**
 * Build chronological status and assignee timelines from the raw changelog.
 * Each segment: { name, from, to, days, isCurrent }
 */
function buildTimelines(issue) {
  const now        = new Date();
  const createdAt  = new Date(issue.createdAt || 0);

  // Sort all history events oldest → newest
  const events = [...issue.changelog].sort(
    (a, b) => new Date(a.created).getTime() - new Date(b.created).getTime()
  );

  // ── Status timeline ────────────────────────────────────────────
  const statusSegs = [];
  let prevStatus = null;
  let prevStatusAt = createdAt;

  for (const ev of events) {
    for (const it of ev.items) {
      if (it.field !== "status") continue;
      if (prevStatus !== null) {
        statusSegs.push({ name: prevStatus, from: prevStatusAt, to: new Date(ev.created), days: diffDays(prevStatusAt, new Date(ev.created)), isCurrent: false });
      }
      prevStatus   = it.toString;
      prevStatusAt = new Date(ev.created);
    }
  }
  // Add the current (open) segment
  if (prevStatus !== null) {
    statusSegs.push({ name: prevStatus, from: prevStatusAt, to: now, days: diffDays(prevStatusAt, now), isCurrent: true });
  } else if (issue.status) {
    // No status changes in changelog — ticket may have been created in its current status
    statusSegs.push({ name: issue.status, from: createdAt, to: now, days: diffDays(createdAt, now), isCurrent: true });
  }

  // ── Assignee timeline ──────────────────────────────────────────
  const assigneeSegs = [];
  let prevAssignee = "Unassigned";
  let prevAssigneeAt = createdAt;

  for (const ev of events) {
    for (const it of ev.items) {
      if (it.field !== "assignee") continue;
      assigneeSegs.push({ name: prevAssignee, from: prevAssigneeAt, to: new Date(ev.created), days: diffDays(prevAssigneeAt, new Date(ev.created)), isCurrent: false });
      prevAssignee   = it.toString || "Unassigned";
      prevAssigneeAt = new Date(ev.created);
    }
  }
  // Current holder
  assigneeSegs.push({ name: prevAssignee, from: prevAssigneeAt, to: now, days: diffDays(prevAssigneeAt, now), isCurrent: true });

  return { statusSegs, assigneeSegs };
}

// ── Priority badge colour ────────────────────────────────────────────────────
function prioClass(p) {
  return { Highest: "b-red", High: "b-red", Medium: "b-amber", Low: "b-blue", Lowest: "b-gray" }[p] || "b-gray";
}

// ── Status badge colour ──────────────────────────────────────────────────────
function statusClass(s) {
  const l = (s || "").toLowerCase();
  if (["done", "resolved", "closed", "fixed", "completed"].includes(l)) return "b-green";
  if (["in progress", "in review", "in development"].includes(l)) return "b-blue";
  if (["blocked", "on hold", "waiting"].some(k => l.includes(k))) return "b-red";
  return "b-gray";
}

// ── Bar-segment colour for status ────────────────────────────────────────────
function statusBarColor(name) {
  const l = (name || "").toLowerCase();
  if (["done", "resolved", "closed", "fixed", "completed"].includes(l)) return "#22c55e";
  if (l.includes("progress") || l.includes("review") || l.includes("development")) return "#38bdf8";
  if (l.includes("blocked") || l.includes("hold") || l.includes("waiting")) return "#ef4444";
  if (l.includes("to do") || l.includes("open") || l.includes("backlog")) return "#94a3b8";
  return "#a78bfa";
}

const ASSIGNEE_COLORS = [
  "#38bdf8","#22c55e","#f59e0b","#a78bfa","#f472b6","#34d399","#fb923c","#60a5fa",
];

// ── Component ────────────────────────────────────────────────────────────────

export function TicketHistory({ ticketKey, backendUrl, token, jiraCreds, onClose }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);

    fetchIssueChangelog(backendUrl, token, ticketKey, jiraCreds)
      .then(d => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch(e => { if (!cancelled) { setError(e.message); setLoading(false); } });

    return () => { cancelled = true; };
  }, [ticketKey, backendUrl, token]);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="th-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="th-drawer">
        {/* ── Header ── */}
        <div className="th-header">
          <div className="th-header-left">
            <a
              className="th-key"
              href={`${(jiraCreds?.baseUrl || "").replace(/\/$/, "")}/browse/${ticketKey}`}
              target="_blank" rel="noreferrer"
            >{ticketKey}</a>
            {data && (
              <>
                <span className={`badge ${statusClass(data.status)}`}>{data.status}</span>
                <span className={`badge ${prioClass(data.priority)}`}>{data.priority}</span>
              </>
            )}
          </div>
          <button className="th-close" onClick={onClose} title="Close (Esc)">✕</button>
        </div>

        {data && <p className="th-summary">{data.summary}</p>}

        {/* ── Body ── */}
        <div className="th-body">
          {loading && <div className="th-loading">⏳ Loading ticket history…</div>}
          {error   && <div className="th-error">⚠️ {error}</div>}

          {data && !loading && (() => {
            const { statusSegs, assigneeSegs } = buildTimelines(data);
            const currentSeg = assigneeSegs[assigneeSegs.length - 1];
            const prevAssignee = assigneeSegs.length > 1 ? assigneeSegs[assigneeSegs.length - 2] : null;

            return (
              <>
                {/* ── Currently waiting on ── */}
                <div className="th-waiting-card">
                  <div className="th-waiting-label">Currently waiting on</div>
                  <div className="th-waiting-name">{currentSeg.name}</div>
                  <div className="th-waiting-sub">
                    for {fmtDays(currentSeg.days)}
                    {prevAssignee && (
                      <> · came from <strong>{prevAssignee.name}</strong> ({fmtDays(prevAssignee.days)} before handoff)</>
                    )}
                  </div>
                </div>

                {/* ── Status flow ── */}
                <Section title="Status Flow">
                  <div className="th-flow">
                    {statusSegs.map((seg, i) => (
                      <React.Fragment key={i}>
                        <div className={`th-flow-node${seg.isCurrent ? " th-flow-node-current" : ""}`}
                             style={{ "--node-color": statusBarColor(seg.name) }}>
                          <div className="th-flow-dot" style={{ background: statusBarColor(seg.name) }} />
                          <div className="th-flow-name">{seg.name}</div>
                          <div className="th-flow-days">{fmtDays(seg.days)}</div>
                        </div>
                        {i < statusSegs.length - 1 && <div className="th-flow-arrow">→</div>}
                      </React.Fragment>
                    ))}
                  </div>
                </Section>

                {/* ── Assignee time breakdown ── */}
                <Section title="Time Spent — Per Assignee">
                  <div className="th-assignee-table-wrap">
                    <table className="th-table">
                      <thead>
                        <tr>
                          <th>#</th><th>Assignee</th><th>Time Held</th><th>Assigned At</th><th>Handed Off At</th><th>Came From</th>
                        </tr>
                      </thead>
                      <tbody>
                        {assigneeSegs.map((seg, i) => (
                          <tr key={i}>
                            <td>
                              <span className="th-dot" style={{ background: ASSIGNEE_COLORS[i % ASSIGNEE_COLORS.length] }} />
                            </td>
                            <td style={{ fontWeight: seg.isCurrent ? 700 : 400 }}>
                              {seg.name}
                              {seg.isCurrent && <span className="th-current-badge"> ← now</span>}
                            </td>
                            <td style={{ color: seg.days > 5 ? "#ef4444" : seg.days > 2 ? "#f59e0b" : "#22c55e", fontWeight: 600 }}>
                              {fmtDays(seg.days)}
                            </td>
                            <td className="th-muted">{seg.from.toLocaleDateString()}</td>
                            <td className="th-muted">{seg.isCurrent ? "—" : seg.to.toLocaleDateString()}</td>
                            <td className="th-muted">{i === 0 ? "—" : assigneeSegs[i - 1].name}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Section>

                {/* ── Full event log ── */}
                <Section title="Change Log">
                  {data.changelog.length === 0
                    ? <p className="th-muted" style={{ padding: "8px 0" }}>No recorded changes.</p>
                    : (
                      <div className="th-log">
                        {[...data.changelog]
                          .sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime())
                          .map((ev, i) => (
                            <div key={ev.id || i} className="th-log-entry">
                              <div className="th-log-meta">
                                <strong>{ev.author.displayName}</strong>
                                <span className="th-muted">{new Date(ev.created).toLocaleString()}</span>
                              </div>
                              {ev.items.map((it, j) => (
                                <div key={j} className="th-log-item">
                                  <span className="th-log-field">{it.field}</span>
                                  {it.fromString && <><span className="th-muted"> {it.fromString}</span> →</>}
                                  <span style={{ color: it.field === "status" ? statusBarColor(it.toString) : "#e2e8f0" }}> {it.toString || "—"}</span>
                                </div>
                              ))}
                            </div>
                          ))}
                      </div>
                    )}
                </Section>
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="th-section">
      <h4 className="th-section-title">{title}</h4>
      {children}
    </div>
  );
}
