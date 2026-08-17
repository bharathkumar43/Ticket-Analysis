'use strict';
// Parses an "All Tickets.xlsx"-shaped export into the same pseudo-Jira-issue schema used by
// the reference artifact's ALL_TICKETS_DATA (see /outputs/all_tickets_data.json, provided as
// the target shape): { key, teamKey, fields:{summary,status:{name},assignee:{displayName,
// emailAddress},reporter:{displayName},project:{key},created,updated,resolutiondate}, frb, rb }
//
// Expected column order (confirmed against the real sample "All Tickets.xlsx", 2614 data rows):
//   Issue Type, Key, Summary, Assignee, Reporter, Components, Combination, Priority, Status,
//   Resolution, Created, Updated, Due date, First Response SLA Breach, Resolution SLA Breach
// Column lookup is by header name (case-insensitive), not position, so a reordered sheet
// still parses correctly as long as the header names match.

const XLSX = require('xlsx');
const C = require('../shared/constants');
const L = require('../shared/logic');

// Key prefix -> teamKey. CFITS (Migration ENT/SMB) can't be split into ENT vs SMB from this
// export alone — see README "Known limitations". Any other prefix is left unmapped.
const PROJECT_TO_TEAMKEY = { L2B: 'eng', L3B: 'eng', IN: 'infra', QA: 'qa' };
const CFITS_PREFIX = 'CFITS';

// Build a normalized "name" -> email lookup per team, using the same emailToName() the
// reference artifact uses to derive a display label for a roster email — reversed here to
// match an Excel "Assignee" free-text name back to a confirmed roster email. Falls back to
// a handful of manual aliases for names that don't reduce to the same normalized form
// (nicknames / punctuation differences observed in the real sample export).
function normalizeName(s) {
  return (s || '').toLowerCase().replace(/[^a-z]/g, '');
}
function nameTokens(s) {
  return (s || '').toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);
}

function buildRosterIndex(teamKey) {
  const exact = {};
  const entries = []; // { email, tokens, joined }
  (C.TEAMS[teamKey] || []).forEach(email => {
    const name = L.emailToName(email);
    const joined = normalizeName(name);
    exact[joined] = email;
    entries.push({ email, tokens: nameTokens(name), joined });
  });
  return { exact, entries };
}
const ROSTER_INDEX = {
  eng: buildRosterIndex('eng'),
  infra: buildRosterIndex('infra'),
  qa: buildRosterIndex('qa'),
};

// Excel "Assignee" is a free-text display name (no email column in the sheet), so it has to
// be matched back to a confirmed roster email by name. Real-world exports are inconsistent
// about which name variant gets typed in (nickname-only, missing middle/last name, extra
// title), so this tries progressively looser strategies and only commits to a match when
// it's unambiguous — an unresolved name is left unattributed (see README) rather than risk
// mis-crediting someone else's ticket.
function matchAssigneeEmail(teamKey, assigneeName) {
  const roster = ROSTER_INDEX[teamKey];
  if (!roster || !assigneeName) return null;

  // 1) Exact normalized full-name match (handles casing/spacing/punctuation differences).
  const exactHit = roster.exact[normalizeName(assigneeName)];
  if (exactHit) return exactHit;

  // 2) Token subset match: the sheet name's words are a subset of the roster name's words
  // (e.g. sheet "Raviteja" vs roster "Bala Raviteja") or vice versa (e.g. sheet "MOHD AKIB
  // MOHD RABBANI" vs roster "Akib Mohd"). Only commit if exactly one roster entry qualifies.
  const sheetTokens = nameTokens(assigneeName);
  if (sheetTokens.length) {
    const sheetSet = new Set(sheetTokens);
    const candidates = roster.entries.filter(({ tokens }) => {
      if (!tokens.length) return false;
      const rosterSet = new Set(tokens);
      const sheetSubsetOfRoster = sheetTokens.every(t => rosterSet.has(t));
      const rosterSubsetOfSheet = tokens.every(t => sheetSet.has(t));
      return sheetSubsetOfRoster || rosterSubsetOfSheet;
    });
    if (candidates.length === 1) return candidates[0].email;
  }

  return null;
}

