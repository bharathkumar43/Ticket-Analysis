'use strict';
// Background crawl: for every CF ticket currently in the Dev department (per the last main
// sync), fetches its real per-ticket activity history (one API call per ticket — the bulk
// sync's /issues list never includes activity) and checks whether the assignment tied to its
// "transferred/handed to Dev" event was made by one of the 4 tracked Shift Leads.
//
// This is heavy (thousands of individual API calls) so it runs as a background job with
// progress tracking, not inline in a request — see routes/nta.js's /dev-transfer-check* routes.

const ntaClient = require('./ntaClient');
const ntaStore = require('./ntaStore');
const configStore = require('./configStore');
const activityCache = require('./ntaActivityCache');

const SHIFT_LEADS = [
  { key: 'abhinandan', name: 'Abhinandan Kumar' },
  { key: 'ravi', name: 'Ravi Srivastava' },
  { key: 'pragati', name: 'Pragati Pandey' },
  { key: 'akhila', name: 'Akhila Aenkoju' },
];
function findLead(nameRaw) {
  if (!nameRaw) return null;
  const needle = nameRaw.trim().toLowerCase();
  return SHIFT_LEADS.find(l => l.name.trim().toLowerCase() === needle) || null;
}

function parseAssignmentEvents(activity, createdAt) {
  if (!Array.isArray(activity)) return [];
  const events = activity
    .filter(a => a.field === 'assignee' && a.newValue)
    .slice()
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  return events.map((ev, idx) => {
    const actorName = [ev.user && ev.user.firstName, ev.user && ev.user.lastName].filter(Boolean).join(' ').trim()
      || (ev.user && ev.user.email) || '';
    return { assignedByRaw: actorName, assignedTo: ev.newValue, assignedAt: ev.createdAt };
  });
}

