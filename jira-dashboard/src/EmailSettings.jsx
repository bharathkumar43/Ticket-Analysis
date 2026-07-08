import React, { useEffect, useState } from "react";
import { fetchEmailSettings, sendTestEmail } from "./emailSettingsApi.js";

export function EmailSettings({ jiraCtx }) {
  const backendConnected = !!(jiraCtx?.backendUrl && jiraCtx?.beToken);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [testTo, setTestTo] = useState("");
  const [testMsg, setTestMsg] = useState(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!backendConnected) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    fetchEmailSettings(jiraCtx.backendUrl, jiraCtx.beToken)
      .then((data) => { if (!cancelled) setSettings(data); })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [backendConnected, jiraCtx?.backendUrl, jiraCtx?.beToken]);

  async function handleSendTest(e) {
    e.preventDefault();
    setSending(true);
    setTestMsg(null);
    try {
      const res = await sendTestEmail(jiraCtx.backendUrl, jiraCtx.beToken, testTo.trim());
      setTestMsg({ type: "ok", text: `Test email sent to ${res.to}. Check the inbox (and spam folder).` });
    } catch (err) {
      setTestMsg({ type: "error", text: err.message || "Failed to send test email." });
    } finally {
      setSending(false);
    }
  }

  if (!backendConnected) {
    return (
      <div className="empty-state" style={{ marginTop: 24 }}>
        <div className="es-icon">✉️</div>
        <h3>Sign in to view Email Settings</h3>
        <p>Email configuration and sending are handled by the backend — sign in or connect to Jira to see live status.</p>
      </div>
    );
  }

  if (loading) return <div className="loading">Loading email settings…</div>;

  if (error) {
    return <div className="import-error">⚠️ Couldn't load email settings: {error}</div>;
  }

  const { configured, host, port, from, cronSchedule, stats } = settings;

  return (
    <div className="ai-wrap">
      <h2 className="ai-title" style={{ marginBottom: 2 }}>Email Settings</h2>
      <p className="ai-subtitle" style={{ marginBottom: 20 }}>Live status of the backend's email/reminder configuration.</p>

      <div className={"card full mm-status-card " + (configured ? "mm-status-ok" : "mm-status-off")} style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ fontSize: 28 }}>{configured ? "✅" : "⚠️"}</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>
              {configured ? "Email sending is configured and active" : "Email sending is not configured"}
            </div>
            <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>
              {configured
                ? <>SMTP host <strong>{host}:{port}</strong> · sending as <strong>{from}</strong></>
                : "Set SMTP_HOST, SMTP_USER, SMTP_PASS (and optionally MAIL_FROM) in the backend's .env to activate."}
            </div>
          </div>
        </div>
      </div>

      <div className="ai-kpis" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <div className="ai-kpi">
          <div className="ai-kpi-icon ai-icon-blue">📧</div>
          <div><div className="ai-kpi-value">{stats.totalWithEmail}</div><div className="ai-kpi-label">Items with owner email</div></div>
        </div>
        <div className="ai-kpi">
          <div className="ai-kpi-icon ai-icon-green">📤</div>
          <div><div className="ai-kpi-value">{stats.remindersSentToday}</div><div className="ai-kpi-label">Reminders sent today</div></div>
        </div>
        <div className="ai-kpi">
          <div className="ai-kpi-icon ai-icon-indigo">📨</div>
          <div><div className="ai-kpi-value">{stats.remindersSentTotal}</div><div className="ai-kpi-label">Reminders sent (all time)</div></div>
        </div>
        <div className="ai-kpi">
          <div className="ai-kpi-icon ai-icon-amber">⏳</div>
          <div><div className="ai-kpi-value">{stats.pendingReminders}</div><div className="ai-kpi-label">Due/overdue, pending</div></div>
        </div>
      </div>

      <div className="card full" style={{ marginTop: 20 }}>
        <h3>Automatic reminders</h3>
        <p style={{ fontSize: 13.5, color: "var(--text)" }}>
          Cron schedule: <code className="mm-code">{cronSchedule}</code> — checks daily for action items
          due tomorrow or overdue, and emails the owner (at most once per day per item).
        </p>
      </div>

      <div className="card full" style={{ marginTop: 20 }}>
        <h3>Send a test email</h3>
        <p style={{ fontSize: 13.5, color: "var(--muted)", marginTop: -6 }}>
          Verifies the SMTP connection actually works, end to end.
        </p>
        <form onSubmit={handleSendTest} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label className="jc-label" style={{ flex: "1 1 260px" }}>
            Send to
            <input className="jc-input" type="email" required value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@company.com" />
          </label>
          <button className="jc-btn" type="submit" disabled={sending} style={{ padding: "9px 20px" }}>
            {sending ? "Sending…" : "Send Test Email"}
          </button>
        </form>
        {testMsg && (
          <div className={testMsg.type === "ok" ? "import-hint" : "import-error"} style={{ marginTop: 12 }}>
            {testMsg.type === "ok" ? "✅ " : "⚠️ "}{testMsg.text}
          </div>
        )}
      </div>
    </div>
  );
}
