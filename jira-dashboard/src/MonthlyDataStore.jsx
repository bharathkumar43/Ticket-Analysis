import React, { useState, useEffect, useCallback } from "react";
import {
  listMonthlyUploads,
  saveMonthlyUpload,
  getMonthlyUploadRows,
  compareMonthlyUploads,
  deleteMonthlyUpload,
} from "./jiraApi.js";

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function decodeUser(token) {
  try { return JSON.parse(atob(token.split(".")[1])).userId || null; } catch { return null; }
}

// ─── Main panel ─────────────────────────────────────────────────────────────

export function MonthlyDataStore({ jiraCtx, uploadType, currentRows, currentFileName, onLoadRows }) {
  const [uploads,        setUploads]        = useState([]);
  const [loading,        setLoading]        = useState(false);
  const [saving,         setSaving]         = useState(false);
  const [error,          setError]          = useState(null);
  const [showSaveForm,   setShowSaveForm]   = useState(false);
  const [saveMonth,      setSaveMonth]      = useState(new Date().getMonth() + 1);
  const [saveYear,       setSaveYear]       = useState(new Date().getFullYear());
  const [compareIds,     setCompareIds]     = useState([]);
  const [compareData,    setCompareData]    = useState(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [loadingId,      setLoadingId]      = useState(null);

  const connected = !!(jiraCtx?.backendUrl && jiraCtx?.beToken);

  const refresh = useCallback(async () => {
    if (!connected) return;
    setLoading(true);
    setError(null);
    try {
      const { uploads: list } = await listMonthlyUploads(jiraCtx.backendUrl, jiraCtx.beToken, uploadType);
      setUploads(list);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [connected, jiraCtx, uploadType]);

  useEffect(() => { refresh(); }, [refresh]);

  async function handleSave() {
    if (!connected || !currentRows?.length) return;
    setSaving(true);
    setError(null);
    try {
      await saveMonthlyUpload(jiraCtx.backendUrl, jiraCtx.beToken, {
        month: saveMonth,
        year:  saveYear,
        uploadType,
        fileName:   currentFileName || "upload.xlsx",
        rows:       currentRows,
        uploadedBy: decodeUser(jiraCtx.beToken),
      });
      setShowSaveForm(false);
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleLoad(id, upload) {
    if (!connected) return;
    setLoadingId(id);
    setError(null);
    try {
      const { rows, upload: meta } = await getMonthlyUploadRows(jiraCtx.backendUrl, jiraCtx.beToken, id);
      onLoadRows(rows, meta.fileName, meta);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingId(null);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm("Delete this month's data?")) return;
    try {
      await deleteMonthlyUpload(jiraCtx.backendUrl, jiraCtx.beToken, id);
      setUploads((prev) => prev.filter((u) => u.id !== id));
      setCompareIds((prev) => prev.filter((i) => i !== id));
      if (compareIds.includes(id)) setCompareData(null);
    } catch (e) {
      setError(e.message);
    }
  }

  function toggleCompare(id) {
    setCompareData(null);
    setCompareIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id].slice(-2)
    );
  }

  async function runCompare() {
    if (compareIds.length < 2) return;
    setCompareLoading(true);
    setError(null);
    try {
      const { months } = await compareMonthlyUploads(jiraCtx.backendUrl, jiraCtx.beToken, compareIds);
      setCompareData(months);
    } catch (e) {
      setError(e.message);
    } finally {
      setCompareLoading(false);
    }
  }

  if (!connected) {
    return (
      <div className="mds-panel">
        <div className="mds-not-connected">
          <span>🔒</span>
          <span>Sign in to save and load month-wise data from the database.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="mds-panel">
      {/* Header row */}
      <div className="mds-header-row">
        <span className="mds-title">📁 Monthly Archive</span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {currentRows?.length > 0 && !showSaveForm && (
            <button className="jc-btn mds-save-trigger" onClick={() => setShowSaveForm(true)}>
              💾 Save current data
            </button>
          )}
          <button className="btn-sm" onClick={refresh} title="Refresh">↻</button>
        </div>
      </div>

      {/* Save form */}
      {showSaveForm && (
        <div className="mds-save-form">
          <span className="mds-form-label">Save as:</span>
          <select className="mds-select" value={saveMonth} onChange={(e) => setSaveMonth(Number(e.target.value))}>
            {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <input
            className="mds-year-input"
            type="number" min={2020} max={2035}
            value={saveYear}
            onChange={(e) => setSaveYear(Number(e.target.value))}
          />
          <button className="jc-btn mds-confirm" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Confirm Save"}
          </button>
          <button className="btn-sm" onClick={() => { setShowSaveForm(false); setError(null); }}>Cancel</button>
          <span className="mds-form-hint">
            {currentRows?.length} rows · {currentFileName}
            {uploads.some((u) => u.month === saveMonth && u.year === saveYear)
              ? " · ⚠️ Will replace existing data for this month"
              : ""}
          </span>
        </div>
      )}

      {error && <div className="jc-error" style={{ margin: "8px 0" }}>⚠️ {error}</div>}

      {/* Saved list */}
      {loading ? (
        <p className="mds-hint">Loading…</p>
      ) : uploads.length === 0 ? (
        <p className="mds-hint">No saved months yet — upload an Excel and click "Save current data" to start your archive.</p>
      ) : (
        <>
          <div className="mds-list">
            {uploads.map((u) => {
              const isSelected = compareIds.includes(u.id);
              return (
                <div key={u.id} className={"mds-item" + (isSelected ? " mds-item-selected" : "")}>
                  <div className="mds-item-meta">
                    <span className="mds-item-month">{MONTH_NAMES[u.month - 1]} {u.year}</span>
                    <span className="mds-item-detail">{u.rowCount} rows · {u.fileName}</span>
                    <span className="mds-item-detail mds-item-by">
                      {u.uploadedBy ? `Saved by ${u.uploadedBy}` : ""}
                    </span>
                  </div>
                  <div className="mds-item-actions">
                    <button
                      className="btn-sm mds-load-btn"
                      onClick={() => handleLoad(u.id, u)}
                      disabled={loadingId === u.id}
                    >
                      {loadingId === u.id ? "Loading…" : "Load"}
                    </button>
                    <button
                      className={"btn-sm mds-compare-btn" + (isSelected ? " mds-compare-btn-on" : "")}
                      onClick={() => toggleCompare(u.id)}
                    >
                      {isSelected ? "✓ Comparing" : "Compare"}
                    </button>
                    <button className="btn-sm mds-del-btn" onClick={() => handleDelete(u.id)}>✕</button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Compare action bar */}
          {compareIds.length > 0 && (
            <div className="mds-compare-bar">
              <span className="mds-compare-bar-label">
                {compareIds.length === 2
                  ? "2 months selected for comparison"
                  : "Select 1 more month to compare"}
              </span>
              {compareIds.length === 2 && (
                <button className="jc-btn mds-run-compare" onClick={runCompare} disabled={compareLoading}>
                  {compareLoading ? "Comparing…" : "Run Comparison →"}
                </button>
              )}
              <button className="btn-sm" onClick={() => { setCompareIds([]); setCompareData(null); }}>
                Clear
              </button>
            </div>
          )}

          {compareData && <CompareView months={compareData} />}
        </>
      )}
    </div>
  );
}

// ─── Compare view ────────────────────────────────────────────────────────────

function CompareView({ months }) {
  const [section, setSection] = useState("status");

  const allStatuses   = [...new Set(months.flatMap((m) => Object.keys(m.analytics.byStatus)))].sort();
  const allPriorities = [...new Set(months.flatMap((m) => Object.keys(m.analytics.byPriority)))];
  const PRIORITY_ORDER = ["Critical", "Highest", "High", "Medium", "Low", "Lowest", "None"];
  allPriorities.sort((a, b) => {
    const ai = PRIORITY_ORDER.indexOf(a), bi = PRIORITY_ORDER.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  // Top assignees by combined total
  const assigneeTotals = {};
  for (const m of months)
    for (const [a, c] of Object.entries(m.analytics.byAssignee))
      assigneeTotals[a] = (assigneeTotals[a] || 0) + Number(c);
  const topAssignees = Object.entries(assigneeTotals)
    .sort((a, b) => b[1] - a[1]).slice(0, 10).map(([a]) => a);

  function delta(a, b) {
    const d = b - a;
    if (d === 0) return <span className="mds-delta-zero">—</span>;
    return d > 0
      ? <span className="mds-delta-up">+{d}</span>
      : <span className="mds-delta-down">{d}</span>;
  }

  const rows = section === "status"   ? allStatuses.map((s) => ({ label: s, vals: months.map((m) => m.analytics.byStatus[s]   || 0) }))
             : section === "priority" ? allPriorities.map((p) => ({ label: p, vals: months.map((m) => m.analytics.byPriority[p] || 0) }))
             :                         topAssignees.map((a) => ({ label: a, vals: months.map((m) => m.analytics.byAssignee[a] || 0) }));

  return (
    <div className="mds-compare-result">
      <div className="mds-compare-title-row">
        <h3 className="mds-compare-heading">Month Comparison</h3>
        <div className="mds-compare-tabs">
          {[["status","By Status"],["priority","By Priority"],["assignee","By Assignee"]].map(([k, label]) => (
            <button key={k} className={"mds-compare-tab" + (section === k ? " active" : "")} onClick={() => setSection(k)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mds-compare-table-wrap">
        <table className="mds-compare-table">
          <thead>
            <tr>
              <th>Metric</th>
              {months.map((m) => <th key={m.id}>{MONTH_NAMES[m.month - 1]} {m.year}</th>)}
              {months.length === 2 && <th>Change</th>}
            </tr>
          </thead>
          <tbody>
            <tr className="mds-total-row">
              <td>Total Tickets</td>
              {months.map((m) => <td key={m.id}><strong>{m.rowCount}</strong></td>)}
              {months.length === 2 && <td>{delta(months[0].rowCount, months[1].rowCount)}</td>}
            </tr>
            {rows.map(({ label, vals }) => (
              <tr key={label}>
                <td>{label}</td>
                {vals.map((v, i) => <td key={i}>{v}</td>)}
                {months.length === 2 && <td>{delta(vals[0], vals[1])}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
