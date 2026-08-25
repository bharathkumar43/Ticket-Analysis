// Shift Lead tab: tracks the Shift Lead's ASSIGNMENT performance, not engineer resolution.
// A Shift Lead's job is Ticket Created -> Unassigned -> Shift Lead assigns -> Engineer.
//
// Assignment rows are derived from Neutara Ticketing's REAL per-ticket activity history
// (GET /api/nta/issue/:key / /api/nta/issues-bulk), NOT a manually-typed log. Confirmed live
// (2026-08-20): the bulk /issues list used for the main sync always returns activity: [], but
// the single-issue endpoint returns a populated activity array with real assignee/department
// change events, e.g. { field: 'assignee', oldValue: null, newValue: 'Adari Venkata Jaswanth',
// user: { firstName, lastName, email }, createdAt }. The event's `user` is who performed the
// assignment (the Shift Lead, when it's an initial null -> engineer assignment); its
// `createdAt` is the real assignment timestamp; its `oldValue` on a later re-assignment of the
// same ticket is the previous assignee. See slParseAssignmentEvents.
// `domain` is each Shift Lead's designated product ownership (per team spec, not inferred
// from ticket mix) — the baseline that Cross-Assignment % below is measured against: any
// ticket this lead assigned whose productType doesn't match their domain counts as a
// cross-assignment (this lead handling/routing outside their own product area).
const SHIFT_LEADS = [
  { key: 'abhinandan', name: 'Abhinandan Kumar', domain: 'Messaging' },
  { key: 'ravi', name: 'Ravi Srivastava', domain: 'Content' },
  { key: 'pragati', name: 'Pragati Pandey', domain: 'Messaging' },
  { key: 'akhila', name: 'Akhila Aenkoju', domain: 'Messaging' },
];
// The only engineers a Shift Lead may assign a ticket to, per team spec — used to render the
// roster reference and to recognize real assignment events as in-scope.
const SHIFT_LEAD_ENGINEERS = [
  { name: 'Vamsi Malla', specialty: 'Messaging' },
  { name: 'Shiva Amuda', specialty: 'Content' },
  { name: 'K N V S Raj Kumar', specialty: 'Email' },
  { name: 'Lakshmi Adabala', specialty: 'Email' },
  { name: 'Adari Venkata Jaswanth', specialty: 'Content' },
  { name: 'Abhinandan Kumar', specialty: 'Messaging' },
  { name: 'Pragati Pandey', specialty: 'Messaging' },
  { name: 'Vishal Kumar', specialty: 'Content' },
  { name: 'Srinu Gudimitla', specialty: 'Content' },
  { name: 'Ravi Kumar Srivastava', specialty: 'Content' },
  { name: 'Naved', specialty: 'Content' },
  { name: 'Akhila', specialty: 'Content' },
  { name: 'Rehan Khan', specialty: 'Content' },
  { name: 'Bhagyashri Vitthal Deokar', specialty: 'Email' },
  { name: 'Kantam Hemadasu', specialty: 'Messaging' },
];
const SHIFT_LEAD_ASSIGN_SLA_MINUTES = 30;