function excelSerialToIso(serial) {
  if (serial === null || serial === undefined || serial === '') return null;
  if (typeof serial !== 'number') {
    // Already a string/date from the sheet (e.g. sheet stored as text) — best-effort passthrough.
    const d = new Date(serial);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 19);
  }
  const dc = XLSX.SSF.parse_date_code(serial);
  if (!dc) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${dc.y}-${pad(dc.m)}-${pad(dc.d)}T${pad(dc.H)}:${pad(dc.M)}:${pad(Math.round(dc.S))}`;
}

function normHeader(h) {
  return String(h || '').trim().toLowerCase();
}

const EXPECTED_HEADERS = [
  'Issue Type', 'Key', 'Summary', 'Assignee', 'Reporter', 'Components', 'Combination',
  'Priority', 'Status', 'Resolution', 'Created', 'Updated', 'Due date',
  'First Response SLA Breach', 'Resolution SLA Breach',
];

function boolFromBreachCell(v) {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v).trim().toLowerCase();
  if (s === 'yes' || s === 'true' || s === 'breached' || s === '1') return true;
  if (s === 'no' || s === 'false' || s === '0') return false;
  return null;
}

// Parses a workbook Buffer into { issues, meta }. `issues` are in ALL_TICKETS_DATA shape.
function parseWorkbookBuffer(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', raw: true });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
  if (!rows.length) return { issues: [], meta: { rowCount: 0, warnings: ['Empty sheet'] } };

  const header = rows[0].map(normHeader);
  const col = (name) => header.indexOf(normHeader(name));
  const idx = {
    issueType: col('Issue Type'), key: col('Key'), summary: col('Summary'),
    assignee: col('Assignee'), reporter: col('Reporter'), components: col('Components'),
    combination: col('Combination'), priority: col('Priority'), status: col('Status'),
    resolution: col('Resolution'), created: col('Created'), updated: col('Updated'),
    dueDate: col('Due date'), frb: col('First Response SLA Breach'), rb: col('Resolution SLA Breach'),
  };

  const missingCols = EXPECTED_HEADERS.filter(h => col(h) === -1);
  const warnings = [];
  if (missingCols.length) {
    warnings.push(`Missing expected column(s): ${missingCols.join(', ')} — those fields will be blank.`);
  }
  if (idx.key === -1) {
    throw new Error('Uploaded sheet has no "Key" column — cannot parse. Expected columns: ' + EXPECTED_HEADERS.join(', '));
  }

  const issues = [];
  let unmappedCount = 0, cfitsCount = 0;
  let minCreated = null, maxCreated = null;

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r[idx.key] === null || r[idx.key] === undefined || r[idx.key] === '') continue;
    const key = String(r[idx.key]).trim();
    const projectPrefix = key.split('-')[0];
    const assigneeName = idx.assignee !== -1 ? r[idx.assignee] : null;
    const reporterName = idx.reporter !== -1 ? r[idx.reporter] : null;
    const statusName = idx.status !== -1 ? r[idx.status] : null;
    const created = idx.created !== -1 ? excelSerialToIso(r[idx.created]) : null;
    const updated = idx.updated !== -1 ? excelSerialToIso(r[idx.updated]) : null;
    const frb = idx.frb !== -1 ? boolFromBreachCell(r[idx.frb]) : null;
    const rb = idx.rb !== -1 ? boolFromBreachCell(r[idx.rb]) : null;

    let teamKey = null;
    let assigneeEmail = null;
    if (projectPrefix === CFITS_PREFIX) {
      // Migration ENT vs SMB can't be split from this export alone (both share the CFITS
      // project and this sheet carries no roster/segment column) — see README.
      teamKey = null;
      cfitsCount++;
    } else if (PROJECT_TO_TEAMKEY[projectPrefix]) {
      teamKey = PROJECT_TO_TEAMKEY[projectPrefix];
      assigneeEmail = matchAssigneeEmail(teamKey, assigneeName);
      if (!assigneeEmail) unmappedCount++;
    } else {
      unmappedCount++;
    }

    if (created) {
      if (!minCreated || created < minCreated) minCreated = created;
      if (!maxCreated || created > maxCreated) maxCreated = created;
    }

    issues.push({
      key,
      teamKey: assigneeEmail ? teamKey : null, // only attribute to a team once the roster match is confirmed, same rule the reference conversion used
      fields: {
        summary: idx.summary !== -1 ? (r[idx.summary] || '') : '',
        status: { name: statusName || '' },
        assignee: assigneeName ? { displayName: assigneeName, emailAddress: assigneeEmail || undefined } : null,
        reporter: reporterName ? { displayName: reporterName } : null,
        project: { key: projectPrefix },
        created, updated,
        resolutiondate: (statusName === 'Resolved' || statusName === 'Closed') ? updated : null,
      },
      frb, rb,
      // Extra columns kept for the raw ticket table / future use — not part of the reference
      // ALL_TICKETS_DATA shape but harmless additions.
      issueType: idx.issueType !== -1 ? r[idx.issueType] : null,
      priority: idx.priority !== -1 ? r[idx.priority] : null,
      resolution: idx.resolution !== -1 ? r[idx.resolution] : null,
      components: idx.components !== -1 ? r[idx.components] : null,
      combination: idx.combination !== -1 ? r[idx.combination] : null,
      dueDate: idx.dueDate !== -1 ? excelSerialToIso(r[idx.dueDate]) : null,
    });
  }

  const teamCounts = {};
  issues.forEach(i => { if (i.teamKey) teamCounts[i.teamKey] = (teamCounts[i.teamKey] || 0) + 1; });

  return {
    issues,
    meta: {
      rowCount: issues.length,
      sourceRowCount: rows.length - 1,
      teamCounts,
      cfitsRowCount: cfitsCount,
      unmatchedRosterCount: unmappedCount,
      dateRange: { from: minCreated, to: maxCreated },
      uploadedAt: new Date().toISOString(),
      warnings,
    },
  };
}

module.exports = { parseWorkbookBuffer, excelSerialToIso, matchAssigneeEmail, PROJECT_TO_TEAMKEY };
