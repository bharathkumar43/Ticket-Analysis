import React, { useState } from "react";
import { loadSession } from "./jiraApi.js";

const DEFAULT_BACKEND = import.meta.env.VITE_BACKEND_URL || window.location.origin;

export function NeutaraConnect({ onLoad }) {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [progress, setProgress] = useState("");

  async function handleLoad(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setProgress("Connecting to Neutara…");
    try {
      const session = loadSession();
      if (!session?.beToken) throw new Error("Not logged in. Please refresh and sign in again.");

      setProgress("Fetching tickets (this may take a moment for large datasets)…");

      const res = await fetch(`${DEFAULT_BACKEND}/api/neutara/live-issues`, {
        headers: { Authorization: `Bearer ${session.beToken}` },
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message || `HTTP ${res.status}`);
      }

      const data = await res.json();
      if (!data.rows?.length) throw new Error("No tickets returned. Check if NEUTARA_API_KEY is set on the server.");

      setProgress("");
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
      setProgress("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="jc-form" onSubmit={handleLoad}>
      <div className="jc-header">
        <span className="jc-icon">🎫</span>
        <h2>Load from Neutara</h2>
        <p>Fetch all live tickets from neutaraticketing.cftools.live</p>
      </div>

      {error && <div className="jc-error" style={{ marginBottom: 16 }}>⚠️ {error}</div>}

      {progress && (
        <p style={{ textAlign: "center", color: "var(--muted)", fontSize: 13, marginBottom: 16 }}>
          ⏳ {progress}
        </p>
      )}

      <button className="jc-btn" type="submit" disabled={loading}>
        {loading ? "Loading tickets…" : "Load All Tickets"}
      </button>
    </form>
  );
}
