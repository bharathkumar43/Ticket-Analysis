// Backend-backed Action Items store — used when connected to Jira/backend
// (see jiraCtx in App.jsx). Falls back to actionItemsStore.js (localStorage)
// otherwise, since jira-dashboard can also run fully standalone.

async function apiFetch(url, opts = {}) {
  const res = await fetch(url, opts);
  if (res.status === 204) return null;
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

function fromBackend(item) {
  return { ...item, dueDate: item.dueDate ? item.dueDate.slice(0, 10) : "" };
}

export function makeBackendActionItemsStore(backendUrl, token) {
  const base = `${backendUrl}/api/action-items`;
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  return {
    kind: "backend",
    async list() {
      const { data } = await apiFetch(base, { headers });
      return data.map(fromBackend);
    },
    async create(fields) {
      const item = await apiFetch(base, { method: "POST", headers, body: JSON.stringify(fields) });
      return fromBackend(item);
    },
    async update(id, fields) {
      const item = await apiFetch(`${base}/${id}`, { method: "PATCH", headers, body: JSON.stringify(fields) });
      return fromBackend(item);
    },
    async remove(id) {
      await apiFetch(`${base}/${id}`, { method: "DELETE", headers });
    },
    async remind(id) {
      return apiFetch(`${base}/${id}/remind`, { method: "POST", headers });
    },
  };
}
