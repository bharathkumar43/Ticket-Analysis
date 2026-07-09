import React, { useState, useEffect } from "react";
import { saveSession } from "./jiraApi.js";

const DEFAULT_BACKEND = import.meta.env.VITE_BACKEND_URL || window.location.origin;

export function Login({ onLoggedIn }) {
  const [error,  setError]  = useState(null);
  const [loading, setLoading] = useState(false);

  // Handle redirect back from Microsoft OAuth callback
  useEffect(() => {
    const params  = new URLSearchParams(window.location.search);
    const msToken = params.get("ms_token");
    const msError = params.get("ms_error");

    if (msToken) {
      window.history.replaceState({}, "", window.location.pathname);
      saveSession(DEFAULT_BACKEND, msToken, "", "", "");
      onLoggedIn({ backendUrl: DEFAULT_BACKEND, beToken: msToken, jiraCreds: null });
    } else if (msError) {
      window.history.replaceState({}, "", window.location.pathname);
      setError("Microsoft sign-in failed: " + decodeURIComponent(msError).replace(/_/g, " "));
    }
  }, []);

  function handleMicrosoftLogin() {
    setLoading(true);
    window.location.href = `${DEFAULT_BACKEND}/api/auth/microsoft/login`;
  }

  return (
    <div className="import-wrap">
      <div className="login-card login-card-ms">
        <img src="/logo.jpg" alt="CloudFuze" className="login-logo" />
        <h2 className="login-heading">Migration Ops Dashboard</h2>
        <p className="import-sub">Sign in with your CloudFuze Microsoft account to continue.</p>

        {error && (
          <div className="jc-error" style={{ marginBottom: 16 }}>⚠️ {error}</div>
        )}

        <button
          className="ms-btn ms-btn-large"
          onClick={handleMicrosoftLogin}
          disabled={loading}
          type="button"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 21 21">
            <rect x="1"  y="1"  width="9" height="9" fill="#f25022"/>
            <rect x="11" y="1"  width="9" height="9" fill="#7fba00"/>
            <rect x="1"  y="11" width="9" height="9" fill="#00a4ef"/>
            <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
          </svg>
          {loading ? "Redirecting to Microsoft…" : "Sign in with Microsoft"}
        </button>

        <p className="login-footer-note">
          Your Microsoft account is used to sign in and send action item reminder emails on your behalf.
        </p>
      </div>
    </div>
  );
}
