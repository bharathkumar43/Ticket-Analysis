const SESSION_KEY_TOKEN    = "jira_be_token";
const SESSION_KEY_URL      = "jira_be_url";
const SESSION_KEY_JE_EMAIL = "jira_email";
const SESSION_KEY_JE_TOKEN = "jira_api_token";
const SESSION_KEY_JE_URL   = "jira_base_url";

export function saveSession(backendUrl, beToken, jiraEmail, jiraApiToken, jiraBaseUrl) {
  sessionStorage.setItem(SESSION_KEY_URL,      backendUrl);
  sessionStorage.setItem(SESSION_KEY_TOKEN,    beToken);
  sessionStorage.setItem(SESSION_KEY_JE_EMAIL, jiraEmail);
  sessionStorage.setItem(SESSION_KEY_JE_TOKEN, jiraApiToken);
  sessionStorage.setItem(SESSION_KEY_JE_URL,   jiraBaseUrl);
}

export function loadSession() {
  const backendUrl   = sessionStorage.getItem(SESSION_KEY_URL);
  const beToken      = sessionStorage.getItem(SESSION_KEY_TOKEN);
  const jiraEmail    = sessionStorage.getItem(SESSION_KEY_JE_EMAIL);
  const jiraApiToken = sessionStorage.getItem(SESSION_KEY_JE_TOKEN);
  const jiraBaseUrl  = sessionStorage.getItem(SESSION_KEY_JE_URL);
  if (backendUrl && beToken) {
    return { backendUrl, beToken, jiraEmail, jiraApiToken, jiraBaseUrl };
  }
  return null;
}

export function clearSession() {
  [SESSION_KEY_URL, SESSION_KEY_TOKEN, SESSION_KEY_JE_EMAIL,
   SESSION_KEY_JE_TOKEN, SESSION_KEY_JE_URL].forEach(k => sessionStorage.removeItem(k));
}

async function apiFetch(url, opts = {}) {
  const res = await fetch(url, opts);
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      msg = body?.error?.message || body?.message || msg;
    } catch (_) {}
    throw new Error(msg);
  }
  return res.json();
}

export async function loginBackend(backendUrl, username, password) {
  const data = await apiFetch(`${backendUrl}/api/auth/login`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ username, password }),
  });
  return data.token;
}

export async function loginMicrosoft(backendUrl, accessToken) {
  const data = await apiFetch(`${backendUrl}/api/auth/microsoft`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ accessToken }),
  });
  return data.token;
}

export async function signupBackend(backendUrl, username, password, email) {
  const data = await apiFetch(`${backendUrl}/api/auth/signup`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ username, password, email }),
  });
  return data.token;
}

export async function fetchJiraConfig(backendUrl, beToken) {
  return apiFetch(`${backendUrl}/api/jira/config`, {
    headers: { Authorization: `Bearer ${beToken}` },
  });
}

// Build the Jira credential headers to send with every live-data request
function jiraHeaders(beToken, jiraCreds) {
  const h = { Authorization: `Bearer ${beToken}` };
  if (jiraCreds?.email && jiraCreds?.apiToken && jiraCreds?.baseUrl) {
    h["x-jira-email"]   = jiraCreds.email;
    h["x-jira-token"]   = jiraCreds.apiToken;
    h["x-jira-baseurl"] = jiraCreds.baseUrl;
  }
  return h;
}

export async function fetchLiveIssues(backendUrl, beToken, jql, jiraCreds) {
  return apiFetch(
    `${backendUrl}/api/jira/live-issues?jql=${encodeURIComponent(jql)}`,
    { headers: jiraHeaders(beToken, jiraCreds) }
  );
}

export async function fetchIssueChangelog(backendUrl, beToken, key, jiraCreds) {
  return apiFetch(
    `${backendUrl}/api/jira/issue/${encodeURIComponent(key)}/changelog`,
    { headers: jiraHeaders(beToken, jiraCreds) }
  );
}

// ── Monthly Data Storage ─────────────────────────────────────────────────────

function authHeader(beToken) {
  return { Authorization: `Bearer ${beToken}`, 'Content-Type': 'application/json' };
}

export async function listMonthlyUploads(backendUrl, beToken, type) {
  const q = type ? `?type=${encodeURIComponent(type)}` : '';
  return apiFetch(`${backendUrl}/api/monthly-uploads${q}`, {
    headers: { Authorization: `Bearer ${beToken}` },
  });
}

export async function saveMonthlyUpload(backendUrl, beToken, { month, year, uploadType, fileName, rows, uploadedBy }) {
  return apiFetch(`${backendUrl}/api/monthly-uploads`, {
    method: 'POST',
    headers: authHeader(beToken),
    body: JSON.stringify({ month, year, uploadType, fileName, rows, uploadedBy }),
  });
}

export async function getMonthlyUploadRows(backendUrl, beToken, id) {
  return apiFetch(`${backendUrl}/api/monthly-uploads/${id}/rows`, {
    headers: { Authorization: `Bearer ${beToken}` },
  });
}

export async function compareMonthlyUploads(backendUrl, beToken, ids) {
  return apiFetch(`${backendUrl}/api/monthly-uploads/compare?ids=${ids.join(',')}`, {
    headers: { Authorization: `Bearer ${beToken}` },
  });
}

export async function deleteMonthlyUpload(backendUrl, beToken, id) {
  return apiFetch(`${backendUrl}/api/monthly-uploads/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${beToken}` },
  });
}
