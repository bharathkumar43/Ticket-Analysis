'use strict';
// Orchestrates a full pull from Neutara Ticketing into the cached ntaStore dataset. A full
// pull takes several minutes (confirmed: ~46s per 5,000 tickets, ~29K tickets total), so
// this runs on a background schedule (see server.js) plus an on-demand "Sync now" trigger,
// rather than being fetched fresh on every page load.

const ntaClient = require('./ntaClient');
const ntaMapper = require('./ntaMapper');
const ntaStore = require('./ntaStore');
const configStore = require('./configStore');

let inProgress = false;
let lastSyncedAt = null;
let lastError = null;

function getStatus() {
  const current = ntaStore.load();
  return {
    inProgress,
    lastSyncedAt,
    lastError,
    ticketCount: current ? current.issues.length : 0,
  };
}

async function runSync() {
  if (inProgress) return getStatus();
  const cfg = configStore.readConfig();
  if (!cfg.nta || !cfg.nta.baseUrl || !cfg.nta.apiKey) {
    lastError = 'Neutara Ticketing credentials are not configured yet.';
    return getStatus();
  }

  inProgress = true;
  lastError = null;
  try {
    const { issues: rawIssues, total } = await ntaClient.searchAll({ baseUrl: cfg.nta.baseUrl, apiKey: cfg.nta.apiKey, filters: {} });
    const issues = ntaMapper.mapIssues(rawIssues);

    const teamCounts = {};
    let minCreated = null, maxCreated = null;
    issues.forEach(i => {
      if (i.teamKey && i.teamKey !== 'other') teamCounts[i.teamKey] = (teamCounts[i.teamKey] || 0) + 1;
      const created = i.fields.created;
      if (created) {
        if (!minCreated || created < minCreated) minCreated = created;
        if (!maxCreated || created > maxCreated) maxCreated = created;
      }
    });

    const meta = {
      rowCount: issues.length,
      sourceRowCount: total,
      teamCounts,
      dateRange: { from: minCreated, to: maxCreated },
      syncedAt: new Date().toISOString(),
    };
    ntaStore.save({ issues, meta });
    lastSyncedAt = meta.syncedAt;
  } catch (e) {
    lastError = e.message;
  } finally {
    inProgress = false;
  }
  return getStatus();
}

module.exports = { runSync, getStatus };