// Every department-change event, not just moves into Dev — needed so a transfer's matching
// window can be bounded by whatever moved the ticket OUT of Dev next (see
// assignmentForDevStint below), rather than an arbitrary fixed time cutoff.
function parseDepartmentEvents(activity) {
  if (!Array.isArray(activity)) return [];
  return activity.filter(a => a.field === 'department').slice().sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

function isIntoDev(ev) { return /(?:transferred|handed) to dev\b/i.test(ev.newValue || ''); }

// The real assignment that resulted from a Dev transfer is the NEXT "assignee" event
// (oldValue -> a real name, i.e. someone was actually handed the ticket) at or after the
// transfer's timestamp, bounded by whichever department event comes next (the ticket
// leaving Dev again, or a later re-entry) — not a fixed time window. A fixed 5-minute
// window was missing real cases where the shift lead assigned the ticket several minutes
// after the department move (confirmed live: e.g. transfer at 18:26:34Z, real assignment by
// a shift lead at 18:34:00Z — 7.5 minutes later, outside any short fixed window).
function assignmentForDevStint(transferEvent, allDeptEventsSorted, assignmentRows) {
  const transferMs = new Date(transferEvent.createdAt).getTime();
  const later = allDeptEventsSorted.filter(ev => new Date(ev.createdAt).getTime() > transferMs);
  const stintEndMs = later.length ? new Date(later[0].createdAt).getTime() : Infinity;
  const candidates = assignmentRows
    .filter(r => {
      const t = new Date(r.assignedAt).getTime();
      return t >= transferMs && t <= stintEndMs;
    })
    .sort((a, b) => new Date(a.assignedAt) - new Date(b.assignedAt));
  return candidates.length ? candidates[0] : null;
}

let state = {
  inProgress: false,
  startedAt: null,
  finishedAt: null,
  lastError: null,
  total: 0,
  checked: 0,
  results: [], // { cfKey, transferredAt, transferredBy, assignedTo, assignedByRaw, byShiftLead, leadName }
  firstAssignees: [], // { cfKey, createdAt, assignedTo, assignedByRaw, assignedAt, byShiftLead, leadName,
                       //   productType, statusName, resolvedAt, isResolved, resolutionMinutes }
};

function getStatus() {
  return {
    inProgress: state.inProgress,
    startedAt: state.startedAt,
    finishedAt: state.finishedAt,
    lastError: state.lastError,
    total: state.total,
    checked: state.checked,
    resultCount: state.results.length,
    firstAssigneeCount: state.firstAssignees.length,
  };
}

function getResults() {
  return state.results;
}

function getFirstAssignees() {
  return state.firstAssignees;
}

async function runCheck() {
  if (state.inProgress) return getStatus();
  const cfg = configStore.readConfig();
  if (!cfg.nta || !cfg.nta.baseUrl || !cfg.nta.apiKey) {
    state.lastError = 'Neutara Ticketing credentials are not configured yet.';
    return getStatus();
  }
  const current = ntaStore.load();
  if (!current) {
    state.lastError = 'No Neutara Ticketing sync has completed yet.';
    return getStatus();
  }

  const devTickets = current.issues.filter(i => i.cfKey && i.department === 'Dev');
  state.inProgress = true;
  state.startedAt = new Date().toISOString();
  state.finishedAt = null;
  state.lastError = null;
  state.total = devTickets.length;
  state.checked = 0;
  state.results = [];
  state.firstAssignees = [];

  const CONCURRENCY = 5;
  let idx = 0;
  async function worker() {
    while (idx < devTickets.length) {
      const ticket = devTickets[idx++];
      const key = ticket.cfKey.toUpperCase();
      try {
        let issue = activityCache.get(key);
        if (!issue) {
          issue = await ntaClient.getIssue({ baseUrl: cfg.nta.baseUrl, apiKey: cfg.nta.apiKey, key });
          activityCache.set(key, issue);
        }
        const assignmentRows = parseAssignmentEvents(issue.activity, issue.createdAt);
        if (assignmentRows.length) {
          const first = assignmentRows[0];
          const lead = findLead(first.assignedByRaw);
          // Neutara's `resolvedAt` is unreliable — confirmed live (CF-29578): status.name
          // "Resolved" / status.category "done" with resolvedAt still null. The status
          // category is the authoritative "is this actually resolved" signal; resolvedAt is
          // used for timing when present, falling back to updatedAt (the closest real
          // timestamp available) when the ticket is done but resolvedAt wasn't stamped.
          const statusCategory = (ticket.fields && ticket.fields.status && ticket.fields.status.category) || '';
          const isResolved = statusCategory === 'done';
          const resolvedAt = (ticket.fields && ticket.fields.resolutiondate) || (isResolved ? ticket.fields && ticket.fields.updated : null) || null;
          const resolutionMinutes = isResolved && resolvedAt
            ? (new Date(resolvedAt).getTime() - new Date(first.assignedAt).getTime()) / 60000
            : null;
          state.firstAssignees.push({
            cfKey: ticket.cfKey,
            createdAt: issue.createdAt,
            assignedTo: first.assignedTo,
            assignedByRaw: first.assignedByRaw,
            assignedAt: first.assignedAt,
            byShiftLead: !!lead,
            leadName: lead ? lead.name : null,
            productType: (ticket.fields && ticket.fields.productType) || '',
            statusName: (ticket.fields && ticket.fields.status && ticket.fields.status.name) || '',
            resolvedAt: resolvedAt || null,
            isResolved,
            resolutionMinutes: resolutionMinutes !== null && isFinite(resolutionMinutes) && resolutionMinutes >= 0 ? resolutionMinutes : null,
          });
        }
        const allDeptEvents = parseDepartmentEvents(issue.activity);
        const transfers = allDeptEvents.filter(isIntoDev);
        transfers.forEach(t => {
          const match = assignmentForDevStint(t, allDeptEvents, assignmentRows);
          const lead = match ? findLead(match.assignedByRaw) : null;
          state.results.push({
            cfKey: ticket.cfKey,
            transferredAt: t.createdAt,
            transferredBy: [t.user && t.user.firstName, t.user && t.user.lastName].filter(Boolean).join(' ').trim(),
            assignedTo: match ? match.assignedTo : null,
            assignedByRaw: match ? match.assignedByRaw : null,
            byShiftLead: !!lead,
            leadName: lead ? lead.name : null,
          });
        });
      } catch (e) {
        // Skip this ticket on error (rate limit / transient) — the crawl keeps going so one
        // bad ticket doesn't abort thousands of good ones; it just won't appear in results.
      }
      state.checked += 1;
    }
  }
  try {
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, devTickets.length) }, worker));
  } catch (e) {
    state.lastError = e.message;
  } finally {
    state.inProgress = false;
    state.finishedAt = new Date().toISOString();
  }
  return getStatus();
}

module.exports = { runCheck, getStatus, getResults, getFirstAssignees };
