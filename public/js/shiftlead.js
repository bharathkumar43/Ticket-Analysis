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
const SHIFT_LEADS = [
  { key: 'abhinandan', name: 'Abhinandan Kumar' },
  { key: 'ravi', name: 'Ravi Srivastava' },
  { key: 'pragati', name: 'Pragati Pandey' },
  { key: 'akhila', name: 'Akhila Aenkoju' },
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
  const slaBreachCount = times.length - withinSlaCount;
  const slaPct = times.length ? slPct(withinSlaCount, times.length) : null;
  const longestUnassignedMinutes = times.length ? Math.max(...times) : null;
  const reassignments = rows.filter(r => r.previousAssignee && r.previousAssignee.trim()).length;
  return {
    received: total,
    assigned: assignedRows.length,
    selfAssigned: selfAssignedRows.length,
    otherAssigned: otherAssignedRows.length,
    stillUnassigned,
    avgMinutes,
    medianMinutes,
    withinSlaCount,
    slaBreachCount,
    slaPct,
    longestUnassignedMinutes,
    reassignments,
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
    { val: stats.slaBreachCount, lbl: 'Assignment SLA Breaches', ok: stats.slaBreachCount === 0 ? true : stats.slaBreachCount > 0 ? false : null },
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
  return `<tr>
    <td><a href="${browseUrl(row.ticketKey)}" target="_blank" rel="noopener">${escapeHtml(row.ticketKey)}</a></td>
    <td>${row.createdAt ? new Date(row.createdAt).toLocaleString() : '—'}</td>
    <td>${escapeHtml(row.assignedByRaw || '—')}</td>
    <td>${escapeHtml(row.assignedTo)}${row.isFirstAssignment ? ' <span class="kpi-block-hint">(first)</span>' : ''}</td>
    <td>${row.assignedAt ? new Date(row.assignedAt).toLocaleString() : '—'}</td>
    <td class="${slGoodClass(withinSla)}">${slFmtMinutes(assignMin)}</td>
    <td>${row.previousAssignee ? escapeHtml(row.previousAssignee) : '—'}</td>
  </tr>`;
}

function slAssignmentLogTableHtml(title, rows, cls) {
  if (!rows.length) {
    return `<div class="kpi-summary-block">
      <div class="kpi-block-header ${cls}">${escapeHtml(title)}</div>
      <div class="empty-state">No real assignment events found for this lead in the current Dev ticket set.</div>
    </div>`;
  }
  const sorted = rows.slice().sort((a, b) => new Date(b.assignedAt) - new Date(a.assignedAt));
  return `<div class="kpi-summary-block">
    <div class="kpi-block-header ${cls}">${escapeHtml(title)} <span class="kpi-block-hint">${rows.length} assignment${rows.length === 1 ? '' : 's'} — "(first)" marks a ticket's very first assignment event</span></div>
    <div class="table-wrap"><div class="table-scroll"><table class="kpi-table">
      <thead><tr><th>Ticket</th><th>Created At</th><th>Assigned By</th><th>Assigned To</th><th>Assigned At</th><th>Assignment Time</th><th>Previous Assignee</th></tr></thead>
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
// ticket key, in one batched request, and returns { [cfKey]: assignmentRows[] }.
async function slFetchAssignmentRowsForTickets(cfKeys) {
  if (!cfKeys.length) return {};
  const { issues } = await Api.getNtaIssuesBulk(cfKeys);
  const out = {};
  Object.entries(issues).forEach(([key, issue]) => {
    out[key] = issue ? slParseAssignmentEvents(issue.activity, issue.createdAt, issue.cfKey || key) : [];
  });
  return out;
}

let slAllAssignmentRows = []; // flattened across every fetched ticket, refreshed by loadUnassignedDevSection

function buildShiftLeadPanel(leadKey) {
  const pageId = `shiftlead-${leadKey}`;
  const page = document.getElementById(pageId);
  if (!page) return;
  const leadName = SHIFT_LEADS.find(l => l.key === leadKey).name;
  const rows = slAllAssignmentRows.filter(r => slFindLead(r.assignedByRaw) && slFindLead(r.assignedByRaw).key === leadKey);
  const stats = slComputeLeadStats(rows, leadName);

  page.innerHTML = `
    <h3 style="margin:16px 0 10px;">Shift Lead KPI Tracker — ${escapeHtml(leadName)}</h3>
    <div class="kpi-targets-bar">
      <span class="kpi-targets-label">TARGETS</span>
      <span>Avg. Assignment Time: <b>&le;${SHIFT_LEAD_ASSIGN_SLA_MINUTES} min</b></span>
      <span>Assignment SLA %: <b>&ge;90%</b></span>
      <span>Still Unassigned: <b>0</b></span>
      <span>Reassignments: <b>0</b></span>
    </div>
    <div class="kpi-block-hint" style="margin:6px 0 14px;">Computed from Neutara Ticketing's real assignment history for the Dev tickets currently loaded below (see "Dev Board Tickets") — not a manual log.</div>
    ${slScorecardHtml(leadName, stats)}
    ${slAssignmentLogTableHtml('Assignment History', rows, 'kpi-head-both')}
  `;
}

// Cross-lead comparison table — computed from the same real-history rows as each lead panel.
function buildShiftLeadComparisonTable() {
  const el = document.getElementById('shiftLeadComparisonSection');
  if (!el) return;
  const rowsHtml = SHIFT_LEADS.map(lead => {
    const rows = slAllAssignmentRows.filter(r => slFindLead(r.assignedByRaw) && slFindLead(r.assignedByRaw).key === lead.key);
    const stats = slComputeLeadStats(rows, lead.name);
    const slaOk = stats.slaPct === null ? null : stats.slaPct >= 90;
    return `<tr>
      <td>${escapeHtml(lead.name)}</td>
      <td>${stats.received}</td>
      <td>${stats.assigned}</td>
      <td>${stats.selfAssigned}</td>
      <td>${stats.otherAssigned}</td>
      <td class="${slGoodClass(stats.stillUnassigned === 0 ? true : stats.stillUnassigned > 0 ? false : null)}">${stats.stillUnassigned}</td>
      <td>${slFmtMinutes(stats.avgMinutes)}</td>
      <td>${slFmtMinutes(stats.medianMinutes)}</td>
      <td>${stats.withinSlaCount}</td>
      <td>${stats.slaBreachCount}</td>
      <td class="${slGoodClass(slaOk)}">${slFmtPct(stats.slaPct)}</td>
      <td>${slFmtMinutes(stats.longestUnassignedMinutes)}</td>
      <td>${stats.reassignments}</td>
    </tr>`;
  }).join('');
  el.innerHTML = `<div class="table-scroll"><table class="kpi-table">
    <thead><tr><th>Shift Lead</th><th>Received</th><th>Assigned</th><th>Self-Assigned</th><th>Assigned to Others</th><th>Still Unassigned</th><th>Avg. Assign Time</th><th>Median Assign Time</th><th>Assigned ≤30 min</th><th>SLA Breaches</th><th>Assignment SLA %</th><th>Longest Unassigned</th><th>Reassignments</th></tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table></div>`;
}

function slRebuildAllPanels() {
  SHIFT_LEADS.forEach(l => buildShiftLeadPanel(l.key));
  buildShiftLeadComparisonTable();
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
  const dateInput = document.getElementById('unassignedDevDateInput');
  const filterDate = dateInput.value; // '' means all-time
  statusEl.textContent = 'Loading…';
  const data = await Api.getNtaCurrent().catch(() => null);
  if (!data) {
    statusEl.textContent = '';
    sectionEl.innerHTML = '<div class="empty-state">No Neutara Ticketing sync yet. Trigger one in Settings.</div>';
    return;
  }
  const sameDay = (iso) => iso && new Date(iso).toISOString().slice(0, 10) === filterDate;
  let matches = data.issues.filter(i => i.cfKey && i.department === 'Dev');
  if (filterDate) {
    matches = matches.filter(i => sameDay(i.fields.created) || sameDay(i.fields.resolutiondate));
  }
  if (!matches.length) {
    statusEl.textContent = `Updated ${new Date().toLocaleString()} — 0 tickets`;
    const scope = filterDate ? `created or resolved on ${filterDate}` : 'currently';
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

  const historyByKey = await slFetchAssignmentRowsForTickets(capped.map(i => i.cfKey.toUpperCase())).catch(() => ({}));
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
    <td>${i.fields.created ? new Date(i.fields.created).toLocaleString() : '—'}</td>
    <td>${i.fields.resolutiondate ? new Date(i.fields.resolutiondate).toLocaleString() : '—'}</td>
    <td>${firstAssigneeLabel}</td>
    <td>${assignedByLabel}</td>
  </tr>`;
  };

  const theadHtml = `<thead><tr><th>CF Ticket</th><th>Summary</th><th>Status</th><th>Dev Assignee</th><th>Created</th><th>Resolved</th><th>First Assignee</th><th>Last Assigned By</th></tr></thead>`;

  // Groups tickets by which Shift Lead performed their most recent real assignment event.
  const groupKeyFor = (i) => {
    const ticketRows = historyByKey[i.cfKey.toUpperCase()] || [];
    const latest = ticketRows.slice().sort((a, b) => new Date(b.assignedAt) - new Date(a.assignedAt))[0];
    const lead = latest ? slFindLead(latest.assignedByRaw) : null;
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
    groupBlocks.push(`<div class="kpi-block-header kpi-head-alert" style="border-radius:8px;margin-top:14px;">Not Assigned by a Shift Lead <span class="kpi-block-hint">${notYetLogged.length} ticket${notYetLogged.length === 1 ? '' : 's'} — either unassigned, or assigned by someone outside the 4-person Shift Lead roster</span></div>
      <div class="table-scroll"><table class="kpi-table">${theadHtml}<tbody>${notYetLogged.map(rowHtml).join('')}</tbody></table></div>`);
  }
  SHIFT_LEADS.forEach(lead => {
    const leadTickets = groups.get(lead.key) || [];
    if (!leadTickets.length) return;
    groupBlocks.push(`<div class="kpi-block-header kpi-head-both" style="border-radius:8px;margin-top:14px;">${escapeHtml(lead.name)} <span class="kpi-block-hint">${leadTickets.length} ticket${leadTickets.length === 1 ? '' : 's'} assigned</span></div>
      <div class="table-scroll"><table class="kpi-table">${theadHtml}<tbody>${leadTickets.map(rowHtml).join('')}</tbody></table></div>`);
  });

  sectionEl.innerHTML = groupBlocks.join('');
  slRebuildAllPanels();
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('unassignedDevDateInput').value = todayIso();
  document.getElementById('refreshUnassignedDevBtn').addEventListener('click', loadUnassignedDevSection);
  document.getElementById('unassignedDevDateInput').addEventListener('change', loadUnassignedDevSection);
  document.getElementById('unassignedDevAllTimeBtn').addEventListener('click', () => {
    document.getElementById('unassignedDevDateInput').value = '';
    loadUnassignedDevSection();
  });
  slRebuildAllPanels();
});