function slMinutesBetween(fromIso, toIso) {
  if (!fromIso || !toIso) return null;
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  if (!isFinite(ms) || ms < 0) return null;
  return ms / 60000;
}
function slFmtMinutes(v) {
  if (v === null || v === undefined) return '—';
  if (v < 60) return `${Math.round(v)} min`;
  const h = Math.floor(v / 60), m = Math.round(v % 60);
  return `${h}h ${m}m`;
}
function slFmtPct(v) { return v === null || v === undefined ? '—' : `${v.toFixed(1)}%`; }
function slPct(num, den) { return den ? (num / den) * 100 : null; }
function slGoodClass(ok) { return ok === null ? '' : ok ? 'good-cell' : 'bad-cell'; }
function slMedian(nums) {
  if (!nums.length) return null;
  const sorted = nums.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
// Normalizes a raw productType string (e.g. "Content Migration", "Email Migration",
// "Message Migration") to one of the three domain buckets a Shift Lead's `domain` is set
// to ('Content' | 'Email' | 'Messaging'), via substring match so minor label variants from
// Neutara still classify correctly. Returns null for anything unrecognized (excluded from
// cross-assignment math rather than miscounted).
function slDomainForProductType(productType) {
  const p = (productType || '').toLowerCase();
  if (!p) return null;
  if (p.includes('content')) return 'Content';
  if (p.includes('email')) return 'Email';
  if (p.includes('message') || p.includes('messaging')) return 'Messaging';
  return null;
}

// Cross-Assignment % for one Shift Lead: of the tickets they assigned (assignedRows), how
// many carry a productType outside their own designated `domain` — i.e. tickets that, per
// team spec, should have been routed to the Content/Email/Messaging lead who actually owns
// that domain. Tickets whose productType doesn't normalize to a known domain are excluded
// from both the numerator and denominator (not counted as either in- or cross-domain).
function slComputeCrossAssignment(assignedRows, leadDomain) {
  if (!leadDomain) return { inDomain: 0, crossDomain: 0, classified: 0, crossPct: null, inDomainPct: null, crossRows: [], inDomainRows: [] };
  const classifiedRows = assignedRows.filter(r => slDomainForProductType(r.productType));
  const crossRows = classifiedRows.filter(r => slDomainForProductType(r.productType) !== leadDomain);
  const inDomainRows = classifiedRows.filter(r => slDomainForProductType(r.productType) === leadDomain);
  const classified = classifiedRows.length;
  return {
    inDomain: inDomainRows.length,
    crossDomain: crossRows.length,
    classified,
    crossPct: classified ? slPct(crossRows.length, classified) : null,
    inDomainPct: classified ? slPct(inDomainRows.length, classified) : null,
    crossRows,
    inDomainRows,
  };
}

function slFindLead(displayNameOrEmail) {
  if (!displayNameOrEmail) return null;
  const needle = displayNameOrEmail.trim().toLowerCase();
  return SHIFT_LEADS.find(l => l.name.trim().toLowerCase() === needle) || null;
}
function slIsSelfAssigned(row, leadName) {
  return !!(leadName && row.assignedTo && row.assignedTo.trim().toLowerCase() === leadName.trim().toLowerCase());
}

// Turns one ticket's real `activity` array into a chronological list of assignment rows:
// one row per "assignee changed" event where the new value is non-null (i.e. someone was
// actually handed the ticket — a change to null is a hand-off away, not an assignment).
// `assignedBy` is the event's actor (who performed the assignment); `previousAssignee` is
// the event's oldValue (who had it right before, if anyone) — this makes reassignment chains
// fall out naturally from the real history instead of needing to be tracked separately.
function slParseAssignmentEvents(activity, createdAt, ticketKey) {
  if (!Array.isArray(activity)) return [];
  const events = activity
    .filter(a => a.field === 'assignee' && a.newValue)
    .slice()
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  return events.map((ev, idx) => {
    const actorName = [ev.user && ev.user.firstName, ev.user && ev.user.lastName].filter(Boolean).join(' ').trim()
      || (ev.user && ev.user.email) || '';
    return {
      ticketKey,
      createdAt: idx === 0 ? createdAt : events[idx - 1].createdAt,
      assignedByRaw: actorName,
      assignedTo: ev.newValue,
      assignedAt: ev.createdAt,
      previousAssignee: ev.oldValue || '',
      isFirstAssignment: idx === 0,
    };
  });
}

// The very first engineer a ticket was ever assigned to (earliest assignee event), as
// opposed to whoever holds it now — pulled from a ticket's parsed assignment rows.
function slFirstAssignee(ticketRows) {
  if (!ticketRows || !ticketRows.length) return null;
  return ticketRows.find(r => r.isFirstAssignment) || null;
}

// Every department-change activity event, not just moves into Dev — needed so a transfer's
// matching window can be bounded by whatever moves the ticket OUT of Dev next, rather than
// an arbitrary fixed time cutoff (see slAssignmentForDevStint).
function slParseDepartmentEvents(activity) {
  if (!Array.isArray(activity)) return [];
  return activity.filter(a => a.field === 'department').slice().sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}
function slIsIntoDev(ev) { return /(?:transferred|handed) to dev\b/i.test(ev.newValue || ''); }

// The real assignment that resulted from a Dev transfer is the NEXT real assignee event at
// or after the transfer's timestamp, bounded by whichever department event comes next (the
// ticket leaving Dev again) — not a fixed time window. A fixed 5-minute window missed real
// cases where the shift lead assigned the ticket several minutes after the department move
// (confirmed live: CF-29564 — transfer at 18:26:34Z, real assignment by a shift lead at
// 18:34:00Z, 7.5 minutes later).
function slAssignmentForDevStint(transferEvent, allDeptEventsSorted, assignmentRows) {
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

// For one ticket: every Dev-transfer event paired with whichever assignment (if any) is tied
// to it, plus whether that assignment was performed by one of the 4 tracked Shift Leads.
function slDevTransferAssignmentChecks(issue, assignmentRows) {
  const allDeptEvents = slParseDepartmentEvents(issue.activity);
  const transfers = allDeptEvents.filter(slIsIntoDev);
  return transfers.map(t => {
    const match = slAssignmentForDevStint(t, allDeptEvents, assignmentRows);
    const lead = match ? slFindLead(match.assignedByRaw) : null;
    return { transferredAt: t.createdAt, transferredBy: [t.user && t.user.firstName, t.user && t.user.lastName].filter(Boolean).join(' ').trim(), match, byShiftLead: !!lead, leadName: lead ? lead.name : null };
  });
}

// One row per assignment. "Tickets Received" = distinct tickets first attributed to this
// lead's queue (i.e. every row, since each row IS an assignment this lead made); "Assigned"
// = rows where assignedTo is filled in; "Still Unassigned" = rows logged without an
// assignedTo yet (queued for this lead but not yet handed to an engineer). Self-assigned =
// the lead put the ticket in their own name (matched against assignedTo); everything else
// with an assignee is "assigned to others."
function slComputeLeadStats(rows, leadName) {
  const total = rows.length;
  const assignedRows = rows.filter(r => r.assignedTo && r.assignedTo.trim());
  const stillUnassigned = total - assignedRows.length;
  const selfAssignedRows = assignedRows.filter(r => slIsSelfAssigned(r, leadName));
  const otherAssignedRows = assignedRows.filter(r => !slIsSelfAssigned(r, leadName));
  const times = assignedRows.map(r => slMinutesBetween(r.createdAt, r.assignedAt)).filter(v => v !== null);
  const avgMinutes = times.length ? times.reduce((a, b) => a + b, 0) / times.length : null;
  const medianMinutes = slMedian(times);
  const withinSlaCount = times.filter(v => v <= SHIFT_LEAD_ASSIGN_SLA_MINUTES).length;
  const assignSlaBreachCount = times.length - withinSlaCount; // assignment-time SLA (this lead's own speed), NOT the ticket's SLA
  const slaPct = times.length ? slPct(withinSlaCount, times.length) : null;
  const longestUnassignedMinutes = times.length ? Math.max(...times) : null;
  const reassignments = rows.filter(r => r.previousAssignee && r.previousAssignee.trim()).length;
  // Ticket SLA Breaches: the ticket's own resolution-SLA-breach flag (Neutara's
  // sla_breached, mapped through as row.slaBreached) — how many of this lead's tickets
  // themselves breached SLA, independent of how fast the lead assigned them. Rows whose
  // ticket never carried the flag (slaBreached === null/undefined, e.g. rows without the
  // enriched fields) are excluded from both the numerator and denominator.
  const slaTrackedRows = rows.filter(r => r.slaBreached === true || r.slaBreached === false);
  const ticketSlaBreachCount = slaTrackedRows.filter(r => r.slaBreached === true).length;
  const ticketSlaBreachPct = slaTrackedRows.length ? slPct(ticketSlaBreachCount, slaTrackedRows.length) : null;
  return {
    received: total,
    assigned: assignedRows.length,
    selfAssigned: selfAssignedRows.length,
    otherAssigned: otherAssignedRows.length,
    stillUnassigned,
    avgMinutes,
    medianMinutes,
    withinSlaCount,
    assignSlaBreachCount,
    slaPct,
    longestUnassignedMinutes,
    reassignments,
    slaTrackedCount: slaTrackedRows.length,
    ticketSlaBreachCount,
    ticketSlaBreachPct,
  };
}

function slScorecardHtml(leadName, stats) {
  const slaOk = stats.slaPct === null ? null : stats.slaPct >= 90;
  const avgOk = stats.avgMinutes === null ? null : stats.avgMinutes <= SHIFT_LEAD_ASSIGN_SLA_MINUTES;
  const cards = [
    { val: stats.received, lbl: 'Tickets Received', ok: null },
    { val: stats.assigned, lbl: 'Tickets Assigned', ok: null },
    { val: stats.selfAssigned, lbl: 'Self-Assigned', ok: null },
    { val: stats.otherAssigned, lbl: 'Assigned to Others', ok: null },
    { val: stats.stillUnassigned, lbl: 'Still Unassigned', ok: stats.stillUnassigned === 0 ? true : stats.stillUnassigned > 0 ? false : null },
    { val: slFmtMinutes(stats.avgMinutes), lbl: 'Avg. Assignment Time', ok: avgOk },
    { val: slFmtMinutes(stats.medianMinutes), lbl: 'Median Assignment Time', ok: null },
    { val: stats.withinSlaCount, lbl: `Assigned ≤${SHIFT_LEAD_ASSIGN_SLA_MINUTES} min`, ok: null },
    { val: stats.assignSlaBreachCount, lbl: 'Assignment SLA Breaches', ok: stats.assignSlaBreachCount === 0 ? true : stats.assignSlaBreachCount > 0 ? false : null },
    { val: stats.ticketSlaBreachCount, lbl: 'Ticket SLA Breaches', ok: stats.slaTrackedCount === 0 ? null : stats.ticketSlaBreachCount === 0 ? true : false },
    { val: slFmtPct(stats.slaPct), lbl: 'Assignment SLA %', ok: slaOk },
    { val: slFmtMinutes(stats.longestUnassignedMinutes), lbl: 'Longest Unassigned Ticket', ok: null },
    { val: stats.reassignments, lbl: 'Reassignments', ok: stats.reassignments === 0 ? true : null },
  ];
  return `<div class="kpi-scorecard-block">
    <div class="kpi-scorecard-head">${escapeHtml(leadName)} — At a Glance</div>
    <div class="kpi-scorecard-grid">
      ${cards.map(c => `<div class="kpi-score-card ${slGoodClass(c.ok)}">
        <div class="kpi-score-val">${c.val === null || c.val === undefined ? '—' : c.val}</div>
        <div class="kpi-score-lbl">${escapeHtml(c.lbl)}</div>
      </div>`).join('')}
    </div>
  </div>`;
}

function slAssignmentRowHtml(row) {
  const assignMin = slMinutesBetween(row.createdAt, row.assignedAt);
  const withinSla = assignMin === null ? null : assignMin <= SHIFT_LEAD_ASSIGN_SLA_MINUTES;
  const isResolved = row.isResolved !== undefined ? row.isResolved : !!row.resolvedAt;
  const resolvedLabel = row.productType !== undefined
    ? (isResolved
        ? `<span style="color:#15803d;font-weight:600;">✅ Resolved</span>${row.resolutionMinutes !== null && row.resolutionMinutes !== undefined ? ` <span class="kpi-block-hint">in ${slFmtMinutes(row.resolutionMinutes)}</span>` : ''}`
        : `<span style="color:#b45309;font-weight:600;">⏳ Open</span> ${escapeHtml(row.statusName || '')}`)
    : null;
  return `<tr>
    <td><a href="${browseUrl(row.ticketKey)}" target="_blank" rel="noopener">${escapeHtml(row.ticketKey)}</a></td>
    <td>${row.createdAt ? new Date(row.createdAt).toLocaleString() : '—'}</td>
    <td>${escapeHtml(row.assignedByRaw || '—')}</td>
    <td>${escapeHtml(row.assignedTo)}${row.isFirstAssignment ? ' <span class="kpi-block-hint">(first)</span>' : ''}</td>
    <td>${row.assignedAt ? new Date(row.assignedAt).toLocaleString() : '—'}</td>
    <td class="${slGoodClass(withinSla)}">${slFmtMinutes(assignMin)}${withinSla === false ? ' <span class="kpi-block-hint">(SLA breach)</span>' : ''}</td>
    <td>${row.previousAssignee ? escapeHtml(row.previousAssignee) : '—'}</td>
    ${row.productType !== undefined ? `<td>${escapeHtml(row.productType || '—')}</td><td>${resolvedLabel}</td>` : ''}
  </tr>`;
}

// Drill-down modal for Shift Lead assignment rows — reuses the shared modal shell
// (openDetailModal/closeDetailModal from util.js) but renders rows in the assignment-row
// shape (ticketKey/assignedTo/assignedByRaw/...) via the same renderer as the full log table,
// since these rows aren't shaped like raw Jira issues (renderIssueListModal expects .fields).
function slShowRowsModal(title, rows) {
  // Two possible shapes land here: raw Jira-ish issues (from slLastRangeMatchedIssues, with
  // .fields) go through the shared issue-list modal; Shift Lead assignment rows (ticketKey/
  // assignedTo/...) get their own renderer below, since renderIssueListModal expects .fields.
  if (rows.length && rows[0].fields !== undefined) {
    renderIssueListModal(title, rows);
    return;
  }
  openDetailModal(title, `${rows.length} ticket${rows.length === 1 ? '' : 's'}`);
  const bodyEl = document.getElementById('detailModalBody');
  if (!rows.length) {
    bodyEl.innerHTML = '<div class="empty-state">No tickets behind this number.</div>';
    return;
  }
  const hasEnrichedFields = rows[0].productType !== undefined;
  const sorted = rows.slice().sort((a, b) => new Date(b.assignedAt || b.createdAt) - new Date(a.assignedAt || a.createdAt));
  bodyEl.innerHTML = `<div class="table-scroll"><table class="kpi-table">
    <thead><tr><th>Ticket</th><th>Created At</th><th>Assigned By</th><th>Assigned To</th><th>Assigned At</th><th>Assignment Time</th><th>Previous Assignee</th>${hasEnrichedFields ? '<th>Product Type</th><th>Resolution</th>' : ''}</tr></thead>
    <tbody>${sorted.map(slAssignmentRowHtml).join('')}</tbody>
  </table></div>`;
}
// Wraps a count in a clickable <span> that opens slShowRowsModal for the given rows —
// dropped into the KPI card/tile markup in place of a bare number so every count on this tab
// can be clicked through to the actual tickets it represents. Registers the rows in a
// module-level lookup keyed by a fresh id (template strings can't close over a live callback).
let slDrilldownRegistry = [];
function slClickableCount(count, rows, title) {
  const id = slDrilldownRegistry.length;
  slDrilldownRegistry.push({ rows, title });
  return `<span class="sl-clickable-count" data-drilldown-id="${id}" title="Click to see these tickets">${count}</span>`;
}
document.addEventListener('click', (e) => {
  const countEl = e.target.closest('.sl-clickable-count');
  if (countEl) {
    const entry = slDrilldownRegistry[Number(countEl.dataset.drilldownId)];
    if (entry) slShowRowsModal(entry.title, entry.rows);
    return;
  }
  // Delegated because these buttons are rebuilt fresh into innerHTML on every
  // slRebuildAllPanels pass — a directly-attached listener would be lost each time.
  if (e.target.closest('#slWeekWiseDownloadBtn')) { slDownloadWeekWiseComparisonCsv(); return; }
  if (e.target.closest('#slWeekWiseDownloadImageBtn')) { slDownloadWeekWiseComparisonImage(); return; }
  if (e.target.closest('#slCompareDownloadBtn')) { slDownloadCompareCsv(); return; }
  if (e.target.closest('#slCompareDownloadImageBtn')) slDownloadCompareImage();
});

function slAssignmentLogTableHtml(title, rows, cls) {
  if (!rows.length) {
    return `<div class="kpi-summary-block">
      <div class="kpi-block-header ${cls}">${escapeHtml(title)}</div>
      <div class="empty-state">No real assignment events found for this lead in the current Dev ticket set.</div>
    </div>`;
  }
  const hasEnrichedFields = rows[0].productType !== undefined;
  const sorted = rows.slice().sort((a, b) => new Date(b.assignedAt) - new Date(a.assignedAt));
  return `<div class="kpi-summary-block">
    <div class="kpi-block-header ${cls}">${escapeHtml(title)} <span class="kpi-block-hint">${rows.length} assignment${rows.length === 1 ? '' : 's'} — "(first)" marks a ticket's very first assignment event</span></div>
    <div class="table-wrap"><div class="table-scroll"><table class="kpi-table">
      <thead><tr><th>Ticket</th><th>Created At</th><th>Assigned By</th><th>Assigned To</th><th>Assigned At</th><th>Assignment Time</th><th>Previous Assignee</th>${hasEnrichedFields ? '<th>Product Type</th><th>Resolution</th>' : ''}</tr></thead>
      <tbody>${sorted.map(slAssignmentRowHtml).join('')}</tbody>
    </table></div></div>
  </div>`;
}

// Roster reference block — no longer an entry form (nothing to log manually anymore; data
// comes straight from Neutara's real activity history), just a reminder of who's in scope.
function slEngineerRosterHtml() {
  return `<div class="kpi-block-hint" style="margin:8px 0 14px;">Engineer roster in scope: ${SHIFT_LEAD_ENGINEERS.map(e => escapeHtml(e.name)).join(', ')}</div>`;
}

// Fetches real activity history (via the backend's cached bulk endpoint) for every given
// ticket key, in one batched request, and returns { rowsByKey: { [cfKey]: assignmentRows[] },
// rawByKey: { [cfKey]: fullIssueWithActivity } } — rawByKey is needed by callers that also
// need to inspect department-transfer events (slParseDevTransferEvents), not just assignments.
async function slFetchAssignmentRowsForTickets(cfKeys) {
  if (!cfKeys.length) return { rowsByKey: {}, rawByKey: {} };
  const { issues } = await Api.getNtaIssuesBulk(cfKeys);
  const rowsByKey = {}, rawByKey = {};
  Object.entries(issues).forEach(([key, issue]) => {
    // Enrich with productType/status/resolution straight from the raw issue — without this,
    // rows from this (non-full-scan) fetch path lack productType and the drill-down modal's
    // "Product Type" column silently disappears (hasEnrichedFields check in slShowRowsModal).
    rowsByKey[key] = issue
      ? slParseAssignmentEvents(issue.activity, issue.createdAt, issue.cfKey || key).map(r => ({
          ...r,
          productType: issue.productType || '',
          statusName: (issue.status && issue.status.name) || '',
          resolvedAt: issue.resolvedAt || null,
          isResolved: !!issue.resolvedAt,
          resolutionMinutes: issue.resolvedAt ? slMinutesBetween(issue.createdAt, issue.resolvedAt) : null,
          // Ticket's own resolution-SLA-breach flag, straight from Neutara's raw field (this
          // fetch path returns the RAW NTA issue shape, not the ntaMapper-mapped one — the
          // raw field is `sla_breached`, mapped to `rb` only once ntaMapper.mapIssue runs).
          // NOT the assignment-time SLA computed elsewhere in this file. null when untracked.
          slaBreached: typeof issue.sla_breached === 'boolean' ? issue.sla_breached : null,
        }))
      : [];
    rawByKey[key] = issue || null;
  });
  return { rowsByKey, rawByKey };
}

let slAllAssignmentRows = []; // flattened across every fetched ticket, refreshed by loadUnassignedDevSection
let slFullFirstAssignees = []; // full-scan results (all current Dev tickets), refreshed by slLoadFirstAssigneeReport / slRunFullDevTransferCheck

// Converts a full-scan firstAssignees row into the same shape slComputeLeadStats expects
// (it was originally written for the browser-local slParseAssignmentEvents rows).
function slFirstAssigneeToRow(r) {
  return {
    ticketKey: r.cfKey,
    createdAt: r.createdAt,
    assignedByRaw: r.assignedByRaw,
    assignedTo: r.assignedTo,
    assignedAt: r.assignedAt,
    previousAssignee: '',
    isFirstAssignment: true,
    productType: r.productType,
    statusName: r.statusName,
    resolvedAt: r.resolvedAt,
    isResolved: r.isResolved,
    resolutionMinutes: r.resolutionMinutes,
    slaBreached: r.slaBreached,
  };
}

// ---- Week-wise report (Shift Lead + per-person/engineer breakdown) ----------------------
// Buckets rows into Monday-start ISO weeks keyed by the row's createdAt (when the ticket
// landed in the lead's queue), most-recent week first. Reuses slComputeLeadStats so every
// figure here (avg/median assignment time, SLA %, self vs. other-assigned, etc.) matches
// exactly what the all-time scorecard above shows, just sliced by week.
function slWeekStartIso(dateStr) {
  const d = new Date(dateStr);
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}
function slWeekLabel(weekStartIso) {
  const start = new Date(weekStartIso + 'T00:00:00Z');
  const end = new Date(start); end.setUTCDate(end.getUTCDate() + 6);
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  const fmtNoYear = (d) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const fmtWithYear = (d) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  // Show the year on the start date only when the week spans a year boundary (Dec -> Jan);
  // always show it on the end date so the range's year is never ambiguous.
  return `${(sameYear ? fmtNoYear : fmtWithYear)(start)} – ${fmtWithYear(end)}`;
}
function slGroupRowsByWeek(rows) {
  const byWeek = new Map();
  rows.forEach(r => {
    if (!r.createdAt) return;
    const wk = slWeekStartIso(r.createdAt);
    if (!byWeek.has(wk)) byWeek.set(wk, []);
    byWeek.get(wk).push(r);
  });
  return Array.from(byWeek.entries()).sort((a, b) => b[0].localeCompare(a[0])); // newest week first
}
// Per-engineer breakdown within one week's rows: how many tickets each engineer (the
// "person" assignedTo) received from this lead that week, resolution rate, avg resolution time.
function slPersonBreakdownHtml(weekRows) {
  const byPerson = new Map();
  weekRows.forEach(r => {
    const person = (r.assignedTo && r.assignedTo.trim()) || 'Unassigned';
    if (!byPerson.has(person)) byPerson.set(person, []);
    byPerson.get(person).push(r);
  });
  const people = Array.from(byPerson.entries()).sort((a, b) => b[1].length - a[1].length);
  const rowsHtml = people.map(([person, prows]) => {
    const resolved = prows.filter(r => (r.isResolved !== undefined ? r.isResolved : !!r.resolvedAt));
    const resTimes = resolved.map(r => r.resolutionMinutes).filter(v => v !== null && v !== undefined);
    const avgRes = resTimes.length ? resTimes.reduce((a, b) => a + b, 0) / resTimes.length : null;
    const assignTimes = prows.map(r => slMinutesBetween(r.createdAt, r.assignedAt)).filter(v => v !== null);
    const avgAssign = assignTimes.length ? assignTimes.reduce((a, b) => a + b, 0) / assignTimes.length : null;
    return `<tr>
      <td>${escapeHtml(person)}</td>
      <td>${prows.length}</td>
      <td>${slFmtMinutes(avgAssign)}</td>
      <td>${resolved.length}/${prows.length}</td>
      <td>${slFmtPct(slPct(resolved.length, prows.length))}</td>
      <td>${slFmtMinutes(avgRes)}</td>
    </tr>`;
  }).join('');
  return `<div class="table-scroll"><table class="kpi-table">
    <thead><tr><th>Person (Engineer)</th><th>Tickets Received</th><th>Avg. Assignment Time</th><th>Resolved</th><th>Resolution Rate</th><th>Avg. Resolution Time</th></tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table></div>`;
}
// Shared bar-chart constants: how many recent weeks to plot, and the fixed color assigned
// to each Shift Lead (index-matched to SHIFT_LEADS) so a lead's color stays consistent
// across the single-lead chart and the cross-lead comparison chart.
const SL_CHART_MAX_WEEKS = 8;
const SL_LEAD_COLORS = ['#2563eb', '#f97316', '#16a34a', '#a855f7'];

function slWeekWiseReportHtml(rows) {
  const weeks = slGroupRowsByWeek(rows);
  if (!weeks.length) {
    return `<div class="kpi-summary-block">
      <div class="kpi-block-header kpi-head-both">Week-Wise Report</div>
      <div class="empty-state">No dated rows to break down by week yet.</div>
    </div>`;
  }
  // Only the most recent week opens expanded by default — older weeks collapse behind a
  // <details> so switching to a lead's tab doesn't dump N weeks x (scorecard + person table)
  // onto the page at once. Users can still open any older week on demand.
  const blocksHtml = weeks.map(([weekStart, weekRows], idx) => {
    const stats = slComputeLeadStats(weekRows, null); // leadName null: self-assigned split not meaningful per-week here
    const slaOk = stats.slaPct === null ? null : stats.slaPct >= 90;
    const isCurrent = idx === 0;
    const body = `
      <div class="kpi-scorecard-grid" style="padding:12px;">
        <div class="kpi-score-card"><div class="kpi-score-val">${stats.received}</div><div class="kpi-score-lbl">Received</div></div>
        <div class="kpi-score-card"><div class="kpi-score-val">${stats.assigned}</div><div class="kpi-score-lbl">Assigned</div></div>
        <div class="kpi-score-card ${slGoodClass(stats.stillUnassigned === 0 ? true : stats.stillUnassigned > 0 ? false : null)}"><div class="kpi-score-val">${stats.stillUnassigned}</div><div class="kpi-score-lbl">Still Unassigned</div></div>
        <div class="kpi-score-card"><div class="kpi-score-val">${slFmtMinutes(stats.avgMinutes)}</div><div class="kpi-score-lbl">Avg. Assignment Time</div></div>
        <div class="kpi-score-card"><div class="kpi-score-val">${slFmtMinutes(stats.medianMinutes)}</div><div class="kpi-score-lbl">Median Assignment Time</div></div>
        <div class="kpi-score-card ${slGoodClass(slaOk)}"><div class="kpi-score-val">${slFmtPct(stats.slaPct)}</div><div class="kpi-score-lbl">Assignment SLA %</div></div>
        <div class="kpi-score-card ${slGoodClass(stats.reassignments === 0 ? true : null)}"><div class="kpi-score-val">${stats.reassignments}</div><div class="kpi-score-lbl">Reassignments</div></div>
      </div>
      <div class="kpi-block-hint" style="margin:8px 0 4px;padding:0 12px;">By person (engineer) this week:</div>
      ${slPersonBreakdownHtml(weekRows)}`;
    return `<details class="kpi-week-collapsible"${isCurrent ? ' open' : ''}>
      <summary><div class="kpi-block-header kpi-head-both">Week of ${slWeekLabel(weekStart)}${isCurrent ? ' <span class="kpi-block-hint">(most recent)</span>' : ''} <span class="kpi-block-hint">${weekRows.length} ticket${weekRows.length === 1 ? '' : 's'} received</span></div></summary>
      ${body}
    </details>`;
  }).join('');
  return `<div class="kpi-summary-block">
    <div class="kpi-block-header kpi-head-both">Week-Wise Report <span class="kpi-block-hint">${weeks.length} week${weeks.length === 1 ? '' : 's'} with activity, most recent first</span></div>
    ${slSingleLeadBarChartHtml(weeks)}
    ${blocksHtml}
  </div>`;
}

// Single-series bar chart: one bar per week (oldest -> newest, left to right) for one lead's
// "tickets received" count, capped to the most recent N weeks so the chart stays readable.
// Rendered at hero size (220-280px tall bars) — this is the centerpiece chart at the top of
// a lead's own panel, matching the sizing of the cross-lead comparison chart.
function slSingleLeadBarChartHtml(weeksNewestFirst, opts) {
  const weeks = weeksNewestFirst.slice(0, SL_CHART_MAX_WEEKS).slice().reverse();
  if (weeks.length < 2) return ''; // a chart isn't useful with only one data point
  const counts = weeks.map(([, weekRows]) => weekRows.length);
  const maxCount = Math.max(1, ...counts);
  const barHeightPx = (opts && opts.heroSize) ? 240 : 80;
  const barsHtml = weeks.map(([weekStart], i) => {
    const count = counts[i];
    const heightPct = Math.round((count / maxCount) * 100);
    const isLatest = i === weeks.length - 1;
    return `<div class="sl-chart-bar-col" style="flex:1;min-width:${(opts && opts.heroSize) ? 46 : 32}px;" title="${slWeekLabel(weekStart)}: ${count}">
      <div class="sl-chart-bar-val">${count}</div>
      <div style="width:100%;max-width:${(opts && opts.heroSize) ? 40 : 26}px;height:${barHeightPx}px;display:flex;align-items:flex-end;">
        <div class="sl-chart-bar-fill" style="height:${heightPct}%;background:${isLatest ? '#2563eb' : '#93c5fd'};"></div>
      </div>
      <div class="sl-chart-bar-week">${slWeekLabel(weekStart).split(' – ')[0]}</div>
    </div>`;
  }).join('');
  if (opts && opts.heroSize) {
    return `<div class="sl-chart-panel">
      <div class="sl-chart-title">Tickets Received per Week</div>
      <div class="sl-chart-hint">${weeksNewestFirst.length > SL_CHART_MAX_WEEKS ? `Last ${SL_CHART_MAX_WEEKS} weeks` : 'All weeks with activity'}, most recent on the right</div>
      <div class="sl-chart-plot sl-chart-plot-grid">${barsHtml}</div>
    </div>`;
  }
  return `<div class="kpi-block-hint" style="padding:0 12px;">Tickets received per week${weeksNewestFirst.length > SL_CHART_MAX_WEEKS ? ` (last ${SL_CHART_MAX_WEEKS} weeks)` : ''}</div>
    <div style="display:flex;gap:6px;padding:8px 12px 12px;align-items:flex-end;overflow-x:auto;">${barsHtml}</div>`;
}

function buildShiftLeadPanel(leadKey) {
  const pageId = `shiftlead-${leadKey}`;
  const page = document.getElementById(pageId);
  if (!page) return;
  const leadName = SHIFT_LEADS.find(l => l.key === leadKey).name;
  // Prefer the full-scan (all current Dev tickets) data once it's been loaded at least once;
  // falls back to whatever's been fetched locally by Dev Board Tickets (capped, date-scoped)
  // before the full scan has ever run. Only counts a ticket's FIRST-EVER assignment — a lead
  // who merely reassigns a ticket later (not its original assignment) isn't credited here.
  const source = slFullFirstAssignees.length
    ? slFullFirstAssignees.filter(r => r.byShiftLead && r.leadName === leadName).map(slFirstAssigneeToRow)
    : slAllAssignmentRows.filter(r => r.isFirstAssignment && slFindLead(r.assignedByRaw) && slFindLead(r.assignedByRaw).key === leadKey);
  const rows = source;
  const stats = slComputeLeadStats(rows, leadName);
  const resolvedRows = rows.filter(r => r.isResolved !== undefined ? r.isResolved : !!r.resolvedAt);
  const resolutionTimes = resolvedRows.map(r => r.resolutionMinutes).filter(v => v !== null && v !== undefined);
  const avgResolutionMinutes = resolutionTimes.length ? resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length : null;
  const productTypeCounts = {};
  rows.forEach(r => { const p = r.productType || 'Unknown'; productTypeCounts[p] = (productTypeCounts[p] || 0) + 1; });
  const productTypeHtml = Object.entries(productTypeCounts).sort((a, b) => b[1] - a[1])
    .map(([p, c]) => `<span class="kpi-score-card" style="padding:6px 12px;"><b>${c}</b> ${escapeHtml(p)}</span>`).join(' ');

  const weeksForChart = slGroupRowsByWeek(rows);

  page.innerHTML = `
  <div class="sl-lead-card">
    <div class="sl-lead-card-head">
      <h3>${escapeHtml(leadName)}</h3>
      <span class="kpi-block-hint">Shift Lead assignment performance</span>
    </div>
    <div class="kpi-targets-bar">
      <span class="kpi-targets-label">TARGETS</span>
      <span>Avg. Assignment Time: <b>&le;${SHIFT_LEAD_ASSIGN_SLA_MINUTES} min</b></span>
      <span>Assignment SLA %: <b>&ge;90%</b></span>
      <span>Still Unassigned: <b>0</b></span>
      <span>Reassignments: <b>0</b></span>
    </div>
    <div class="kpi-block-hint" style="margin:6px 0 14px;">${slFullFirstAssignees.length
      ? 'Computed from the full-scan real assignment history across ALL current Dev tickets — not a manual log, not date-limited.'
      : 'Computed from the Dev tickets currently loaded below (see "Dev Board Tickets") — run "Check ALL Dev tickets" for the full picture across every current Dev ticket.'
    } Only counts tickets this lead FIRST assigned; later reassignments by this lead of someone else's original assignment aren't counted here.</div>

    ${slSingleLeadBarChartHtml(weeksForChart, { heroSize: true })}

    ${slScorecardHtml(leadName, stats)}
    <details class="kpi-collapsible">
      <summary><div class="kpi-block-header kpi-head-both">Resolution &amp; Product Mix <span class="kpi-block-hint">How many of this lead's tickets got resolved, how fast, and what type</span></div></summary>
      <div class="kpi-summary-block" style="margin-top:0;">
        <div class="kpi-scorecard-grid" style="padding:12px;">
          <div class="kpi-score-card"><div class="kpi-score-val">${resolvedRows.length}/${rows.length}</div><div class="kpi-score-lbl">Resolved</div></div>
          <div class="kpi-score-card"><div class="kpi-score-val">${slFmtPct(slPct(resolvedRows.length, rows.length))}</div><div class="kpi-score-lbl">Resolution Rate</div></div>
          <div class="kpi-score-card"><div class="kpi-score-val">${slFmtMinutes(avgResolutionMinutes)}</div><div class="kpi-score-lbl">Avg. Resolution Time</div></div>
        </div>
        <div style="padding:0 12px 12px;display:flex;flex-wrap:wrap;gap:8px;">${productTypeHtml || '<span class="kpi-block-hint">No data</span>'}</div>
      </div>
    </details>
    ${slWeekWiseReportHtml(rows)}
    <details class="kpi-collapsible">
      <summary><div class="kpi-block-header kpi-head-both">Full Assignment Log <span class="kpi-block-hint">Every first-assignment this lead made, ticket by ticket</span></div></summary>
      ${slAssignmentLogTableHtml('First Assignments Made', rows, 'kpi-head-both')}
    </details>
  </div>
  `;
}

// Same first-assignment-only rule and full-scan preference used by buildShiftLeadPanel —
// shared here so the comparison table (all-time and week-wise) stays consistent with it.
function slRowsForLead(lead) {
  return slFullFirstAssignees.length
    ? slFullFirstAssignees.filter(r => r.byShiftLead && r.leadName === lead.name).map(slFirstAssigneeToRow)
    : slAllAssignmentRows.filter(r => r.isFirstAssignment && slFindLead(r.assignedByRaw) && slFindLead(r.assignedByRaw).key === lead.key);
}

// Reads the "Shift Leads Compared" range inputs — '' on either side means unbounded. Rows
// are filtered by createdAt (inclusive on both ends), matching the Dev Board Tickets filter
// convention elsewhere on this tab.
function slCompareRangeFilter() {
  const fromInput = document.getElementById('shiftLeadCompareFromInput');
  const toInput = document.getElementById('shiftLeadCompareToInput');
  const from = fromInput ? fromInput.value : '';
  const to = toInput ? toInput.value : '';
  return (rows) => {
    if (!from && !to) return rows;
    return rows.filter(r => {
      if (!r.createdAt) return false;
      const day = new Date(r.createdAt).toISOString().slice(0, 10);
      if (from && day < from) return false;
      if (to && day > to) return false;
      return true;
    });
  };
}

// Week-wise cross-lead comparison — all 4 leads side by side, one table per week, newest
// week first. Weeks come from the union of every lead's weeks so a week with activity from
// only one lead still shows a row (zeros) for the others.
// Small CSS bar chart: one cluster of bars per week (oldest -> newest, left to right), one
// bar per Shift Lead within a cluster, height scaled to "tickets received" that week. Caps
// to the most recent N weeks so the chart stays readable instead of scrolling forever.
// Hero-sized clustered bar chart: one cluster of bars per week (oldest -> newest, left to
// right), one bar per Shift Lead within a cluster, height scaled to "tickets received" that
// week. This is the dashboard's visual centerpiece (goal 2) — real height (240px bars),
// 12-13px labels, a legend, and a baseline/gridline backdrop — not the old ~90px mini chart.
// `standalone` (default true) wraps the plot in its own .sl-chart-panel with title/hint; pass
// false to embed just the plot+legend inside an existing panel (used by the comparison block).
function slWeekWiseBarChartHtml(rowsByLead, weeksNewestFirst, opts) {
  const standalone = !opts || opts.standalone !== false;
  const weeks = weeksNewestFirst.slice(0, SL_CHART_MAX_WEEKS).slice().reverse(); // oldest -> newest for left-to-right reading
  if (!weeks.length) return standalone ? '<div class="empty-state">No dated rows to break down by week yet.</div>' : '';
  const perWeekCounts = weeks.map(weekStart =>
    rowsByLead.map(({ rows }) => rows.filter(r => r.createdAt && slWeekStartIso(r.createdAt) === weekStart).length));
  const maxCount = Math.max(1, ...perWeekCounts.flat());
  const legendHtml = rowsByLead.map(({ lead }, i) =>
    `<span class="sl-chart-legend-item">
      <span class="sl-chart-legend-swatch" style="background:${SL_LEAD_COLORS[i % SL_LEAD_COLORS.length]};"></span>${escapeHtml(lead.name)}
    </span>`).join('');
  const barHeightPx = 240;
  const clustersHtml = weeks.map((weekStart, wi) => {
    const counts = perWeekCounts[wi];
    const barsHtml = rowsByLead.map(({ lead }, i) => {
      const count = counts[i];
      const heightPct = Math.round((count / maxCount) * 100);
      return `<div class="sl-chart-bar-col" style="flex:1;min-width:22px;" title="${escapeHtml(lead.name)}: ${count}">
        <div class="sl-chart-bar-val">${count || ''}</div>
        <div style="width:100%;max-width:26px;height:${barHeightPx}px;display:flex;align-items:flex-end;">
          <div class="sl-chart-bar-fill" style="height:${heightPct}%;background:${SL_LEAD_COLORS[i % SL_LEAD_COLORS.length]};"></div>
        </div>
      </div>`;
    }).join('');
    return `<div class="sl-chart-cluster" style="min-width:${22 * rowsByLead.length + 16}px;">
      <div class="sl-chart-bars">${barsHtml}</div>
      <div class="sl-chart-bar-week">${slWeekLabel(weekStart).split(' – ')[0]}</div>
    </div>`;
  }).join('');
  const body = `<div class="sl-chart-plot sl-chart-plot-grid">${clustersHtml}</div>
    <div class="sl-chart-legend">${legendHtml}</div>`;
  if (!standalone) return body;
  return `<div class="sl-chart-title">Tickets Received per Week, by Shift Lead</div>
    <div class="sl-chart-hint">${weeksNewestFirst.length > SL_CHART_MAX_WEEKS ? `Last ${SL_CHART_MAX_WEEKS} weeks` : 'All weeks with activity'}, most recent on the right</div>
    ${body}`;
}

// Computes the week x lead stat grid shared by slWeekWiseComparisonHtml (rendering) and
// slDownloadWeekWiseComparisonCsv (export) — one row per (week, lead) pair, newest week
// first, so both consumers stay in sync with a single source of truth.
function slWeekWiseComparisonRows() {
  const applyRange = slCompareRangeFilter();
  const rowsByLead = SHIFT_LEADS.map(lead => ({ lead, rows: applyRange(slRowsForLead(lead)) }));
  const allWeeks = new Set();
  rowsByLead.forEach(({ rows }) => slGroupRowsByWeek(rows).forEach(([wk]) => allWeeks.add(wk)));
  const weeks = Array.from(allWeeks).sort((a, b) => b.localeCompare(a));
  const table = weeks.map(weekStart => ({
    weekStart,
    leads: rowsByLead.map(({ lead, rows }) => {
      const weekRows = rows.filter(r => r.createdAt && slWeekStartIso(r.createdAt) === weekStart);
      return { lead, stats: slComputeLeadStats(weekRows, lead.name) };
    }),
  }));
  return { weeks, table };
}

function slWeekWiseComparisonHtml() {
  const { weeks, table } = slWeekWiseComparisonRows();
  if (!weeks.length) {
    return '<div class="empty-state">No dated rows to break down by week yet.</div>';
  }
  // Same clustered bar chart used at the top of the page (received tickets per week, by
  // Shift Lead) — shown here too so the chart and the detailed per-week tables sit together,
  // and both feed the same "Image" download below.
  const applyRange = slCompareRangeFilter();
  const rowsByLead = SHIFT_LEADS.map(lead => ({ lead, rows: applyRange(slRowsForLead(lead)) }));
  const chartHtml = slWeekWiseBarChartHtml(rowsByLead, weeks, { standalone: false });
  const blocks = table.map(({ weekStart, leads }, idx) => {
    const isCurrent = idx === 0;
    const rowsHtml = leads.map(({ lead, stats }) => {
      const slaOk = stats.slaPct === null ? null : stats.slaPct >= 90;
      return `<tr>
        <td>${escapeHtml(lead.name)}</td>
        <td>${stats.received}</td>
        <td>${stats.assigned}</td>
        <td class="${slGoodClass(stats.stillUnassigned === 0 ? true : stats.stillUnassigned > 0 ? false : null)}">${stats.stillUnassigned}</td>
        <td>${slFmtMinutes(stats.avgMinutes)}</td>
        <td>${slFmtMinutes(stats.medianMinutes)}</td>
        <td class="${slGoodClass(slaOk)}">${slFmtPct(stats.slaPct)}</td>
        <td>${stats.reassignments}</td>
      </tr>`;
    }).join('');
    return `<details class="kpi-week-collapsible"${isCurrent ? ' open' : ''}>
      <summary><div class="kpi-block-header kpi-head-both">Week of ${slWeekLabel(weekStart)}${isCurrent ? ' <span class="kpi-block-hint">(most recent)</span>' : ''}</div></summary>
      <div class="table-scroll"><table class="kpi-table">
        <thead><tr><th>Shift Lead</th><th>Received</th><th>Assigned</th><th>Still Unassigned</th><th>Avg. Assign Time</th><th>Median Assign Time</th><th>Assignment SLA %</th><th>Reassignments</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table></div>
    </details>`;
  }).join('');
  return `${chartHtml}
  <div class="kpi-block-hint" style="margin:16px 0 4px;display:flex;align-items:center;gap:8px;">
    <span>${weeks.length} week${weeks.length === 1 ? '' : 's'} with activity, most recent first.</span>
    <button type="button" class="secondary" id="slWeekWiseDownloadBtn" style="margin-left:auto;font-size:12px;padding:5px 12px;">⬇ CSV</button>
    <button type="button" class="secondary" id="slWeekWiseDownloadImageBtn" style="font-size:12px;padding:5px 12px;">🖼 Image</button>
  </div>${blocks}`;
}

// Minimal CSV field escaper — wraps in quotes and doubles embedded quotes whenever the
// value contains a comma, quote, or newline (RFC 4180).
function slCsvField(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// ---- Image report export (SVG -> PNG, no external library) -----------------------------
// Builds a purpose-made report image: a title, then one plain data table per section, laid
// out and rendered as an SVG (all native browser APIs — no html2canvas or CDN dependency,
// consistent with the rest of this app), then rasterized to a PNG for download. This is a
// clean tabular rendering of the data, not a pixel screenshot of the on-screen cards/tables.
function slSvgEscape(s) {
  return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
}

// CloudFuze brand palette for downloadable image reports — matches the deep blue already
// used app-wide for brand accents (.num-link, .tab-btn.active, .rca-manager-title in
// styles.css) rather than the generic teal/gray used elsewhere in this file's on-screen UI.
const SL_BRAND = {
  navy: '#0129AC', // primary brand blue — title band, table headers, axis line
  navyDark: '#031B4E', // deeper shade for section subheadings
  tint: '#DBEAFE', // light blue tint — zebra rows, gridlines background
  ink: '#1f2328',
  sub: '#5b6472',
};

// Renders `sections` (each { heading, columns, rows }) into one tall SVG image and triggers
// a PNG download. Column widths are sized from header/cell text length so tables of
// different shapes (compare cards vs. week-wise) both render legibly without extra config.
// Shared rasterizer: takes a complete <svg>...</svg> string plus its logical width/height,
// draws it into a 2x-scaled canvas for a crisp (non-blurry) PNG, and triggers the download.
// Used by both the table-report export and the bar-chart export below.
function slSvgToPngDownload(svg, width, height, filenameBase) {
  // Explicit pixel size on the <img> itself (not just relying on the SVG's own width/height
  // attributes) — some browsers rasterize a blob-loaded SVG at a wrong/blurry intrinsic size
  // otherwise, especially once <text> is involved.
  const img = new Image(width, height);
  // data: URI instead of a blob: URL for the source SVG — more consistently decoded by
  // <img>/canvas across browsers than a blob: URL for SVG-with-text content, which is the
  // most likely cause of a blank/garbled/blurry result on some Windows/Chrome setups.
  const svgDataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  const finish = () => {
    const scale = 2; // render at 2x for a crisp, non-blurry PNG
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    canvas.toBlob(pngBlob => {
      if (!pngBlob) { alert('Could not generate the image report — please try the CSV download instead.'); return; }
      const pngUrl = URL.createObjectURL(pngBlob);
      const a = document.createElement('a');
      a.href = pngUrl;
      a.download = `${filenameBase}-${todayIso()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Deferred so the click's navigation/download has actually started before we free the
      // blob URL — revoking immediately after click() has raced the download in some browsers.
      setTimeout(() => URL.revokeObjectURL(pngUrl), 1000);
    }, 'image/png');
  };
  img.onload = () => {
    // decode() (where available) waits for the image to be fully decoded, not just
    // "loaded" — drawImage right after the load event can otherwise grab a still-decoding
    // (and therefore blank or partial) frame for larger SVGs.
    if (img.decode) img.decode().then(finish).catch(finish);
    else finish();
  };
  img.onerror = () => {
    alert('Could not generate the image report — please try the CSV download instead.');
  };
  img.src = svgDataUrl;
}

// Renders `sections` (each { heading, columns, rows }) into one tall SVG image and triggers
// a PNG download. Column widths are sized from header/cell text length so tables of
// different shapes (compare cards vs. week-wise) both render legibly without extra config.
function slDownloadImageReport(filenameBase, title, sections) {
  const PAD = 24, ROW_H = 28, HEAD_H = 34, SECTION_GAP = 30, CHAR_W = 7.2;
  const colWidths = sections.map(({ columns, rows }) =>
    columns.map((col, ci) => Math.max(90, (String(col).length) * CHAR_W + 20,
      ...rows.map(r => String(r[ci] === null || r[ci] === undefined ? '—' : r[ci]).length * CHAR_W + 20))));
  const tableWidths = colWidths.map(ws => ws.reduce((a, b) => a + b, 0));
  const width = Math.max(640, PAD * 2 + Math.max(...tableWidths));
  const BAND_H = 56;
  let y = BAND_H + PAD;
  const parts = [];
  // CloudFuze-branded title band across the top of the report.
  parts.push(`<rect x="0" y="0" width="${width}" height="${BAND_H}" fill="${SL_BRAND.navy}"/>`);
  parts.push(`<text x="${PAD}" y="24" font-family="Segoe UI, Arial, sans-serif" font-size="12.5" font-weight="700" letter-spacing="1.5" fill="#ffffff" opacity="0.85">CLOUDFUZE</text>`);
  parts.push(`<text x="${PAD}" y="44" font-family="Segoe UI, Arial, sans-serif" font-size="18" font-weight="700" fill="#ffffff">${slSvgEscape(title)}</text>`);
  sections.forEach(({ heading, columns, rows }, si) => {
    const widths = colWidths[si];
    parts.push(`<text x="${PAD}" y="${y + 16}" font-family="Segoe UI, Arial, sans-serif" font-size="14" font-weight="700" fill="${SL_BRAND.navyDark}">${slSvgEscape(heading)}</text>`);
    y += 24;
    const tableTop = y;
    let x = PAD;
    // Header row background + labels.
    parts.push(`<rect x="${PAD}" y="${y}" width="${tableWidths[si]}" height="${HEAD_H}" fill="${SL_BRAND.navy}"/>`);
    columns.forEach((col, ci) => {
      parts.push(`<text x="${x + 10}" y="${y + 22}" font-family="Segoe UI, Arial, sans-serif" font-size="11" font-weight="700" fill="#ffffff">${slSvgEscape(String(col).toUpperCase())}</text>`);
      x += widths[ci];
    });
    y += HEAD_H;
    rows.forEach((row, ri) => {
      const rowFill = ri % 2 === 0 ? '#ffffff' : SL_BRAND.tint;
      parts.push(`<rect x="${PAD}" y="${y}" width="${tableWidths[si]}" height="${ROW_H}" fill="${rowFill}"/>`);
      x = PAD;
      row.forEach((cell, ci) => {
        parts.push(`<text x="${x + 10}" y="${y + 19}" font-family="Segoe UI, Arial, sans-serif" font-size="12.5" fill="${SL_BRAND.ink}">${slSvgEscape(cell === null || cell === undefined ? '—' : cell)}</text>`);
        x += widths[ci];
      });
      y += ROW_H;
    });
    parts.push(`<rect x="${PAD}" y="${tableTop}" width="${tableWidths[si]}" height="${y - tableTop}" fill="none" stroke="${SL_BRAND.navy}" stroke-width="1"/>`);
    y += SECTION_GAP;
  });
  const height = y + PAD;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"/>
    ${parts.join('\n')}
  </svg>`;
  slSvgToPngDownload(svg, width, height, filenameBase);
}

// Renders a grouped/clustered bar chart (one cluster per week, one bar per Shift Lead) as an
// SVG and downloads it as a PNG — the image-export equivalent of the on-screen
// slWeekWiseBarChartHtml chart, for "tickets received per week, by Shift Lead".
function slDownloadBarChartImage(filenameBase, title, weeks /* oldest->newest */, series /* [{label,color}] */, valuesByWeek /* [[v0,v1,...], ...] same order as weeks */) {
  const BAND_H = 56;
  const PAD_L = 50, PAD_R = 24, PAD_T = BAND_H + 34, PAD_B = 70, PLOT_H = 260;
  const barW = 26, barGap = 4, clusterGap = 34;
  const clusterW = series.length * barW + (series.length - 1) * barGap;
  const plotW = weeks.length * (clusterW + clusterGap);
  const width = Math.max(640, PAD_L + PAD_R + plotW);
  const height = PAD_T + PLOT_H + PAD_B;
  const maxVal = Math.max(1, ...valuesByWeek.flat());
  const gridLines = 4;
  const parts = [];
  // CloudFuze-branded title band across the top of the report, matching the table export.
  parts.push(`<rect x="0" y="0" width="${width}" height="${BAND_H}" fill="${SL_BRAND.navy}"/>`);
  parts.push(`<text x="${PAD_L}" y="24" font-family="Segoe UI, Arial, sans-serif" font-size="12.5" font-weight="700" letter-spacing="1.5" fill="#ffffff" opacity="0.85">CLOUDFUZE</text>`);
  parts.push(`<text x="${PAD_L}" y="44" font-family="Segoe UI, Arial, sans-serif" font-size="18" font-weight="700" fill="#ffffff">${slSvgEscape(title)}</text>`);
  // Horizontal gridlines (light brand tint) + y-axis value labels.
  for (let g = 0; g <= gridLines; g++) {
    const val = Math.round((maxVal / gridLines) * g);
    const gy = PAD_T + PLOT_H - (val / maxVal) * PLOT_H;
    parts.push(`<line x1="${PAD_L}" y1="${gy}" x2="${width - PAD_R}" y2="${gy}" stroke="${SL_BRAND.tint}" stroke-width="1"/>`);
    parts.push(`<text x="${PAD_L - 10}" y="${gy + 4}" font-family="Segoe UI, Arial, sans-serif" font-size="11" fill="${SL_BRAND.sub}" text-anchor="end">${val}</text>`);
  }
  // Bars, one cluster per week.
  weeks.forEach((weekLabel, wi) => {
    const clusterX = PAD_L + wi * (clusterW + clusterGap);
    series.forEach((s, si) => {
      const val = valuesByWeek[wi][si] || 0;
      const barH = (val / maxVal) * PLOT_H;
      const bx = clusterX + si * (barW + barGap);
      const by = PAD_T + PLOT_H - barH;
      parts.push(`<rect x="${bx}" y="${by}" width="${barW}" height="${barH}" fill="${s.color}" rx="2"/>`);
      if (val > 0) parts.push(`<text x="${bx + barW / 2}" y="${by - 6}" font-family="Segoe UI, Arial, sans-serif" font-size="11" font-weight="700" fill="${SL_BRAND.ink}" text-anchor="middle">${val}</text>`);
    });
    parts.push(`<text x="${clusterX + clusterW / 2}" y="${PAD_T + PLOT_H + 20}" font-family="Segoe UI, Arial, sans-serif" font-size="12" fill="${SL_BRAND.sub}" text-anchor="middle">${slSvgEscape(weekLabel)}</text>`);
  });
  parts.push(`<line x1="${PAD_L}" y1="${PAD_T + PLOT_H}" x2="${width - PAD_R}" y2="${PAD_T + PLOT_H}" stroke="${SL_BRAND.navy}" stroke-width="1.5"/>`);
  // Legend, centered under the plot — sized per-item from its actual label (a fixed
  // 130px slot was too narrow for 4 series and/or a narrow plot, pushing earlier legend
  // items to a negative x (off-canvas, invisible) when legendItemW * series.length > plotW.
  // Centering against the full image width (not just plotW) keeps it on-canvas regardless.
  const legendItemWidths = series.map(s => s.label.length * 7 + 34);
  const legendTotalW = legendItemWidths.reduce((a, b) => a + b, 0);
  let legendX = Math.max(PAD_L, (width - legendTotalW) / 2);
  const legendY = height - 24;
  series.forEach((s, si) => {
    parts.push(`<rect x="${legendX}" y="${legendY - 10}" width="12" height="12" rx="2" fill="${s.color}"/>`);
    parts.push(`<text x="${legendX + 18}" y="${legendY}" font-family="Segoe UI, Arial, sans-serif" font-size="12" fill="${SL_BRAND.ink}">${slSvgEscape(s.label)}</text>`);
    legendX += legendItemWidths[si];
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"/>
    ${parts.join('\n')}
  </svg>`;
  slSvgToPngDownload(svg, width, height, filenameBase);
}

// Downloads the Week-Wise Comparison grid as a CSV, using plain numeric/minute values
// (not the HTML-formatted strings used for on-screen display) so the file is easy to open
// and re-chart in Excel/Sheets.
function slDownloadWeekWiseComparisonCsv() {
  const { table } = slWeekWiseComparisonRows();
  const header = ['Week', 'Shift Lead', 'Received', 'Assigned', 'Still Unassigned', 'Avg Assign Time (min)', 'Median Assign Time (min)', 'Assignment SLA %', 'Reassignments'];
  const lines = [header.map(slCsvField).join(',')];
  table.forEach(({ weekStart, leads }) => {
    leads.forEach(({ lead, stats }) => {
      lines.push([
        slWeekLabel(weekStart),
        lead.name,
        stats.received,
        stats.assigned,
        stats.stillUnassigned,
        stats.avgMinutes === null ? '' : Math.round(stats.avgMinutes),
        stats.medianMinutes === null ? '' : Math.round(stats.medianMinutes),
        stats.slaPct === null ? '' : stats.slaPct.toFixed(1),
        stats.reassignments,
      ].map(slCsvField).join(','));
    });
  });
  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `shift-lead-week-wise-comparison-${todayIso()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Downloads the Week-Wise Comparison grid as an image (PNG) — one table section per week,
// same figures as the CSV export, rendered via slDownloadImageReport.
// Exports the same clustered bar chart shown on-screen (tickets received per week, by Shift
// Lead) as a PNG — a graph, not a data table, matching what's rendered in
// slWeekWiseComparisonHtml via slWeekWiseBarChartHtml.
function slDownloadWeekWiseComparisonImage() {
  const { table } = slWeekWiseComparisonRows();
  const oldestFirst = table.slice().reverse(); // table is newest-first; charts read left->right oldest->newest
  const weekLabels = oldestFirst.map(({ weekStart }) => slWeekLabel(weekStart).split(' – ')[0]);
  const series = SHIFT_LEADS.map((lead, i) => ({ label: lead.name, color: SL_LEAD_COLORS[i % SL_LEAD_COLORS.length] }));
  const valuesByWeek = oldestFirst.map(({ leads }) => leads.map(({ stats }) => stats.received));
  slDownloadBarChartImage('shift-lead-week-wise-comparison', 'Tickets Received per Week, by Shift Lead', weekLabels, series, valuesByWeek);
}

// Renders the hero (top-of-page) cross-lead comparison chart plus KPI row into their own
// containers — called by slRebuildAllPanels alongside the detailed comparison table.
function slBuildHeroSection() {
  const chartPanel = document.getElementById('shiftLeadHeroChartPanel');
  const heroRow = document.getElementById('shiftLeadHeroRow');
  if (!chartPanel && !heroRow) return;
  const rowsByLead = SHIFT_LEADS.map(lead => ({ lead, rows: slRowsForLead(lead) }));
  const allWeeks = new Set();
  rowsByLead.forEach(({ rows }) => slGroupRowsByWeek(rows).forEach(([wk]) => allWeeks.add(wk)));
  const weeks = Array.from(allWeeks).sort((a, b) => b.localeCompare(a));

  if (chartPanel) {
    chartPanel.innerHTML = weeks.length
      ? slWeekWiseBarChartHtml(rowsByLead, weeks, { standalone: true })
      : '<div class="empty-state">No dated rows to break down by week yet.</div>';
  }

  if (heroRow) {
    const allRows = rowsByLead.flatMap(({ rows }) => rows);
    const totalReceived = allRows.length;
    const times = allRows.map(r => slMinutesBetween(r.createdAt, r.assignedAt)).filter(v => v !== null);
    const avgMinutes = times.length ? times.reduce((a, b) => a + b, 0) / times.length : null;
    const withinSla = times.filter(v => v <= SHIFT_LEAD_ASSIGN_SLA_MINUTES).length;
    const slaPct = times.length ? slPct(withinSla, times.length) : null;
    const unassignedRows = allRows.filter(r => !r.assignedTo || !r.assignedTo.trim());
    const stillUnassigned = unassignedRows.length;
    const tiles = [
      { val: slClickableCount(totalReceived, allRows, 'Tickets Received — All Shift Leads'), lbl: 'Tickets Received', sub: 'All shift leads, current filter', ok: null },
      { val: slFmtMinutes(avgMinutes), lbl: 'Avg. Assignment Time', sub: `Target ≤${SHIFT_LEAD_ASSIGN_SLA_MINUTES} min`, ok: avgMinutes === null ? null : avgMinutes <= SHIFT_LEAD_ASSIGN_SLA_MINUTES },
      { val: slFmtPct(slaPct), lbl: 'Assignment SLA %', sub: 'Target ≥90%', ok: slaPct === null ? null : slaPct >= 90 },
      { val: slClickableCount(stillUnassigned, unassignedRows, 'Still Unassigned — All Shift Leads'), lbl: 'Still Unassigned', sub: 'Target 0', ok: stillUnassigned === 0 ? true : stillUnassigned > 0 ? false : null },
    ];
    heroRow.innerHTML = tiles.map(t => `<div class="sl-hero-tile ${slGoodClass(t.ok)}">
      <div class="sl-hero-val">${t.val === null || t.val === undefined ? '—' : t.val}</div>
      <div class="sl-hero-lbl">${escapeHtml(t.lbl)}</div>
      <div class="sl-hero-sub">${escapeHtml(t.sub)}</div>
    </div>`).join('');
  }
}

// Cross-lead comparison — computed from the same real-history rows as each lead panel,
// narrowed to whatever date range is set in the toolbar above (unbounded by default). Shown
// as one simple card per lead (5 key numbers) instead of a wide, scroll-to-see-it-all table —
// the full metric set is still available per-lead in each Shift Lead's own tab below.
// Computes the same per-lead card data used by buildShiftLeadComparisonTable's HTML render,
// factored out so slDownloadCompareCsv can export it without duplicating the metric/product-
// type logic. Returns one entry per lead: { lead, stats, productTypeEntries }.
function slCompareCardData() {
  const applyRange = slCompareRangeFilter();
  return SHIFT_LEADS.map(lead => {
    const rows = applyRange(slRowsForLead(lead));
    const stats = slComputeLeadStats(rows, lead.name);
    const assignedRows = rows.filter(r => r.assignedTo && r.assignedTo.trim());
    const unassignedRows = rows.filter(r => !r.assignedTo || !r.assignedTo.trim());
    const productTypeCounts = {};
    assignedRows.forEach(r => { const p = r.productType || 'Unknown'; productTypeCounts[p] = (productTypeCounts[p] || 0) + 1; });
    const productTypeEntries = Object.entries(productTypeCounts).sort((a, b) => b[1] - a[1]);
    const crossAssign = slComputeCrossAssignment(assignedRows, lead.domain);
    return { lead, rows, stats, assignedRows, unassignedRows, productTypeEntries, crossAssign };
  });
}

function buildShiftLeadComparisonTable() {
  const el = document.getElementById('shiftLeadComparisonSection');
  if (!el) return;
  const cardData = slCompareCardData();
  const cardsHtml = cardData.map(({ lead, rows, stats, assignedRows, unassignedRows, productTypeEntries, crossAssign }) => {
    const slaOk = stats.slaPct === null ? null : stats.slaPct >= 90;
    // Product-type mix of what this lead actually assigned — distinct-type count as a
    // clickable KPI (opens the full list), plus small chips below showing each type's count.
    const productTypeChipsHtml = productTypeEntries.length
      ? productTypeEntries.map(([p, c]) => {
          const typeRows = assignedRows.filter(r => (r.productType || 'Unknown') === p);
          return `<span class="sl-product-chip">${slClickableCount(c, typeRows, `${lead.name} — ${p}`)} ${escapeHtml(p)}</span>`;
        }).join('')
      : '<span class="kpi-block-hint">No data</span>';
    const crossOk = crossAssign.crossPct === null ? null : crossAssign.crossDomain === 0;
    const crossValHtml = !lead.domain
      ? '<span class="kpi-block-hint">N/A</span>'
      : crossAssign.classified === 0
      ? '<span class="kpi-block-hint">No data</span>'
      : `${slClickableCount(crossAssign.crossDomain, crossAssign.crossRows, `${lead.name} — Cross-Assigned (outside ${lead.domain})`)} (${slFmtPct(crossAssign.crossPct)})`;
    return `<div class="sl-lead-compare-card">
      <div class="sl-lead-compare-name">${escapeHtml(lead.name)}${lead.domain ? ` <span class="kpi-block-hint">(${escapeHtml(lead.domain)})</span>` : ''}</div>
      <div class="sl-lead-compare-metrics">
        <div class="sl-lead-compare-metric"><div class="sl-lead-compare-val">${slClickableCount(stats.received, rows, `${lead.name} — Received`)}</div><div class="sl-lead-compare-lbl">Received</div></div>
        <div class="sl-lead-compare-metric"><div class="sl-lead-compare-val">${slClickableCount(stats.assigned, assignedRows, `${lead.name} — Assigned`)}</div><div class="sl-lead-compare-lbl">Assigned</div></div>
        <div class="sl-lead-compare-metric"><div class="sl-lead-compare-val ${slGoodClass(stats.stillUnassigned === 0 ? true : stats.stillUnassigned > 0 ? false : null)}">${slClickableCount(stats.stillUnassigned, unassignedRows, `${lead.name} — Still Unassigned`)}</div><div class="sl-lead-compare-lbl">Still Unassigned</div></div>
        <div class="sl-lead-compare-metric"><div class="sl-lead-compare-val">${slFmtMinutes(stats.avgMinutes)}</div><div class="sl-lead-compare-lbl">Avg. Assign Time</div></div>
        <div class="sl-lead-compare-metric"><div class="sl-lead-compare-val ${slGoodClass(slaOk)}">${slFmtPct(stats.slaPct)}</div><div class="sl-lead-compare-lbl">Assignment SLA %</div></div>
        <div class="sl-lead-compare-metric"><div class="sl-lead-compare-val ${slGoodClass(stats.slaTrackedCount === 0 ? null : stats.ticketSlaBreachCount === 0 ? true : false)}">${stats.slaTrackedCount === 0 ? '<span class="kpi-block-hint">N/A</span>' : slClickableCount(stats.ticketSlaBreachCount, rows.filter(r => r.slaBreached === true), `${lead.name} — Ticket SLA Breaches`)}</div><div class="sl-lead-compare-lbl">Ticket SLA Breaches</div></div>
        <div class="sl-lead-compare-metric"><div class="sl-lead-compare-val">${productTypeEntries.length}</div><div class="sl-lead-compare-lbl">Product Types</div></div>
        <div class="sl-lead-compare-metric"><div class="sl-lead-compare-val ${slGoodClass(crossOk)}">${crossValHtml}</div><div class="sl-lead-compare-lbl">Cross-Assigned</div></div>
      </div>
      <div class="sl-product-chip-row">${productTypeChipsHtml}</div>
    </div>`;
  }).join('');
  el.innerHTML = `<div class="kpi-block-hint" style="margin-bottom:10px;display:flex;align-items:center;gap:8px;">
    <span>Key numbers per Shift Lead, current filter.</span>
    <button type="button" class="secondary" id="slCompareDownloadBtn" style="margin-left:auto;font-size:12px;padding:5px 12px;">⬇ CSV</button>
    <button type="button" class="secondary" id="slCompareDownloadImageBtn" style="font-size:12px;padding:5px 12px;">🖼 Image</button>
  </div>
  <div class="sl-lead-compare-grid">${cardsHtml}</div>
  <div class="kpi-block-header kpi-head-both" style="border-radius:8px;margin-top:18px;">Week-Wise Comparison <span class="kpi-block-hint">All Shift Leads, same metrics, broken down by week</span></div>
  ${slWeekWiseComparisonHtml()}`;
}

// Downloads the "Shift Leads Compared" cards as a CSV — one row per lead, with every metric
// shown on the card plus a "Product Type: X" column per distinct product type seen across
// all leads (0 where a lead has none of that type), so the sheet stays tidy/rectangular.
function slDownloadCompareCsv() {
  const cardData = slCompareCardData();
  const allProductTypes = Array.from(new Set(cardData.flatMap(d => d.productTypeEntries.map(([p]) => p)))).sort();
  const header = ['Shift Lead', 'Domain', 'Received', 'Assigned', 'Still Unassigned', 'Avg Assign Time (min)', 'Assignment SLA %', 'Ticket SLA Breaches', 'Ticket SLA Breach %', 'Distinct Product Types', 'Cross-Assigned Tickets', 'Cross-Assigned %', 'Not Cross-Assigned %', ...allProductTypes.map(p => `Product Type: ${p}`)];
  const lines = [header.map(slCsvField).join(',')];
  cardData.forEach(({ lead, stats, productTypeEntries, crossAssign }) => {
    const countByType = Object.fromEntries(productTypeEntries);
    lines.push([
      lead.name,
      lead.domain || 'N/A',
      stats.received,
      stats.assigned,
      stats.stillUnassigned,
      stats.avgMinutes === null ? '' : Math.round(stats.avgMinutes),
      stats.slaPct === null ? '' : stats.slaPct.toFixed(1),
      stats.slaTrackedCount ? stats.ticketSlaBreachCount : 'N/A',
      stats.ticketSlaBreachPct === null ? 'N/A' : stats.ticketSlaBreachPct.toFixed(1),
      productTypeEntries.length,
      lead.domain ? crossAssign.crossDomain : 'N/A',
      lead.domain && crossAssign.crossPct !== null ? crossAssign.crossPct.toFixed(1) : 'N/A',
      lead.domain && crossAssign.inDomainPct !== null ? crossAssign.inDomainPct.toFixed(1) : 'N/A',
      ...allProductTypes.map(p => countByType[p] || 0),
    ].map(slCsvField).join(','));
  });
  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `shift-leads-compared-${todayIso()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Downloads the "Shift Leads Compared" cards as an image (PNG) — same one-row-per-lead
// figures as the CSV export, plus a per-lead product-type mix table, rendered as one image.
function slDownloadCompareImage() {
  const cardData = slCompareCardData();
  const mainSection = {
    heading: 'Key Numbers',
    columns: ['Shift Lead', 'Received', 'Assigned', 'Still Unassigned', 'Avg Assign', 'SLA %', 'Ticket SLA Breaches', 'Product Types'],
    rows: cardData.map(({ lead, stats, productTypeEntries }) => [
      lead.name,
      stats.received,
      stats.assigned,
      stats.stillUnassigned,
      slFmtMinutes(stats.avgMinutes),
      slFmtPct(stats.slaPct),
      stats.slaTrackedCount ? `${stats.ticketSlaBreachCount} (${slFmtPct(stats.ticketSlaBreachPct)})` : 'N/A',
      productTypeEntries.length,
    ]),
  };
  const allProductTypes = Array.from(new Set(cardData.flatMap(d => d.productTypeEntries.map(([p]) => p)))).sort();
  const productSection = allProductTypes.length ? {
    heading: 'Product Type Mix',
    columns: ['Shift Lead', ...allProductTypes],
    rows: cardData.map(({ lead, productTypeEntries }) => {
      const countByType = Object.fromEntries(productTypeEntries);
      return [lead.name, ...allProductTypes.map(p => countByType[p] || 0)];
    }),
  } : null;
  // Cross-Assignment section: for each lead with a designated domain, how many of their
  // assigned tickets fall outside that domain (should have been routed to the Content/
  // Email/Messaging lead who owns it), as a count and %, plus the inverse "stayed in
  // domain" % so a 0% cross-assign rate reads as compliant rather than as missing data.
  const crossSection = {
    heading: 'Cross-Assignment (vs. designated domain)',
    columns: ['Shift Lead', 'Domain', 'Cross-Assigned', 'Cross-Assigned %', 'Not Cross-Assigned %'],
    rows: cardData.map(({ lead, crossAssign }) => lead.domain
      ? [
          lead.name,
          lead.domain,
          crossAssign.classified ? crossAssign.crossDomain : '—',
          crossAssign.crossPct === null ? 'N/A' : slFmtPct(crossAssign.crossPct),
          crossAssign.inDomainPct === null ? 'N/A' : slFmtPct(crossAssign.inDomainPct),
        ]
      : [lead.name, 'N/A', 'N/A', 'N/A', 'N/A']),
  };
  slDownloadImageReport('shift-leads-compared', 'Shift Leads Compared', productSection ? [mainSection, productSection, crossSection] : [mainSection, crossSection]);
}

function slRebuildAllPanels() {
  slDrilldownRegistry = []; // every render pass rebuilds all count->rows mappings from scratch
  SHIFT_LEADS.forEach(l => buildShiftLeadPanel(l.key));
  buildShiftLeadComparisonTable();
  slBuildHeroSection();
}

// Raw Dev-ticket issues matched by the last slFetchRowsForRange call — kept around (not just
// the derived assignment rows) so the "Tickets Created" / "Not by a Shift Lead" overview
// counts can drill down to real issue records via the shared renderIssueListModal.
let slLastRangeMatchedIssues = [];

// Fetches real assignment history for every Dev ticket created/resolved in [from, to]
// (either bound optional) and refreshes slAllAssignmentRows — the same fetch loadUnassignedDevSection
// does, factored out so the "Shift Leads Compared" range picker can trigger a real fetch for
// its own range instead of silently filtering whatever happens to already be in memory.
// Returns { matchedCount, fetchedCount } for status reporting.
async function slFetchRowsForRange(from, to) {
  const data = await Api.getNtaCurrent().catch(() => null);
  if (!data) { slAllAssignmentRows = []; slLastRangeMatchedIssues = []; return { matchedCount: 0, fetchedCount: 0 }; }
  const inRange = (iso) => {
    if (!iso) return false;
    const day = new Date(iso).toISOString().slice(0, 10);
    if (from && day < from) return false;
    if (to && day > to) return false;
    return true;
  };
  const hasRange = !!(from || to);
  let matches = data.issues.filter(i => i.cfKey && i.department === 'Dev');
  if (hasRange) matches = matches.filter(i => inRange(i.fields.created) || inRange(i.fields.resolutiondate));
  slLastRangeMatchedIssues = matches;
  if (!matches.length) { slAllAssignmentRows = []; return { matchedCount: 0, fetchedCount: 0 }; }
  const FETCH_CAP = 300;
  const capped = matches.slice(0, FETCH_CAP);
  const { rowsByKey: historyByKey } = await slFetchAssignmentRowsForTickets(capped.map(i => i.cfKey.toUpperCase())).catch(() => ({ rowsByKey: {} }));
  slAllAssignmentRows = Object.values(historyByKey).flat();
  return { matchedCount: matches.length, fetchedCount: capped.length };
}

// Overview line above the per-lead cards: total Dev tickets created in the picked range,
// and how many of those were first-assigned by one of the 4 tracked Shift Leads vs. not —
// answers "how many tickets came in, and how many did a Shift Lead actually assign" at a
// glance, before drilling into the per-lead breakdown below.
// Product-type mix chips for a set of raw Dev-ticket issues (mapped shape: i.fields.productType)
// — used by the overview card's "Tickets Created" / "Not by a Shift Lead" counts. See
// buildShiftLeadComparisonTable's inline version for the equivalent over assignment rows
// (r.productType, a different shape — issues here haven't gone through slParseAssignmentEvents).
function slProductTypeChipsForIssues(issues, titlePrefix) {
  const counts = {};
  issues.forEach(i => { const p = (i.fields && i.fields.productType) || 'Unknown'; counts[p] = (counts[p] || 0) + 1; });
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return { chipsHtml: '<span class="kpi-block-hint">No data</span>', typeCount: 0 };
  const chipsHtml = entries.map(([p, c]) => {
    const typeIssues = issues.filter(i => ((i.fields && i.fields.productType) || 'Unknown') === p);
    return `<span class="sl-product-chip">${slClickableCount(c, typeIssues, `${titlePrefix} — ${p}`)} ${escapeHtml(p)}</span>`;
  }).join('');
  return { chipsHtml, typeCount: entries.length };
}

function slBuildCompareOverview(totalCreated) {
  const el = document.getElementById('shiftLeadCompareOverview');
  if (!el) return;
  const applyRange = slCompareRangeFilter();
  const assignedRows = SHIFT_LEADS.flatMap(lead => applyRange(slRowsForLead(lead)));
  const assignedByLead = assignedRows.length;
  const assignedKeys = new Set(assignedRows.map(r => r.ticketKey));
  const notByLeadIssues = slLastRangeMatchedIssues.filter(i => !assignedKeys.has((i.cfKey || '').toUpperCase()) && !assignedKeys.has(i.cfKey));
  const notByLead = Math.max(0, totalCreated - assignedByLead);
  const created = slProductTypeChipsForIssues(slLastRangeMatchedIssues, 'Tickets Created');
  const notByLeadMix = slProductTypeChipsForIssues(notByLeadIssues, 'Not by a Shift Lead');
  el.innerHTML = `<div class="sl-lead-compare-grid" style="margin-bottom:14px;">
    <div class="sl-lead-compare-card">
      <div class="sl-lead-compare-name">All Shift Leads — Overview</div>
      <div class="sl-lead-compare-metrics">
        <div class="sl-lead-compare-metric"><div class="sl-lead-compare-val">${slClickableCount(totalCreated, slLastRangeMatchedIssues, 'Tickets Created — Dev, this range')}</div><div class="sl-lead-compare-lbl">Tickets Created (Dev, this range)</div></div>
        <div class="sl-lead-compare-metric"><div class="sl-lead-compare-val good-cell">${slClickableCount(assignedByLead, assignedRows, 'First-Assigned by a Shift Lead')}</div><div class="sl-lead-compare-lbl">First-Assigned by a Shift Lead</div></div>
        <div class="sl-lead-compare-metric"><div class="sl-lead-compare-val ${slGoodClass(notByLead === 0 ? true : notByLead > 0 ? false : null)}">${slClickableCount(notByLead, notByLeadIssues, 'Not by a Shift Lead')}</div><div class="sl-lead-compare-lbl">Not by a Shift Lead</div></div>
        <div class="sl-lead-compare-metric"><div class="sl-lead-compare-val">${slFmtPct(slPct(assignedByLead, totalCreated))}</div><div class="sl-lead-compare-lbl">Shift Lead Coverage</div></div>
      </div>
      <div class="kpi-block-hint" style="margin:10px 0 4px;">Tickets Created — by product type:</div>
      <div class="sl-product-chip-row" style="border-top:none;padding-top:0;margin-top:0;">${created.chipsHtml}</div>
      <div class="kpi-block-hint" style="margin:10px 0 4px;">Not by a Shift Lead — by product type:</div>
      <div class="sl-product-chip-row" style="border-top:none;padding-top:0;margin-top:0;">${notByLeadMix.chipsHtml}</div>
    </div>
  </div>`;
}

// Fires on "Apply" (or "All time") in the "Shift Leads Compared" toolbar — actually fetches
// real assignment history for that range (rather than just filtering whatever's cached from
// the Dev Board Tickets section, which may be empty, stale, or scoped to a different window).
async function slOnCompareRangeChange() {
  const el = document.getElementById('shiftLeadComparisonSection');
  const statusEl = document.getElementById('shiftLeadCompareStatus');
  const overviewEl = document.getElementById('shiftLeadCompareOverview');
  if (el) el.innerHTML = '<div class="empty-state">Fetching real assignment history for this range…</div>';
  if (overviewEl) overviewEl.innerHTML = '';
  if (statusEl) statusEl.textContent = 'Loading…';
  const from = document.getElementById('shiftLeadCompareFromInput').value;
  const to = document.getElementById('shiftLeadCompareToInput').value;
  // Only fetch fresh data when not already using the full-scan result set — the full scan
  // (slFullFirstAssignees) already covers every current Dev ticket, so slRowsForLead's
  // preference for it takes over and this fetch's slAllAssignmentRows becomes the fallback.
  const { matchedCount } = await slFetchRowsForRange(from, to);
  slRebuildAllPanels();
  slBuildCompareOverview(matchedCount); // after slRebuildAllPanels, which clears slDrilldownRegistry
  if (statusEl) {
    statusEl.textContent = from || to
      ? `Updated ${new Date().toLocaleString()} — ${matchedCount} Dev ticket${matchedCount === 1 ? '' : 's'} created/resolved in range`
      : `Updated ${new Date().toLocaleString()} — ${matchedCount} Dev ticket${matchedCount === 1 ? '' : 's'} (all time)`;
  }
}

// Loads Dev Board Tickets (optionally date-filtered), fetches each one's REAL assignment
// history from Neutara (batched, cached server-side), and renders them grouped by which
// Shift Lead's name shows up as the actor on that ticket's most recent assignment event.
// Tickets with no assignee-change event by a recognized Shift Lead land in "Not Yet
// Assigned by a Shift Lead" — either truly untouched, or assigned by someone outside the
// 4-person roster (e.g. self-assigned by an engineer, or an older ticket predating tracking).
async function loadUnassignedDevSection() {
  const statusEl = document.getElementById('unassignedDevStatus');
  const sectionEl = document.getElementById('unassignedDevSection');
  const fromInput = document.getElementById('unassignedDevFromInput');
  const toInput = document.getElementById('unassignedDevToInput');
  const filterFrom = fromInput.value; // '' means unbounded start
  const filterTo = toInput.value; // '' means unbounded end
  statusEl.textContent = 'Loading…';
  const data = await Api.getNtaCurrent().catch(() => null);
  if (!data) {
    statusEl.textContent = '';
    sectionEl.innerHTML = '<div class="empty-state">No Neutara Ticketing sync yet. Trigger one in Settings.</div>';
    return;
  }
  // Inclusive on both ends — a ticket dated exactly on filterFrom or filterTo counts.
  const inRange = (iso) => {
    if (!iso) return false;
    const day = new Date(iso).toISOString().slice(0, 10);
    if (filterFrom && day < filterFrom) return false;
    if (filterTo && day > filterTo) return false;
    return true;
  };
  const hasRange = !!(filterFrom || filterTo);
  let matches = data.issues.filter(i => i.cfKey && i.department === 'Dev');
  if (hasRange) {
    matches = matches.filter(i => inRange(i.fields.created) || inRange(i.fields.resolutiondate));
  }
  const rangeLabel = filterFrom && filterTo ? `created or resolved between ${filterFrom} and ${filterTo}`
    : filterFrom ? `created or resolved on or after ${filterFrom}`
    : filterTo ? `created or resolved on or before ${filterTo}`
    : '';
  if (!matches.length) {
    statusEl.textContent = `Updated ${new Date().toLocaleString()} — 0 tickets`;
    const scope = hasRange ? rangeLabel : 'currently';
    sectionEl.innerHTML = `<div class="empty-state">No CF tickets ${scope} in Dev. 🎉</div>`;
    slAllAssignmentRows = [];
    slRebuildAllPanels();
    return;
  }

  // Fetching real history is one API call per ticket server-side — bound how many we pull
  // per load so a wide all-time/no-date-filter view stays responsive.
  const FETCH_CAP = 300;
  const capped = matches.slice(0, FETCH_CAP);
  statusEl.textContent = `Fetching real assignment history for ${capped.length} of ${matches.length} ticket${matches.length === 1 ? '' : 's'}…`;

  const { rowsByKey: historyByKey, rawByKey } = await slFetchAssignmentRowsForTickets(capped.map(i => i.cfKey.toUpperCase())).catch(() => ({ rowsByKey: {}, rawByKey: {} }));
  slAllAssignmentRows = Object.values(historyByKey).flat();

  statusEl.textContent = `Updated ${new Date().toLocaleString()} — ${matches.length} ticket${matches.length === 1 ? '' : 's'}`
    + (matches.length > FETCH_CAP ? ` (history fetched for the first ${FETCH_CAP}; narrow the date filter to see the rest)` : '');

  const rowHtml = (i) => {
    // Checks the Dev-specific assignee (a ticket keeps a separate assignee per department
    // it has touched), not the single top-level assignee, which reflects whichever
    // department is currently active and can be populated even while Dev has nobody.
    const devAssignee = i.deptAssignees && i.deptAssignees.Dev;
    const assigneeLabel = devAssignee
      ? `<span style="color:#15803d;font-weight:600;">✅ ${escapeHtml(devAssignee.displayName || devAssignee.email)}</span>`
      : '<span style="color:#b91c1c;font-weight:600;">⚠️ Unassigned</span>';
    const ticketRows = historyByKey[i.cfKey.toUpperCase()] || [];
    const latest = ticketRows.slice().sort((a, b) => new Date(b.assignedAt) - new Date(a.assignedAt))[0];
    const first = slFirstAssignee(ticketRows);
    const assignedByLabel = latest ? escapeHtml(latest.assignedByRaw || '—') : '<span class="kpi-block-hint">no assignment event</span>';
    const firstAssigneeLabel = first
      ? `${escapeHtml(first.assignedTo)} <span class="kpi-block-hint">by ${escapeHtml(first.assignedByRaw || '—')}, ${new Date(first.assignedAt).toLocaleString()}</span>`
      : '<span class="kpi-block-hint">no assignment event</span>';
    return `<tr class="${devAssignee ? 'dev-row-assigned' : 'dev-row-unassigned'}">
    <td><a href="${browseUrl(i.cfKey)}" target="_blank" rel="noopener">${escapeHtml(i.cfKey)}</a></td>
    <td>${escapeHtml(i.fields.summary || '')}</td>
    <td>${escapeHtml(i.fields.status.name || '')}</td>
    <td>${assigneeLabel}</td>
    <td>${escapeHtml(i.fields.productType || '—')}</td>
    <td>${i.fields.created ? new Date(i.fields.created).toLocaleString() : '—'}</td>
    <td>${i.fields.resolutiondate ? new Date(i.fields.resolutiondate).toLocaleString() : '—'}</td>
    <td>${firstAssigneeLabel}</td>
    <td>${assignedByLabel}</td>
  </tr>`;
  };

  const theadHtml = `<thead><tr><th>CF Ticket</th><th>Summary</th><th>Status</th><th>Dev Assignee</th><th>Product Type</th><th>Created</th><th>Resolved</th><th>First Assignee</th><th>Last Assigned By</th></tr></thead>`;

  // Groups tickets by which Shift Lead made the ticket's FIRST-EVER assignment — consistent
  // with the per-lead scorecards, which only count first assignments, not later reassignments.
  const groupKeyFor = (i) => {
    const ticketRows = historyByKey[i.cfKey.toUpperCase()] || [];
    const first = slFirstAssignee(ticketRows);
    const lead = first ? slFindLead(first.assignedByRaw) : null;
    return lead ? lead.key : null;
  };
  const groups = new Map();
  groups.set(null, []);
  SHIFT_LEADS.forEach(l => groups.set(l.key, []));
  capped.forEach(i => {
    const key = groupKeyFor(i);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(i);
  });

  const groupBlocks = [];
  const notYetLogged = groups.get(null);
  if (notYetLogged.length) {
    groupBlocks.push(`<div class="kpi-block-header kpi-head-alert" style="border-radius:8px;margin-top:14px;">Not First-Assigned by a Shift Lead <span class="kpi-block-hint">${notYetLogged.length} ticket${notYetLogged.length === 1 ? '' : 's'} — either unassigned, or first assigned by someone outside the 4-person Shift Lead roster</span></div>
      <div class="table-scroll"><table class="kpi-table">${theadHtml}<tbody>${notYetLogged.map(rowHtml).join('')}</tbody></table></div>`);
  }
  SHIFT_LEADS.forEach(lead => {
    const leadTickets = groups.get(lead.key) || [];
    if (!leadTickets.length) return;
    groupBlocks.push(`<div class="kpi-block-header kpi-head-both" style="border-radius:8px;margin-top:14px;">${escapeHtml(lead.name)} <span class="kpi-block-hint">${leadTickets.length} ticket${leadTickets.length === 1 ? '' : 's'} first-assigned</span></div>
      <div class="table-scroll"><table class="kpi-table">${theadHtml}<tbody>${leadTickets.map(rowHtml).join('')}</tbody></table></div>`);
  });

  sectionEl.innerHTML = groupBlocks.join('');

  slRenderDevTransferCheck(capped, rawByKey, historyByKey);
  slRebuildAllPanels();
}

// Shared renderer — takes flat rows of shape { cfKey, transferredAt, transferredBy,
// assignedTo, assignedByRaw, byShiftLead, leadName } (same shape whether computed locally in
// the browser or returned by the server's full-Dev-ticket background crawl).
function slRenderDevTransferCheckRows(rows, scopeNote) {
  const el = document.getElementById('devTransferCheckSection');
  if (!el) return;
  if (!rows.length) {
    el.innerHTML = '<div class="empty-state">No real "transferred/handed to Dev" activity events found.</div>';
    return;
  }
  const byLead = rows.filter(r => r.byShiftLead).length;
  const notByLead = rows.length - byLead;
  const rowsHtml = rows
    .slice().sort((a, b) => new Date(b.transferredAt) - new Date(a.transferredAt))
    .map(c => `<tr class="${c.byShiftLead ? 'dev-row-assigned' : 'dev-row-unassigned'}">
      <td><a href="${browseUrl(c.cfKey)}" target="_blank" rel="noopener">${escapeHtml(c.cfKey)}</a></td>
      <td>${new Date(c.transferredAt).toLocaleString()}</td>
      <td>${escapeHtml(c.transferredBy || '—')}</td>
      <td>${c.assignedTo ? `${escapeHtml(c.assignedTo)} <span class="kpi-block-hint">by ${escapeHtml(c.assignedByRaw || '—')}</span>` : '<span class="kpi-block-hint">no matching assignment event</span>'}</td>
      <td>${c.byShiftLead
        ? `<span style="color:#15803d;font-weight:600;">✅ ${escapeHtml(c.leadName)}</span>`
        : '<span style="color:#b91c1c;font-weight:600;">⚠️ Not a Shift Lead</span>'}</td>
    </tr>`).join('');
  el.innerHTML = `<div class="kpi-block-hint" style="margin-bottom:8px;">${scopeNote} — ${rows.length} Dev-transfer event${rows.length === 1 ? '' : 's'} checked, ${byLead} assigned by a Shift Lead, ${notByLead} not.</div>
    <div class="table-scroll"><table class="kpi-table">
      <thead><tr><th>CF Ticket</th><th>Transferred to Dev At</th><th>Transferred By</th><th>Assignment Tied to Transfer</th><th>Assigned by a Shift Lead?</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table></div>`;
}

// For every ticket that has a real "moved into Dev" activity event (among the tickets
// already fetched by loadUnassignedDevSection above), checks whether the assignment tied to
// that move was made by one of the 4 Shift Leads.
function slRenderDevTransferCheck(issues, rawByKey, historyByKey) {
  const rows = [];
  issues.forEach(i => {
    const raw = rawByKey[i.cfKey.toUpperCase()];
    if (!raw) return;
    const historyRows = historyByKey[i.cfKey.toUpperCase()] || [];
    slDevTransferAssignmentChecks(raw, historyRows).forEach(c => rows.push({
      cfKey: i.cfKey, transferredAt: c.transferredAt, transferredBy: c.transferredBy,
      assignedTo: c.match ? c.match.assignedTo : null, assignedByRaw: c.match ? c.match.assignedByRaw : null,
      byShiftLead: c.byShiftLead, leadName: c.leadName,
    }));
  });
  slRenderDevTransferCheckRows(rows, `Scoped to the ${issues.length} ticket${issues.length === 1 ? '' : 's'} currently loaded above`);
}

// Kicks off the server-side background crawl of EVERY current Dev ticket (not just the
// date-filtered/capped set above) and polls until it finishes, then renders the full result.
async function slRunFullDevTransferCheck() {
  const btn = document.getElementById('devTransferCheckAllBtn');
  const statusEl = document.getElementById('devTransferCheckAllStatus');
  btn.disabled = true;
  await Api.startDevTransferCheck();
  const poll = async () => {
    const status = await Api.getDevTransferCheckStatus();
    if (status.lastError) {
      statusEl.textContent = `Error: ${status.lastError}`;
      btn.disabled = false;
      return;
    }
    if (status.inProgress) {
      statusEl.textContent = `Checking… ${status.checked}/${status.total} Dev tickets`;
      setTimeout(poll, 2000);
      return;
    }
    statusEl.textContent = `Done — checked ${status.checked} Dev tickets.`;
    btn.disabled = false;
    const { results } = await Api.getDevTransferCheckResults();
    slRenderDevTransferCheckRows(results, `Full scan of all ${status.total} current Dev tickets`);
    const { firstAssignees } = await Api.getDevFirstAssignees();
    slFullFirstAssignees = firstAssignees;
    slRebuildAllPanels();
  };
  statusEl.textContent = 'Starting…';
  poll();
}

// Renders the full first-assignee report — one row per current Dev ticket, showing the very
// first real assignee it ever had (populated by the same full-scan crawl as the Dev-transfer
// check, so this just needs that scan to have run at least once).
async function slLoadFirstAssigneeReport() {
  const statusEl = document.getElementById('devFirstAssigneeStatus');
  const sectionEl = document.getElementById('devFirstAssigneeSection');
  statusEl.textContent = 'Loading…';
  const scanStatus = await Api.getDevTransferCheckStatus();
  const { firstAssignees } = await Api.getDevFirstAssignees();
  slFullFirstAssignees = firstAssignees;
  if (!firstAssignees.length) {
    statusEl.textContent = '';
    sectionEl.innerHTML = scanStatus.inProgress
      ? `<div class="empty-state">Full scan is still running (${scanStatus.checked}/${scanStatus.total} checked) — try again shortly.</div>`
      : '<div class="empty-state">No data yet — click "Check ALL Dev tickets" above to run the full scan first.</div>';
    return;
  }
  const byLead = firstAssignees.filter(r => r.byShiftLead).length;
  statusEl.textContent = scanStatus.inProgress
    ? `Showing ${firstAssignees.length} of ${scanStatus.total} (scan still running: ${scanStatus.checked} checked so far)`
    : `${firstAssignees.length} Dev tickets checked, first-assigned as of scan finished ${scanStatus.finishedAt ? new Date(scanStatus.finishedAt).toLocaleString() : '—'}`;
  const rowsHtml = firstAssignees
    .slice().sort((a, b) => new Date(b.assignedAt) - new Date(a.assignedAt))
    .map(r => {
      const resolvedLabel = r.isResolved
        ? `✅ Resolved${r.resolutionMinutes !== null && r.resolutionMinutes !== undefined ? ` <span class="kpi-block-hint">in ${slFmtMinutes(r.resolutionMinutes)}</span>` : ''}`
        : `⏳ ${escapeHtml(r.statusName || 'Open')}`;
      return `<tr class="${r.byShiftLead ? 'dev-row-assigned' : 'dev-row-unassigned'}">
      <td><a href="${browseUrl(r.cfKey)}" target="_blank" rel="noopener">${escapeHtml(r.cfKey)}</a></td>
      <td>${r.createdAt ? new Date(r.createdAt).toLocaleString() : '—'}</td>
      <td>${escapeHtml(r.assignedTo)}</td>
      <td>${escapeHtml(r.assignedByRaw || '—')}${r.byShiftLead ? ` <span class="kpi-block-hint">(Shift Lead: ${escapeHtml(r.leadName)})</span>` : ''}</td>
      <td>${r.assignedAt ? new Date(r.assignedAt).toLocaleString() : '—'}</td>
      <td>${escapeHtml(r.productType || '—')}</td>
      <td>${resolvedLabel}</td>
      <td class="${slGoodClass(r.byShiftLead)}">${r.byShiftLead ? '✅ Yes' : '⚠️ No'}</td>
    </tr>`;
    }).join('');
  sectionEl.innerHTML = `<div class="kpi-block-hint" style="margin-bottom:8px;">${byLead} of ${firstAssignees.length} were first-assigned by one of the 4 tracked Shift Leads.</div>
    <div class="table-scroll"><table class="kpi-table">
      <thead><tr><th>CF Ticket</th><th>Created At</th><th>First Assignee</th><th>Assigned By</th><th>First Assigned At</th><th>Product Type</th><th>Resolution</th><th>By a Shift Lead?</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table></div>`;
  slRebuildAllPanels();
}

// Shared context block — daily count of CF tickets newly created directly into Dev (last 14
// days), computed client-side from the already-fetched main sync snapshot. Not per-lead
// (ticket creation isn't a Shift Lead action) — just volume context alongside their activity.
async function slLoadDailyCreatedToDevSection() {
  const sectionEl = document.getElementById('devDailyCreatedSection');
  const data = await Api.getNtaCurrent().catch(() => null);
  if (!data) {
    sectionEl.innerHTML = '<div class="empty-state">No Neutara Ticketing sync yet.</div>';
    return;
  }
  const devCreated = data.issues.filter(i => i.cfKey && i.department === 'Dev' && i.fields.created);
  const counts = new Map();
  devCreated.forEach(i => {
    const day = new Date(i.fields.created).toISOString().slice(0, 10);
    counts.set(day, (counts.get(day) || 0) + 1);
  });
  const days = Array.from({ length: 14 }, (_, i) => addDaysIso(todayIso(), -i)).reverse();
  const maxCount = Math.max(1, ...days.map(d => counts.get(d) || 0));
  const barsHtml = days.map(d => {
    const count = counts.get(d) || 0;
    const heightPct = Math.round((count / maxCount) * 100);
    const isToday = d === todayIso();
    return `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex:1;min-width:36px;">
      <div style="font-size:11px;font-weight:600;">${count}</div>
      <div style="width:100%;max-width:28px;height:80px;display:flex;align-items:flex-end;">
        <div style="width:100%;height:${heightPct}%;background:${isToday ? '#2563eb' : '#93c5fd'};border-radius:3px 3px 0 0;"></div>
      </div>
      <div style="font-size:10px;color:#6b7280;white-space:nowrap;">${fmtRangeDate(d)}</div>
    </div>`;
  }).join('');
  sectionEl.innerHTML = `<div style="display:flex;gap:6px;padding:12px;align-items:flex-end;overflow-x:auto;">${barsHtml}</div>`;
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('unassignedDevFromInput').value = todayIso();
  document.getElementById('unassignedDevToInput').value = todayIso();
  document.getElementById('refreshUnassignedDevBtn').addEventListener('click', loadUnassignedDevSection);
  document.getElementById('unassignedDevFromInput').addEventListener('change', loadUnassignedDevSection);
  document.getElementById('unassignedDevToInput').addEventListener('change', loadUnassignedDevSection);
  document.getElementById('unassignedDevAllTimeBtn').addEventListener('click', () => {
    document.getElementById('unassignedDevFromInput').value = '';
    document.getElementById('unassignedDevToInput').value = '';
    loadUnassignedDevSection();
  });
  document.getElementById('devTransferCheckAllBtn').addEventListener('click', slRunFullDevTransferCheck);
  document.getElementById('devFirstAssigneeLoadBtn').addEventListener('click', slLoadFirstAssigneeReport);
  document.getElementById('shiftLeadCompareApplyBtn').addEventListener('click', slOnCompareRangeChange);
  document.getElementById('shiftLeadCompareAllTimeBtn').addEventListener('click', () => {
    document.getElementById('shiftLeadCompareFromInput').value = '';
    document.getElementById('shiftLeadCompareToInput').value = '';
    slOnCompareRangeChange();
  });
  slLoadDailyCreatedToDevSection();
  slRebuildAllPanels();
});
