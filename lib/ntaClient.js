'use strict';
// Thin wrapper around the Neutara Ticketing (NTA) REST API, used exclusively server-side so
// the API key never reaches the browser. Auth: `Authorization: Bearer <apiKey>` (confirmed
// against the live API — the literal header name some internal docs call "NTA_API_KEY" is an
// env-var naming convention, not the actual HTTP header). Base URL: https://neutaraticketing.cftools.live/api
//
// Confirmed live (2026-08-17):
//   GET /issues?page=&limit=&status=&spaceKey=&q=  -> { issues, total, page, totalPages }, auth required
//   GET /issues/:key                                -> single issue (lookup by key, not internal id)
//   GET /spaces                                     -> boards, auth required (this is what actually
//                                                       validates the key — /stats does NOT enforce auth)
//   GET /users                                       -> agent directory, auth required
//   GET /stats                                       -> { totalTickets, totalAgents, totalBoards }, public

const https = require('https');
const { URL } = require('url');

function authHeader(apiKey) {
  return `Bearer ${apiKey}`;
}

function buildQuery(params) {
  const qs = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.set(k, v);
  });
  const s = qs.toString();
  return s ? `?${s}` : '';
}

function request(baseUrl, path, { method = 'GET', apiKey, query, body } = {}) {
  return new Promise((resolve, reject) => {
    let url;
    try {
      // baseUrl already includes a path segment (.../api), so `path` must be resolved as a
      // *relative* reference (no leading slash) — a leading slash would replace the whole
      // path against the origin and silently drop the /api prefix.
      const relativePath = path.replace(/^\/+/, '') + buildQuery(query);
      url = new URL(relativePath, baseUrl.endsWith('/') ? baseUrl : baseUrl + '/');
    } catch (e) {
      return reject(new Error(`Invalid Neutara Ticketing base URL/path: ${e.message}`));
    }
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      method,
      headers: {
        'Authorization': authHeader(apiKey),
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    };
    if (payload) options.headers['Content-Length'] = Buffer.byteLength(payload);

    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let parsed = null;
        try { parsed = data ? JSON.parse(data) : null; } catch (e) { /* non-JSON response */ }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(parsed);
        } else {
          const msg = (parsed && parsed.error) || data.slice(0, 500) || `HTTP ${res.statusCode}`;
          const err = new Error(`Neutara Ticketing API error (${res.statusCode}): ${msg}`);
          err.statusCode = res.statusCode;
          err.body = parsed || data;
          reject(err);
        }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// Verifies stored credentials. /stats does not enforce auth, so /spaces (which does) is used
// instead — an invalid/missing key gets a 401 here.
async function testConnection({ baseUrl, apiKey }) {
  const spaces = await request(baseUrl, '/spaces', { apiKey });
  const list = Array.isArray(spaces) ? spaces : [];
  return {
    ok: true,
    boardCount: list.length,
    boards: list.map(s => ({ key: s.key, name: s.name, issueCount: s.issueCount })),
  };
}

// Internally paginates GET /issues using page/limit until every matching issue (up to
// maxResults, if given) has been fetched, then returns the full aggregated array.
async function searchAll({ baseUrl, apiKey, filters, maxResults }) {
  const pageSize = 200;
  let page = 1;
  let totalPages = 1;
  let total = 0;
  const issues = [];
  const cap = typeof maxResults === 'number' && maxResults > 0 ? maxResults : Infinity;

  while (page <= totalPages && issues.length < cap) {
    const data = await request(baseUrl, '/issues', {
      apiKey,
      query: { ...filters, page, limit: Math.min(pageSize, cap - issues.length) },
    });
    const pageIssues = data.issues || [];
    issues.push(...pageIssues);
    total = typeof data.total === 'number' ? data.total : issues.length;
    totalPages = typeof data.totalPages === 'number' ? data.totalPages : page;
    if (pageIssues.length === 0) break; // safety net against an infinite loop on a malformed response
    page += 1;
  }
  return { issues, total };
}

// Count-only search — limit:1 still returns an accurate `total` without transferring every
// issue body, so this is cheap to call frequently.
async function countOnly({ baseUrl, apiKey, filters }) {
  const data = await request(baseUrl, '/issues', { apiKey, query: { ...filters, page: 1, limit: 1 } });
  return { total: data.total || 0 };
}

async function getIssue({ baseUrl, apiKey, key }) {
  return request(baseUrl, `/issues/${encodeURIComponent(key)}`, { apiKey });
}

async function listSpaces({ baseUrl, apiKey }) {
  const spaces = await request(baseUrl, '/spaces', { apiKey });
  return Array.isArray(spaces) ? spaces : [];
}

async function listUsers({ baseUrl, apiKey }) {
  const users = await request(baseUrl, '/users', { apiKey });
  return Array.isArray(users) ? users : [];
}

async function getStats({ baseUrl, apiKey }) {
  return request(baseUrl, '/stats', { apiKey });
}

module.exports = { testConnection, searchAll, countOnly, getIssue, listSpaces, listUsers, getStats };
