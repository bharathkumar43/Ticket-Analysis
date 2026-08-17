'use strict';
// Maps a raw Neutara Ticketing (NTA) issue into the same pseudo-issue shape
// lib/excelParser.js already produces ({ key, teamKey, fields:{...}, frb, rb }), so the
// existing team-tab/team-tickets/Dashboard business logic (shared/logic.js,
// shared/rules.js) can consume live NTA data and Excel-uploaded data identically.
//
// teamKey is computed from the ticket's `current_department` field (Dev/Migration/Infra/QA/
// Migration-Customer/Pre-Sales/null) — almost every ticket lives under one space (TESTIN),
// so department, not space, is the real team-boundary signal. See README for the confirmed
// department->team mapping and its caveats.

const rules = require('../shared/rules');

// NTA has no first-response-SLA equivalent (frb is always null); `sla_breached` is its
// single resolution-SLA-style flag (rb).
function mapIssue(raw) {
  const email = raw.assignee ? (raw.assignee.email || '').toLowerCase() : null;
  const teamKey = rules.departmentToTeamKey(raw.current_department, email);

  return {
    key: raw.key,
    teamKey,
    fields: {
      summary: raw.summary || '',
      status: { name: (raw.status && raw.status.name) || '', category: (raw.status && raw.status.category) || '' },
      assignee: raw.assignee ? { displayName: raw.assignee.displayName || raw.assignee.email, emailAddress: email } : null,
      reporter: raw.reporter ? { displayName: raw.reporter.displayName || raw.reporter.email } : null,
      project: { key: raw.spaceKey || '' },
      created: raw.createdAt || null,
      updated: raw.updatedAt || null,
      resolutiondate: raw.resolvedAt || null,
      duedate: raw.dueDate || null,
      priority: raw.priority || null,
      description: typeof raw.description === 'string' ? raw.description : '',
      rootCause: raw.rootCause || '',
      fixDescription: raw.fixDescription || '',
      // Always empty in every ticket sampled so far — kept as real fields (not stubbed out)
      // so hygiene checks that depend on them honestly report "no data" rather than N/A-by-design.
      attachment: Array.isArray(raw.attachments) ? raw.attachments : [],
      comment: { items: Array.isArray(raw.comments) ? raw.comments : [] },
    },
    frb: null,
    rb: typeof raw.sla_breached === 'boolean' ? raw.sla_breached : null,
    department: raw.current_department || null,
  };
}

function mapIssues(rawIssues) {
  return rawIssues.map(mapIssue);
}

module.exports = { mapIssue, mapIssues };
