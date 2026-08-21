// Thin fetch wrappers around this app's own backend (never talks to Neutara Ticketing
// directly from the browser — the backend proxy in routes/nta.js holds the API key).
const Api = (function () {
  async function asJson(res) {
    let body = null;
    try { body = await res.json(); } catch (e) { /* no body */ }
    if (!res.ok) {
      const msg = (body && body.error) || `Request failed (${res.status})`;
      throw new Error(msg);
    }
    return body;
  }

  // Neutara Ticketing (NTA) — live connection + on-demand queries.
  async function ntaSearch(filters, maxResults) {
    const res = await fetch('/api/nta/search', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filters, maxResults }),
    });
    return asJson(res);
  }

  async function ntaCount(filters) {
    const res = await fetch('/api/nta/count', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filters }),
    });
    const data = await asJson(res);
    return data.total;
  }

  async function ntaTestConnection() {
    const res = await fetch('/api/nta/test-connection');
    return asJson(res);
  }

  async function getNtaSpaces() {
    const res = await fetch('/api/nta/spaces');
    return asJson(res);
  }

  async function getNtaUsers() {
    const res = await fetch('/api/nta/users');
    return asJson(res);
  }

  async function getNtaStats() {
    const res = await fetch('/api/nta/stats');
    return asJson(res);
  }

  // The cached, mapped dataset from the last completed background/manual sync
  // ({ issues, meta }) — same shape as getCurrentData() (Excel) so tabs can treat the two
  // sources symmetrically.
  async function getNtaCurrent() {
    const res = await fetch('/api/nta/current');
    if (res.status === 404) return null;
    return asJson(res);
  }

  async function syncNta() {
    const res = await fetch('/api/nta/sync', { method: 'POST' });
    return asJson(res);
  }

  async function getNtaSyncStatus() {
    const res = await fetch('/api/nta/sync-status');
    return asJson(res);
  }

  // Single live issue straight from Neutara, including its populated `activity` array
  // (department/assignee/status/comment/sla change events) — not present in the bulk sync.
  async function getNtaIssue(key) {
    const res = await fetch(`/api/nta/issue/${encodeURIComponent(key)}`);
    if (res.status === 404) return null;
    return asJson(res);
  }

  // Batch version of getNtaIssue — returns { issues: { [key]: issue|null } }.
  async function getNtaIssuesBulk(keys) {
    const res = await fetch('/api/nta/issues-bulk', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keys }),
    });
    return asJson(res);
  }

  // Background full-Dev-ticket crawl checking Shift Lead assignment on every real
  // "transferred to Dev" event — see lib/devTransferCheck.js.
  async function startDevTransferCheck() {
    const res = await fetch('/api/nta/dev-transfer-check', { method: 'POST' });
    return asJson(res);
  }
  async function getDevTransferCheckStatus() {
    const res = await fetch('/api/nta/dev-transfer-check-status');
    return asJson(res);
  }
  async function getDevTransferCheckResults() {
    const res = await fetch('/api/nta/dev-transfer-check-results');
    return asJson(res);
  }
  async function getDevFirstAssignees() {
    const res = await fetch('/api/nta/dev-first-assignees');
    return asJson(res);
  }

  async function getConfig() {
    const res = await fetch('/api/config');
    return asJson(res);
  }

  async function saveConfig(cfg) {
    const res = await fetch('/api/config', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg),
    });
    return asJson(res);
  }

  async function uploadExcel(file) {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/data/upload', { method: 'POST', body: fd });
    return asJson(res);
  }

  async function getCurrentData() {
    const res = await fetch('/api/data/current');
    if (res.status === 404) return null;
    return asJson(res);
  }

  return {
    getConfig, saveConfig, uploadExcel, getCurrentData,
    ntaSearch, ntaCount, ntaTestConnection, getNtaSpaces, getNtaUsers, getNtaStats,
    getNtaCurrent, syncNta, getNtaSyncStatus, getNtaIssue, getNtaIssuesBulk,
    startDevTransferCheck, getDevTransferCheckStatus, getDevTransferCheckResults, getDevFirstAssignees,
  };
})();
