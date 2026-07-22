import React, { useState } from "react";
import { loadSession, fetchLiveIssues } from "./jiraApi.js";

const DEFAULT_BACKEND = import.meta.env.VITE_BACKEND_URL || window.location.origin;
const DEFAULT_JQL      = "project in (CFITS, PRI) ORDER BY updated DESC";

const JQL_PRESETS = [
  { label: "All tickets (CFITS + PRI)",       jql: "project in (CFITS, PRI) ORDER BY updated DESC" },
  { label: "Open tickets only",                jql: "project in (CFITS, PRI) AND statusCategory != Done ORDER BY updated DESC" },
  { label: "Updated in last 30 days",          jql: "project in (CFITS, PRI) AND updated >= -30d ORDER BY updated DESC" },
  { label: "CFITS only",                       jql: "project = CFITS ORDER BY updated DESC" },
  { label: "PRI only",                         jql: "project = PRI ORDER BY updated DESC" },
];

// Pulls tickets straight from Jira using the API key already configured on the
// backend (JIRA_BASE_URL / JIRA_EMAIL / JIRA_API_TOKEN in backend/.env) — no
// per-user credential entry, same one-click pattern as Load from Neutara.
export function JiraConnect({ onLoad }) {
  const [jql, setJql] = useState(DEFAULT_JQL);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleLoad(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const session = loadSession();
      if (!session?.beToken) throw new Error("Not logged in. Please refresh and sign in again.");

      const effectiveJql = jql.trim() || DEFAULT_JQL;
      const result = await fetchLiveIssues(DEFAULT_BACKEND, session.beToken, effectiveJql);

      onLoad({
        rows:           result.rows,
        fileName:       "Jira Live",
        sheet:          "Live",
        sheetNames:     ["Live"],
        columnNames:    [],
        mapping:        {},
        warnings:       result.warnings || [],
        jiraBackendUrl: DEFAULT_BACKEND,
        jiraToken:      session.beToken,
        jiraCreds:      null,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="jc-form" onSubmit={handleLoad}>
      <div className="jc-header">
        <span className="jc-icon">🔗</span>
        <h2>Load from Jira</h2>
        <p>Fetch live tickets directly from Jira using the configured API key</p>
      </div>

      <div className="jc-fields">
        <label className="jc-label">
          JQL Query
          <select className="jc-input jc-select"
            value={JQL_PRESETS.some(p => p.jql === jql) ? jql : "__custom__"}
            onChange={e => { if (e.target.value !== "__custom__") setJql(e.target.value); }}>
            {JQL_PRESETS.map(p => (
              <option key={p.jql} value={p.jql}>{p.label}</option>
            ))}
            <option value="__custom__">Custom…</option>
          </select>
          <textarea className="jc-input jc-textarea" value={jql}
            onChange={(e) => setJql(e.target.value)}
            placeholder="project in (CFITS, PRI) ORDER BY updated DESC"
            rows={2} style={{ marginTop: 6 }} />
        </label>
      </div>

      {error && <div className="jc-error" style={{ marginBottom: 16 }}>⚠️ {error}</div>}

      <button className="jc-btn" type="submit" disabled={loading}>
        {loading ? "Loading tickets…" : "Load Tickets from Jira"}
      </button>
    </form>
  );
}
