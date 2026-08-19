'use strict';
// In-memory TTL cache for single-issue lookups (GET /issues/:key), keyed by cfKey/key.
// Only the single-issue endpoint returns a populated `activity` array (the bulk /issues
// list used for the main sync always returns activity: []), and the Shift Lead tab needs to
// fetch it per-ticket on demand — this cache avoids re-hitting Neutara for the same ticket
// on every tab reload within the TTL window.

const TTL_MS = 5 * 60 * 1000;
const cache = new Map(); // key -> { issue, fetchedAt }

function get(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > TTL_MS) { cache.delete(key); return null; }
  return entry.issue;
}

function set(key, issue) {
  cache.set(key, { issue, fetchedAt: Date.now() });
}

module.exports = { get, set };
