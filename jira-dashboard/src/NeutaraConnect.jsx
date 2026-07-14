import React, { useState } from "react";
import { loadSession } from "./jiraApi.js";

const DEFAULT_BACKEND = import.meta.env.VITE_BACKEND_URL || window.location.origin;

export function NeutaraConnect({ onLoad }) {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [jql,     setJql]     = useState("ORDER BY created DESC");

  async function handleLoad(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const session = loadSession();
      if (!session?.beToken) throw new Error("Not logged in. Please refresh and sign in again.");

      const url = `${DEFAULT_BACKEND}/api/neutara/live-issues?jql=${encodeURIComponent(jql.trim() || "ORDER BY created DESC")}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${session.beToken}` },
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message || `HTTP ${res.status}`);
      }

      const data = await res.json();
      if (!data.rows?.length) throw new Error("No tickets returned. Check the JQL or API key.");

      onLoad({
        rows:           data.rows,
        fileName:       "Neutara Live",
        sheet:          "Live",
        sheetNames:     ["Live"],
        columnNames:    [],
        mapping:        {},
        warnings:       data.warnings || [],
        jiraBackendUrl: DEFAULT_BACKEND,
        jiraToken:      session.beToken,
        jiraCreds:      null,
        total:          data.total,
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
        <span className="jc-icon">🎫</span>
        <h2>Load from Neutara</h2>
        <p>Fetch live tickets from neutaraticketing.cftools.live</p>
      </div>

      <div className="jc-fields">
        <label className="jc-label">
          JQL Filter <span style={{ color: "var(--muted)", fontWeight: 400 }}>(optional — leave blank for all tickets)</span>
          <input
            className="jc-input"
            value={jql}
            onChange={(e) => setJql(e.target.value)}
            placeholder="ORDER BY created DESC"
          />
        </label>
      </div>

      {error && <div className="jc-error">⚠️ {error}</div>}

      <button className="jc-btn" type="submit" disabled={loading}>
        {loading ? "Loading tickets…" : "Load All Tickets"}
      </button>

      {loading && (
        <p style={{ textAlign: "center", color: "var(--muted)", fontSize: 13, marginTop: 12 }}>
          Fetching all tickets — this may take a moment…
        </p>
      )}
    </form>
  );
}
