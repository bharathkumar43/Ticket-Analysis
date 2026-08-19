'use strict';
const express = require('express');
const router = express.Router();
const ntaClient = require('../lib/ntaClient');
const configStore = require('../lib/configStore');
const ntaSync = require('../lib/ntaSync');
const ntaStore = require('../lib/ntaStore');
const activityCache = require('../lib/ntaActivityCache');

function requireConfig(req, res) {
  const cfg = configStore.readConfig();
  if (!cfg.nta || !cfg.nta.baseUrl || !cfg.nta.apiKey) {
    res.status(400).json({ error: 'Neutara Ticketing credentials are not configured yet. Open Settings and enter the base URL and API key.' });
    return null;
  }
  return cfg.nta;
}

// POST /api/nta/search { filters?, maxResults? } -> { issues, total }
// Internally paginates (page/limit) until every matching issue has been fetched.
router.post('/search', async (req, res) => {
  const cfg = requireConfig(req, res);
  if (!cfg) return;
  const { filters, maxResults } = req.body || {};
  try {
    const result = await ntaClient.searchAll({ baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, filters, maxResults });
    res.json(result);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// POST /api/nta/count { filters? } -> { total } (limit:1, count-only)
router.post('/count', async (req, res) => {
  const cfg = requireConfig(req, res);
  if (!cfg) return;
  const { filters } = req.body || {};
  try {
    const result = await ntaClient.countOnly({ baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, filters });
    res.json(result);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// GET /api/nta/spaces -> the boards/projects
router.get('/spaces', async (req, res) => {
  const cfg = requireConfig(req, res);
  if (!cfg) return;
  try {
    const spaces = await ntaClient.listSpaces({ baseUrl: cfg.baseUrl, apiKey: cfg.apiKey });
    res.json({ spaces });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// GET /api/nta/users -> the agent directory
router.get('/users', async (req, res) => {
  const cfg = requireConfig(req, res);
  if (!cfg) return;
  try {
    const users = await ntaClient.listUsers({ baseUrl: cfg.baseUrl, apiKey: cfg.apiKey });
    res.json({ users });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// GET /api/nta/stats -> { totalTickets, totalAgents, totalBoards }
router.get('/stats', async (req, res) => {
  const cfg = requireConfig(req, res);
  if (!cfg) return;
  try {
    const stats = await ntaClient.getStats({ baseUrl: cfg.baseUrl, apiKey: cfg.apiKey });
    res.json(stats);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// GET /api/nta/test-connection -> verifies stored credentials via GET /spaces
router.get('/test-connection', async (req, res) => {
  const cfg = requireConfig(req, res);
  if (!cfg) return;
  try {
    const result = await ntaClient.testConnection({ baseUrl: cfg.baseUrl, apiKey: cfg.apiKey });
    res.json(result);
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message });
  }
});

// POST /api/nta/sync -> triggers a full sync now (no-ops if one is already running).
// A full sync takes several minutes, so this responds once it's done rather than streaming
// progress — poll GET /api/nta/sync-status from the UI while it's in flight.
router.post('/sync', async (req, res) => {
  const cfg = requireConfig(req, res);
  if (!cfg) return;
  const status = await ntaSync.runSync();
  res.json(status);
});

// GET /api/nta/sync-status -> { inProgress, lastSyncedAt, lastError, ticketCount }
router.get('/sync-status', (req, res) => {
  res.json(ntaSync.getStatus());
});

// GET /api/nta/issue/:key -> single live issue, straight from Neutara (not the cached sync
// snapshot). This is the only endpoint that returns a populated `activity` array — the bulk
// /issues list endpoint (and therefore our cached sync data) always returns activity: [].
router.get('/issue/:key', async (req, res) => {
  const cfg = requireConfig(req, res);
  if (!cfg) return;
  const key = req.params.key.toUpperCase();
  const cached = activityCache.get(key);
  if (cached) return res.json(cached);
  try {
    const issue = await ntaClient.getIssue({ baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, key });
    activityCache.set(key, issue);
    res.json(issue);
  } catch (e) {
    res.status(e.statusCode === 404 ? 404 : 502).json({ error: e.message });
  }
});

// POST /api/nta/issues-bulk { keys: string[] } -> { issues: { [key]: issue|null } }
// Fetches multiple single-issue lookups (with their real activity history) in one request,
// sequentially with a small concurrency cap so we don't hammer Neutara when the Shift Lead
// tab needs history for a whole page of Dev tickets at once. Cache-aware per key.
router.post('/issues-bulk', async (req, res) => {
  const cfg = requireConfig(req, res);
  if (!cfg) return;
  const keys = Array.isArray(req.body && req.body.keys) ? req.body.keys.slice(0, 500) : [];
  const result = {};
  const CONCURRENCY = 5;
  let idx = 0;
  async function worker() {
    while (idx < keys.length) {
      const key = keys[idx++].toUpperCase();
      const cached = activityCache.get(key);
      if (cached) { result[key] = cached; continue; }
      try {
        const issue = await ntaClient.getIssue({ baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, key });
        activityCache.set(key, issue);
        result[key] = issue;
      } catch (e) {
        result[key] = null;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, keys.length) }, worker));
  res.json({ issues: result });
});

// GET /api/nta/current -> the cached, mapped dataset from the last completed sync
// ({ issues, meta }) — same response shape as GET /api/data/current (Excel) so the
// frontend can treat Live-NTA and Uploaded-Excel symmetrically.
router.get('/current', (req, res) => {
  const current = ntaStore.load();
  if (!current) return res.status(404).json({ error: 'No Neutara Ticketing sync has completed yet. Use Settings → Sync now.' });
  res.json(current);
});

module.exports = router;
