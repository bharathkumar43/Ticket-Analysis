import React, { useState } from "react";
import {
  loginBackend, fetchJiraConfig, fetchLiveIssues, saveSession,
} from "./jiraApi.js";

const DEFAULT_BACKEND  = import.meta.env.VITE_BACKEND_URL || "http://localhost:3600";
const DEFAULT_JIRA_URL = "https://cf2020.atlassian.net";
const DEFAULT_JQL      = "project in (CFITS, PRI) ORDER BY updated DESC";

const JQL_PRESETS = [
  { label: "All tickets (CFITS + PRI)",       jql: "project in (CFITS, PRI) ORDER BY updated DESC" },
  { label: "Open tickets only",                jql: "project in (CFITS, PRI) AND statusCategory != Done ORDER BY updated DESC" },
  { label: "Updated in last 30 days",          jql: "project in (CFITS, PRI) AND updated >= -30d ORDER BY updated DESC" },
  { label: "CFITS only",                       jql: "project = CFITS ORDER BY updated DESC" },
  { label: "PRI only",                         jql: "project = PRI ORDER BY updated DESC" },
];

export function JiraConnect({ onLoad }) {
  // Backend credentials (app login)
  const [backendUrl, setBackendUrl] = useState(DEFAULT_BACKEND);
  const [username,   setUsername]   = useState("admin");
  const [password,   setPassword]   = useState("changeme");

  // Jira credentials (your personal Jira access)
  const [jiraBaseUrl, setJiraBaseUrl] = useState(DEFAULT_JIRA_URL);
  const [jiraEmail,   setJiraEmail]   = useState("laxman.kadari@cloudfuze.com");
  const [jiraToken,   setJiraToken]   = useState("");

  // JQL
  const [jql,  setJql]  = useState(DEFAULT_JQL);

  // UI state
  const [step,       setStep]       = useState("idle");
  const [error,      setError]      = useState(null);
  const [testResult, setTestResult] = useState(null); // { count, jql } | null
  const [testing,    setTesting]    = useState(false);

  async function handleTestJql(e) {
    e.preventDefault();
    setTestResult(null);
    setError(null);
    const jiraCreds = {
      email:    jiraEmail.trim(),
      apiToken: jiraToken.trim(),
      baseUrl:  jiraBaseUrl.replace(/\/$/, ""),
    };
    if (!jiraCreds.email || !jiraCreds.apiToken) {
      setError("Enter your Jira email and API token first.");
      return;
    }
    const effectiveJql = jql.trim() || DEFAULT_JQL;
    setTesting(true);
    try {
      const beToken = await loginBackend(backendUrl, username, password);
      const result  = await fetchLiveIssues(backendUrl, beToken, effectiveJql, jiraCreds);
      setTestResult({ count: result.rows.length, jql: effectiveJql });
    } catch (err) {
      setError("Test failed: " + err.message);
    } finally {
      setTesting(false);
    }
  }

  async function handleFetch(e) {
    e.preventDefault();
    setError(null);

    const jiraCreds = {
      email:   jiraEmail.trim(),
      apiToken: jiraToken.trim(),
      baseUrl:  jiraBaseUrl.replace(/\/$/, ""),
    };

    if (!jiraCreds.email || !jiraCreds.apiToken) {
      setError("Enter your Jira email and API token.");
      return;
    }

    try {
      // 1. Login to backend
      setStep("login");
      const beToken = await loginBackend(backendUrl, username, password);

      // 2. Get default JQL if blank
      let effectiveJql = jql.trim();
      if (!effectiveJql) {
        setStep("config");
        try {
          const cfg = await fetchJiraConfig(backendUrl, beToken);
          effectiveJql = cfg.jql || "";
          if (effectiveJql) setJql(effectiveJql);
        } catch (_) {}
      }
      if (!effectiveJql) effectiveJql = DEFAULT_JQL;

      // 3. Fetch tickets from Jira
      setStep("fetch");
      const result = await fetchLiveIssues(backendUrl, beToken, effectiveJql, jiraCreds);

      // 4. Save session
      saveSession(backendUrl, beToken, jiraCreds.email, jiraCreds.apiToken, jiraCreds.baseUrl);

      setStep("done");
      onLoad({
        rows:           result.rows,
        fileName:       "Jira Live",
        sheet:          "Live",
        sheetNames:     ["Live"],
        columnNames:    [],
        mapping:        {},
        warnings:       result.warnings || [],
        jiraBackendUrl: backendUrl,
        jiraToken:      beToken,
        jiraCreds,
      });
    } catch (err) {
      setError(err.message);
      setStep("idle");
    }
  }

  const busy = step !== "idle" && step !== "done";
  const stepLabel = {
    login:  "Authenticating with backend…",
    config: "Loading Jira configuration…",
    fetch:  "Fetching tickets from Jira…",
  }[step];

  return (
    <form className="jc-form" onSubmit={handleFetch}>
      <div className="jc-header">
        <span className="jc-icon">🔗</span>
        <h2>Connect to Jira</h2>
        <p>Enter your Jira credentials to pull live ticket data</p>
      </div>

      {/* ── Jira credentials ── */}
      <div className="jc-section-label">Your Jira Credentials</div>
      <div className="jc-fields">
        <label className="jc-label">
          Jira Base URL
          <input className="jc-input" value={jiraBaseUrl}
            onChange={(e) => setJiraBaseUrl(e.target.value.trim())}
            placeholder="https://yourcompany.atlassian.net" required />
        </label>
        <label className="jc-label">
          Jira Email
          <input className="jc-input" type="email" value={jiraEmail}
            onChange={(e) => setJiraEmail(e.target.value)}
            placeholder="you@company.com" required />
        </label>
        <label className="jc-label">
          Jira API Token
          <input className="jc-input" type="password" value={jiraToken}
            onChange={(e) => setJiraToken(e.target.value)}
            placeholder="Your Jira API token" required />
          <span className="jc-hint">
            Generate at <strong>id.atlassian.net → Security → API tokens</strong>
          </span>
        </label>
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
            onChange={(e) => { setJql(e.target.value); setTestResult(null); }}
            placeholder="project in (CFITS, PRI) ORDER BY updated DESC"
            rows={2} style={{ marginTop: 6 }} />
          <div className="jc-jql-row">
            <button type="button" className="jc-test-btn" onClick={handleTestJql} disabled={testing || busy}>
              {testing ? "Testing…" : "Test Query"}
            </button>
            {testResult && (
              <span className={`jc-test-result ${testResult.count === 0 ? "jc-test-zero" : "jc-test-ok"}`}>
                {testResult.count === 0
                  ? "⚠️ 0 tickets — check your JQL"
                  : `✓ ${testResult.count} ticket${testResult.count !== 1 ? "s" : ""} found`}
              </span>
            )}
          </div>
        </label>
      </div>

      {/* ── Backend credentials (collapsible) ── */}
      <details className="jc-advanced">
        <summary className="jc-advanced-toggle">Backend connection settings</summary>
        <div className="jc-fields" style={{ marginTop: 10 }}>
          <label className="jc-label">
            Backend URL
            <input className="jc-input" value={backendUrl}
              onChange={(e) => setBackendUrl(e.target.value.trim())}
              placeholder="http://localhost:3001" />
          </label>
          <label className="jc-label">
            Username
            <input className="jc-input" value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin" />
          </label>
          <label className="jc-label">
            Password
            <input className="jc-input" type="password" value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••" />
          </label>
        </div>
      </details>

      {stepLabel && (
        <div className="jc-step-label">
          <span className="jc-spinner">⏳</span> {stepLabel}
        </div>
      )}

      {error && <div className="jc-error">⚠️ {error}</div>}

      <button className="jc-btn" type="submit" disabled={busy}>
        {busy ? "Connecting…" : "Fetch Tickets from Jira"}
      </button>
    </form>
  );
}
