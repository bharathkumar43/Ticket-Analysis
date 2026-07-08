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

export async function fetchEmailSettings(backendUrl, token) {
  return apiFetch(`${backendUrl}/api/email-settings`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function sendTestEmail(backendUrl, token, to) {
  return apiFetch(`${backendUrl}/api/email-settings/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ to }),
  });
}
