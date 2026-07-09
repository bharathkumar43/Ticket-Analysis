import React, { useState, useEffect } from "react";
import { loginBackend, signupBackend, saveSession } from "./jiraApi.js";

const DEFAULT_BACKEND = import.meta.env.VITE_BACKEND_URL || "http://localhost:3600";

export function Login({ onLoggedIn, onSkip }) {
  const [mode,       setMode]       = useState("login");
  const [backendUrl, setBackendUrl] = useState(DEFAULT_BACKEND);
  const [username,   setUsername]   = useState("");
  const [password,   setPassword]   = useState("");
  const [email,      setEmail]      = useState("");
  const [error,      setError]      = useState(null);
  const [busy,       setBusy]       = useState(false);

  // Handle redirect back from Microsoft server-side OAuth
  useEffect(() => {
    const params   = new URLSearchParams(window.location.search);
    const msToken  = params.get("ms_token");
    const msError  = params.get("ms_error");

    if (msToken) {
      window.history.replaceState({}, "", window.location.pathname);
      saveSession(DEFAULT_BACKEND, msToken, "", "", "");
      onLoggedIn({ backendUrl: DEFAULT_BACKEND, beToken: msToken, jiraCreds: null });
    } else if (msError) {
      window.history.replaceState({}, "", window.location.pathname);
      setError("Microsoft login failed: " + decodeURIComponent(msError));
    }
  }, []);

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
      setError(err.message || `${mode === "signup" ? "Sign up" : "Login"} failed.`);
    } finally {
      setBusy(false);
    }
  }

  function handleMicrosoftLogin() {
    window.location.href = `${backendUrl}/api/auth/microsoft/login`;
  }

  return (
    <div className="import-wrap">
      <div className="login-card">
        <img src="/logo.jpg" alt="CloudFuze" className="login-logo" />
        <h2>{mode === "signup" ? "Create an account" : "Sign in"}</h2>
        <p className="import-sub">Migration Ops Dashboard</p>

        <div className="login-tabs">
          <button className={"login-tab" + (mode === "login"  ? " active" : "")} onClick={() => switchMode("login")}>Sign In</button>
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
                placeholder={mode === "signup" ? "At least 6 characters" : "••••••••"}
                required minLength={mode === "signup" ? 6 : undefined} />
            </label>
            <details className="jc-advanced">
              <summary className="jc-advanced-toggle">Backend connection settings</summary>
              <div className="jc-fields" style={{ marginTop: 10 }}>
                <label className="jc-label">
                  Backend URL
                  <input className="jc-input" value={backendUrl} onChange={(e) => setBackendUrl(e.target.value.trim())}
                    placeholder="http://localhost:6000" />
                </label>
              </div>
            </details>
          </div>

          {error && <div className="jc-error">⚠️ {error}</div>}

          <button className="jc-btn" type="submit" disabled={busy}>
            {busy ? (mode === "signup" ? "Creating account…" : "Signing in…") : (mode === "signup" ? "Sign Up" : "Sign In")}
          </button>
        </form>

        <div className="login-divider"><span>or</span></div>

        <button className="ms-btn" onClick={handleMicrosoftLogin} type="button">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 21 21">
            <rect x="1"  y="1"  width="9" height="9" fill="#f25022"/>
            <rect x="11" y="1"  width="9" height="9" fill="#7fba00"/>
            <rect x="1"  y="11" width="9" height="9" fill="#00a4ef"/>
            <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
          </svg>
          Sign in with Microsoft
        </button>

        <button className="login-skip" onClick={onSkip}>
          Continue without signing in — use sample/local data →
        </button>
      </div>
    </div>
  );
}
