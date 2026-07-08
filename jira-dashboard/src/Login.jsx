import React, { useState } from "react";
import { loginBackend, signupBackend, saveSession } from "./jiraApi.js";

const DEFAULT_BACKEND = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";

export function Login({ onLoggedIn, onSkip }) {
  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [backendUrl, setBackendUrl] = useState(DEFAULT_BACKEND);
  const [username,   setUsername]   = useState("");
  const [password,   setPassword]   = useState("");
  const [email,      setEmail]      = useState("");
  const [error,      setError]      = useState(null);
  const [busy,       setBusy]       = useState(false);

  function switchMode(next) {
    setMode(next);
    setError(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const token = mode === "signup"
        ? await signupBackend(backendUrl, username.trim(), password, email.trim())
        : await loginBackend(backendUrl, username.trim(), password);
      saveSession(backendUrl, token, "", "", "");
      onLoggedIn({ backendUrl, beToken: token, jiraCreds: null });
    } catch (err) {
      setError(err.message || `${mode === "signup" ? "Sign up" : "Login"} failed. Check the details and backend URL.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="import-wrap">
      <div className="login-card">
        <img src="/logo.jpg" alt="CloudFuze" className="login-logo" />
        <h2>{mode === "signup" ? "Create an account" : "Sign in"}</h2>
        <p className="import-sub">Migration Ops Dashboard</p>

        <div className="login-tabs">
          <button className={"login-tab" + (mode === "login" ? " active" : "")} onClick={() => switchMode("login")}>Sign In</button>
          <button className={"login-tab" + (mode === "signup" ? " active" : "")} onClick={() => switchMode("signup")}>Sign Up</button>
        </div>

        <form className="jc-form" onSubmit={handleSubmit} style={{ marginTop: 8 }}>
          <div className="jc-fields">
            <label className="jc-label">
              Username
              <input className="jc-input" value={username} onChange={(e) => setUsername(e.target.value)}
                placeholder={mode === "signup" ? "Choose a username" : "admin"} autoFocus required />
            </label>
            {mode === "signup" && (
              <label className="jc-label">
                Email <span style={{ color: "var(--muted)", fontWeight: 400 }}>(optional)</span>
                <input className="jc-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com" />
              </label>
            )}
            <label className="jc-label">
              Password
              <input className="jc-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === "signup" ? "At least 6 characters" : "••••••••"} required minLength={mode === "signup" ? 6 : undefined} />
            </label>
            <details className="jc-advanced">
              <summary className="jc-advanced-toggle">Backend connection settings</summary>
              <div className="jc-fields" style={{ marginTop: 10 }}>
                <label className="jc-label">
                  Backend URL
                  <input className="jc-input" value={backendUrl} onChange={(e) => setBackendUrl(e.target.value.trim())}
                    placeholder="http://localhost:3001" />
                </label>
              </div>
            </details>
          </div>

          {error && <div className="jc-error">⚠️ {error}</div>}

          <button className="jc-btn" type="submit" disabled={busy}>
            {busy ? (mode === "signup" ? "Creating account…" : "Signing in…") : (mode === "signup" ? "Sign Up" : "Sign In")}
          </button>
        </form>

        <button className="login-skip" onClick={onSkip}>
          Continue without signing in — use sample/local data →
        </button>
      </div>
    </div>
  );
}
