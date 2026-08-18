// Shift Lead tab: separate tracker from Leader Mertices, since its 4 metrics don't fit
// the flag/onTime model used there — assignment speed is an averaged duration (not a %),
// team-routing is a same/different-team comparison (not a checkbox), and RCA compliance
// only applies to tickets that actually breached SLA (conditional, not a plain flag).
// One entry per ticket: created time, assigned time, originating team, assigned team,
// closed-within-shift flag, SLA-breached flag, and (only if breached) RCA-provided flag.
const SHIFT_LEADS = [
  { key: 'abhinandan', name: 'Abhinandan Kumar' },
  { key: 'ravi', name: 'Ravi Srivastava' },
  { key: 'pragati', name: 'Pragati Pandey' },
  { key: 'akhila', name: 'Akhila Aenkoju' },
];
const SHIFT_LEAD_TARGETS = {
  assignMinutesTarget: 30,     // avg assignment time <= 30 min is "good"
  closedWithinShiftPct: 70,    // >= 70%
  rcaOnBreachPct: 100,         // >= 100% (every breach should get an RCA)
};

const SHIFT_LEAD_STORE_KEY = 'shiftLeadTickets';
// Shape: { [leadKey]: [ { id, ticketKey, createdAt, assignedAt, fromTeam, toTeam, closedWithinShift, slaBreached, rcaProvided } ] }

function loadShiftLeadData() {
  try { return JSON.parse(localStorage.getItem(SHIFT_LEAD_STORE_KEY)) || {}; }
  catch (e) { return {}; }
}
function saveShiftLeadData(all) {
  localStorage.setItem(SHIFT_LEAD_STORE_KEY, JSON.stringify(all));
}
function getLeadTickets(all, leadKey) {
  all[leadKey] = all[leadKey] || [];
  return all[leadKey];
}

function slMinutesBetween(fromIso, toIso) {
  if (!fromIso || !toIso) return null;
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  if (!isFinite(ms) || ms < 0) return null;
  return ms / 60000;
}
function slFmtMinutes(v) { return v === null || v === undefined ? '—' : `${Math.round(v)} min`; }
function slFmtPct(v) { return v === null || v === undefined ? '—' : `${v.toFixed(1)}%`; }
function slPct(num, den) { return den ? (num / den) * 100 : null; }
function slGoodClass(ok) { return ok === null ? '' : ok ? 'good-cell' : 'bad-cell'; }

function slComputeAgg(tickets) {
  const total = tickets.length;
  const assignTimes = tickets.map(t => slMinutesBetween(t.createdAt, t.assignedAt)).filter(v => v !== null);
  const avgAssignMinutes = assignTimes.length ? assignTimes.reduce((a, b) => a + b, 0) / assignTimes.length : null;

  const crossTeamCount = tickets.filter(t => t.fromTeam && t.toTeam && t.fromTeam.trim().toLowerCase() !== t.toTeam.trim().toLowerCase()).length;
  const routedCount = tickets.filter(t => t.fromTeam && t.toTeam).length;

  const closedWithinShiftCount = tickets.filter(t => t.closedWithinShift).length;

  const breached = tickets.filter(t => t.slaBreached);
  const rcaProvidedCount = breached.filter(t => t.rcaProvided).length;

  return {
    total,
    avgAssignMinutes,
    crossTeamPct: slPct(crossTeamCount, routedCount),
    closedWithinShiftPct: slPct(closedWithinShiftCount, total),
    breachedCount: breached.length,
    rcaOnBreachPct: breached.length ? slPct(rcaProvidedCount, breached.length) : null,
  };
}

function slScorecardHtml(agg) {
  const assignOk = agg.avgAssignMinutes === null ? null : agg.avgAssignMinutes <= SHIFT_LEAD_TARGETS.assignMinutesTarget;
  const crossTeamOk = agg.crossTeamPct === null ? null : agg.crossTeamPct >= 90;
  const closedOk = agg.closedWithinShiftPct === null ? null : agg.closedWithinShiftPct >= SHIFT_LEAD_TARGETS.closedWithinShiftPct;
  const rcaOk = agg.rcaOnBreachPct === null ? null : agg.rcaOnBreachPct >= SHIFT_LEAD_TARGETS.rcaOnBreachPct;
  const cards = [
    { val: slFmtMinutes(agg.avgAssignMinutes), lbl: 'Avg. Assignment Time', target: `Target: ≤ ${SHIFT_LEAD_TARGETS.assignMinutesTarget} min`, ok: assignOk },
    { val: slFmtPct(agg.crossTeamPct), lbl: 'Cross-Team Routing', target: 'Target: ≥ 90%', ok: crossTeamOk },
    { val: slFmtPct(agg.closedWithinShiftPct), lbl: 'Closed Within Shift', target: `Target: ≥ ${SHIFT_LEAD_TARGETS.closedWithinShiftPct}%`, ok: closedOk },
    { val: agg.breachedCount ? slFmtPct(agg.rcaOnBreachPct) : 'N/A', lbl: 'RCA on SLA Breach', target: agg.breachedCount ? `Target: ≥ ${SHIFT_LEAD_TARGETS.rcaOnBreachPct}% (${agg.breachedCount} breached)` : 'No breaches yet', ok: agg.breachedCount ? rcaOk : null },
  ];
  return `<div class="kpi-scorecard-block">
    <div class="kpi-scorecard-head">This Week at a Glance <span class="kpi-block-hint">${agg.total} ticket${agg.total === 1 ? '' : 's'} logged</span></div>
    <div class="kpi-scorecard-grid">
      ${cards.map(c => `<div class="kpi-score-card ${slGoodClass(c.ok)}">
        <div class="kpi-score-val">${c.val}</div>
        <div class="kpi-score-lbl">${escapeHtml(c.lbl)}</div>
        <div class="kpi-score-target">${escapeHtml(c.target)}</div>
      </div>`).join('')}
    </div>
  </div>`;
}

function slWeeklySummaryHtml(title, ticketsByWeek, monthAgg, cls) {
  const rowHtml = (label, agg) => {
    const assignOk = agg.avgAssignMinutes === null ? null : agg.avgAssignMinutes <= SHIFT_LEAD_TARGETS.assignMinutesTarget;
    const closedOk = agg.closedWithinShiftPct === null ? null : agg.closedWithinShiftPct >= SHIFT_LEAD_TARGETS.closedWithinShiftPct;
    const rcaOk = agg.breachedCount ? agg.rcaOnBreachPct >= SHIFT_LEAD_TARGETS.rcaOnBreachPct : null;
    return `<tr>
      <td>${escapeHtml(label)}</td>
      <td>${agg.total}</td>
      <td class="${slGoodClass(assignOk)}">${slFmtMinutes(agg.avgAssignMinutes)}</td>
      <td>${slFmtPct(agg.crossTeamPct)}</td>
      <td class="${slGoodClass(closedOk)}">${slFmtPct(agg.closedWithinShiftPct)}</td>
      <td class="${slGoodClass(rcaOk)}">${agg.breachedCount ? slFmtPct(agg.rcaOnBreachPct) : 'N/A'}</td>
    </tr>`;
  };
  const rows = ticketsByWeek.map((wt, idx) => rowHtml(`Week ${idx + 1}`, slComputeAgg(wt))).join('');
  return `<div class="kpi-summary-block">
    <div class="kpi-block-header ${cls}">${escapeHtml(title)} — Weekly Summary</div>
    <div class="table-wrap"><div class="table-scroll"><table class="kpi-table">
      <thead><tr><th>Week</th><th>Tickets</th><th>Avg. Assign Time</th><th>Cross-Team %</th><th>Closed Within Shift %</th><th>RCA on Breach %</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot>${rowHtml('MONTH TO', monthAgg)}</tfoot>
    </table></div></div>
  </div>`;
}

function slTicketRowHtml(leadKey, t) {
  const assignMin = slMinutesBetween(t.createdAt, t.assignedAt);
  const crossTeam = (t.fromTeam && t.toTeam) ? (t.fromTeam.trim().toLowerCase() !== t.toTeam.trim().toLowerCase()) : null;
  return `<tr data-ticket-id="${t.id}">
    <td>${escapeHtml(t.ticketKey || '(unnamed)')}</td>
    <td>${t.createdAt ? new Date(t.createdAt).toLocaleString() : '—'}</td>
    <td>${t.assignedAt ? new Date(t.assignedAt).toLocaleString() : '—'}</td>
    <td class="${slGoodClass(assignMin === null ? null : assignMin <= SHIFT_LEAD_TARGETS.assignMinutesTarget)}">${slFmtMinutes(assignMin)}</td>
    <td>${escapeHtml(t.fromTeam || '—')} → ${escapeHtml(t.toTeam || '—')} ${crossTeam === null ? '' : crossTeam ? '✅' : '⚠️'}</td>
    <td>${t.closedWithinShift ? '✅' : ''}</td>
    <td>${t.slaBreached ? '🔴' : ''}</td>
    <td>${t.slaBreached ? (t.rcaProvided ? '✅' : '❌') : '—'}</td>
    <td><button type="button" class="secondary kpi-delete-project-btn" data-leader="${leadKey}" data-project-id="${t.id}">Delete</button></td>
  </tr>`;
}

function slDailyLogHtml(leadKey, shiftKey, shiftLabel, tickets, anchor, cls, expandedWeek) {
  const groups = [];
  for (let w = 0; w < LEADER_METRICS_WEEKS; w++) {
    const isOpen = w === expandedWeek;
    const weekTickets = [];
    for (let d = 0; d < LEADER_METRICS_DAYS; d++) {
      const dateStr = addDaysIso(anchor, w * 7 + d);
      weekTickets.push(...tickets.filter(t => t.shift === shiftKey && t.logDate === dateStr));
    }
    const weekAgg = slComputeAgg(weekTickets);
    let dayRowsHtml = '';
    if (isOpen) {
      for (let d = 0; d < LEADER_METRICS_DAYS; d++) {
        const dateStr = addDaysIso(anchor, w * 7 + d);
        const dayTickets = tickets.filter(t => t.shift === shiftKey && t.logDate === dateStr);
        const isToday = dateStr === todayIso();
        dayRowsHtml += `<tr class="kpi-day-group-row${isToday ? ' kpi-today-row' : ''}"><td colspan="9">
          Day ${d + 1} — ${fmtRangeDate(dateStr)}${isToday ? ' <span class="kpi-today-tag">Today</span>' : ''}
        </td></tr>`;
        if (!dayTickets.length) {
          dayRowsHtml += `<tr><td colspan="9" class="kpi-empty-day">No tickets logged here yet.</td></tr>`;
        } else {
          dayTickets.forEach(t => { dayRowsHtml += slTicketRowHtml(leadKey, t); });
        }
      }
    }
    groups.push(`
      <button type="button" class="kpi-week-toggle${isOpen ? ' open' : ''}" data-leader="${leadKey}" data-toggle-week="${w}">
        <span class="kpi-week-caret">${isOpen ? '▾' : '▸'}</span> Week ${w + 1}
        <span class="kpi-week-toggle-sub">${weekAgg.total} tickets · Avg assign ${slFmtMinutes(weekAgg.avgAssignMinutes)}</span>
      </button>
      ${isOpen ? `<table class="kpi-table kpi-daily-table">
        <thead><tr><th>Ticket</th><th>Created</th><th>Assigned</th><th>Assign Time</th><th>Routing</th><th>Closed in Shift</th><th>SLA Breach</th><th>RCA</th><th></th></tr></thead>
        <tbody>${dayRowsHtml}</tbody>
      </table>` : ''}
    `);
  }
  return `<div class="kpi-summary-block">
    <div class="kpi-block-header ${cls}">Log — ${escapeHtml(shiftLabel)} <span class="kpi-block-hint">Tickets are bucketed by the date logged</span></div>
    <div class="table-wrap">${groups.join('')}</div>
  </div>`;
}

function slAddTicketFormHtml(leadKey, detailsOpen) {
  return `<div class="kpi-add-project">
    <div class="kpi-add-project-title">Log a ticket</div>
    <div class="kpi-add-project-fields">
      <label>Ticket key<input type="text" id="${leadKey}NewTicket" placeholder="e.g. L2B-1234"></label>
      <button type="button" class="secondary" id="${leadKey}FetchTicketBtn">Fetch from tickets</button>
      <label>Shift
        <select id="${leadKey}NewShift">
          ${LEADER_METRICS_SHIFTS.map(s => `<option value="${s.key}">${escapeHtml(s.label)}</option>`).join('')}
        </select>
      </label>
      <label>Log date<input type="date" id="${leadKey}NewLogDate" value="${todayIso()}"></label>
      <button type="button" class="primary" id="${leadKey}AddTicketBtn">Add ticket</button>
    </div>
    <div class="kpi-block-hint" id="${leadKey}FetchStatus" style="margin-top:6px;"></div>
    <button type="button" class="kpi-details-toggle" id="${leadKey}DetailsToggle">
      ${detailsOpen ? '▾' : '▸'} More details <span class="kpi-block-hint">(timestamps, routing, closure, SLA/RCA)</span>
    </button>
    <div class="kpi-add-project-details" style="${detailsOpen ? '' : 'display:none;'}">
      <div class="kpi-add-project-fields">
        <label>Ticket created at<input type="datetime-local" id="${leadKey}NewCreatedAt"></label>
        <label>Assigned at<input type="datetime-local" id="${leadKey}NewAssignedAt"></label>
        <label>Originating team<input type="text" id="${leadKey}NewFromTeam" placeholder="e.g. Support Queue"></label>
        <label>Assigned to team<input type="text" id="${leadKey}NewToTeam" placeholder="e.g. Migration ENT"></label>
      </div>
      <div class="kpi-add-project-checkboxes" style="margin-top:10px;">
        <label class="kpi-add-checkbox"><input type="checkbox" id="${leadKey}NewClosedWithinShift"> Closed within shift</label>
        <label class="kpi-add-checkbox"><input type="checkbox" id="${leadKey}NewSlaBreached"> SLA breached</label>
        <label class="kpi-add-checkbox" id="${leadKey}RcaWrap" style="display:none;"><input type="checkbox" id="${leadKey}NewRcaProvided"> RCA provided</label>
      </div>
    </div>
  </div>`;
}

// Parses "HH:MM" from a LEADER_METRICS_SHIFTS `time` label like "1pm – 10pm" into
// 24-hour start/end hours, so a resolved-at timestamp can be checked against shift hours.
function slShiftHourRange(shiftKey) {
  return shiftKey === 'day' ? { startHour: 13, endHour: 22 } : { startHour: 21, endHour: 6 };
}
function slResolvedWithinShift(resolutiondate, logDate, shiftKey) {
  if (!resolutiondate) return false;
  const { startHour, endHour } = slShiftHourRange(shiftKey);
  const resolved = new Date(resolutiondate);
  const dayStart = new Date(logDate + 'T00:00:00');
  const rangeStart = new Date(dayStart); rangeStart.setHours(startHour, 0, 0, 0);
  let rangeEnd = new Date(dayStart); rangeEnd.setHours(endHour, 0, 0, 0);
  if (endHour <= startHour) rangeEnd.setDate(rangeEnd.getDate() + 1); // overnight shift
  return resolved >= rangeStart && resolved <= rangeEnd;
}

// Looks up a ticket key against the last completed Neutara Ticketing sync and auto-fills
// whatever the API actually exposes (SLA breach, created time, RCA-text presence). There's
// no assignment-timestamp or team-transfer history in the Neutara API (see README), so
// Assigned-at and originating/assigned team stay manual — this only pre-fills what's real.
async function slFetchTicketData(leadKey) {
  const keyInput = document.getElementById(`${leadKey}NewTicket`);
  const statusEl = document.getElementById(`${leadKey}FetchStatus`);
  const ticketKey = keyInput.value.trim().toUpperCase();
  if (!ticketKey) { statusEl.textContent = 'Enter a ticket key first.'; return; }
  statusEl.textContent = 'Looking up…';

  const detailsPanel = document.getElementById(`${leadKey}RcaWrap`) && document.getElementById(`${leadKey}RcaWrap`).closest('.kpi-add-project-details');
  if (detailsPanel && detailsPanel.style.display === 'none') {
    detailsPanel.style.display = '';
    const ui = loadUiState();
    ui[`shiftlead_${leadKey}`] = ui[`shiftlead_${leadKey}`] || {};
    ui[`shiftlead_${leadKey}`].detailsOpen = true;
    saveUiState(ui);
  }

  const data = await Api.getNtaCurrent().catch(() => null);
  if (!data) { statusEl.textContent = 'No Neutara Ticketing sync available — enter details manually.'; return; }
  const issue = data.issues.find(i => (i.key || '').toUpperCase() === ticketKey);
  if (!issue) { statusEl.textContent = `"${ticketKey}" not found in the last sync — enter details manually.`; return; }

  const f = issue.fields || {};
  const shift = document.getElementById(`${leadKey}NewShift`).value;
  const logDate = document.getElementById(`${leadKey}NewLogDate`).value || todayIso();

  if (f.created) document.getElementById(`${leadKey}NewCreatedAt`).value = new Date(f.created).toISOString().slice(0, 16);
  document.getElementById(`${leadKey}NewToTeam`).value = issue.teamKey || issue.department || '';

  const slaCb = document.getElementById(`${leadKey}NewSlaBreached`);
  slaCb.checked = !!issue.rb;
  slaCb.dispatchEvent(new Event('change'));

  if (issue.rb) {
    document.getElementById(`${leadKey}NewRcaProvided`).checked = !!(f.rootCause && f.rootCause.trim());
  }

  document.getElementById(`${leadKey}NewClosedWithinShift`).checked = slResolvedWithinShift(f.resolutiondate, logDate, shift);

  statusEl.textContent = `Loaded "${ticketKey}" — Assigned-at and team-transfer aren't tracked by Neutara Ticketing, so fill those in manually if known.`;
}

function buildShiftLeadPanel(leadKey) {
  const pageId = `shiftlead-${leadKey}`;
  const page = document.getElementById(pageId);
  if (!page) return;
  const all = loadShiftLeadData();
  const tickets = getLeadTickets(all, leadKey);
  const anchor = getAnchor(`shiftlead_${leadKey}`);

  const dayTickets = tickets.filter(t => t.shift === 'day');
  const nightTickets = tickets.filter(t => t.shift === 'night');
  const ticketsByWeek = (list) => Array.from({ length: LEADER_METRICS_WEEKS }, (_, w) => {
    const from = addDaysIso(anchor, w * 7);
    const to = addDaysIso(anchor, w * 7 + 6);
    return list.filter(t => t.logDate >= from && t.logDate <= to);
  });
  const dayByWeek = ticketsByWeek(dayTickets);
  const nightByWeek = ticketsByWeek(nightTickets);
  const bothByWeek = dayByWeek.map((wk, i) => wk.concat(nightByWeek[i]));
  const dayMonthAgg = slComputeAgg(dayByWeek.flat());
  const nightMonthAgg = slComputeAgg(nightByWeek.flat());
  const bothMonthAgg = slComputeAgg(bothByWeek.flat());

  const uiState = loadUiState();
  const uiKey = `shiftlead_${leadKey}`;
  const leadUi = uiState[uiKey] || {};
  const todaySlotForExpand = slotForDate(anchor, todayIso());
  const expandedWeek = leadUi.expandedWeek !== undefined ? leadUi.expandedWeek : (todaySlotForExpand ? todaySlotForExpand.week : 0);
  const currentWeekIdx = todaySlotForExpand ? todaySlotForExpand.week : 0;
  const activeInner = leadUi.innerTab || 'overview';
  const detailsOpen = !!leadUi.detailsOpen;

  const sections = {
    overview: `${slScorecardHtml(slComputeAgg(bothByWeek[currentWeekIdx]))}
      ${slWeeklySummaryHtml('Both Shifts Together', bothByWeek, bothMonthAgg, 'kpi-head-both')}`,
    day: `${slWeeklySummaryHtml('Day Shift', dayByWeek, dayMonthAgg, 'kpi-head-day')}
      ${slDailyLogHtml(leadKey, 'day', 'Day Shift', tickets, anchor, 'kpi-head-day', expandedWeek)}`,
    night: `${slWeeklySummaryHtml('Night Shift', nightByWeek, nightMonthAgg, 'kpi-head-night')}
      ${slDailyLogHtml(leadKey, 'night', 'Night Shift', tickets, anchor, 'kpi-head-night', expandedWeek)}`,
  };

  page.innerHTML = `
    <h3 style="margin:16px 0 10px;">Shift Lead KPI Tracker</h3>
    ${calendarRangeBarHtml(uiKey, anchor)}
    <div class="kpi-targets-bar">
      <span class="kpi-targets-label">TARGETS</span>
      <span>Avg. Assignment Time: <b>&le;${SHIFT_LEAD_TARGETS.assignMinutesTarget} min</b></span>
      <span>Cross-Team Routing: <b>&ge;90%</b></span>
      <span>Closed Within Shift: <b>&ge;${SHIFT_LEAD_TARGETS.closedWithinShiftPct}%</b></span>
      <span>RCA on SLA Breach: <b>&ge;${SHIFT_LEAD_TARGETS.rcaOnBreachPct}%</b></span>
    </div>
    ${slAddTicketFormHtml(leadKey, detailsOpen)}
    ${innerTabsHtml(leadKey, activeInner)}
    <div class="kpi-inner-tab-body">${sections[activeInner] || sections.overview}</div>
  `;

  const slaCb = document.getElementById(`${leadKey}NewSlaBreached`);
  const rcaWrap = document.getElementById(`${leadKey}RcaWrap`);
  if (slaCb && rcaWrap) {
    slaCb.addEventListener('change', () => { rcaWrap.style.display = slaCb.checked ? '' : 'none'; });
  }

  document.getElementById(`${leadKey}FetchTicketBtn`).addEventListener('click', () => slFetchTicketData(leadKey));

  const detailsToggle = document.getElementById(`${leadKey}DetailsToggle`);
  if (detailsToggle) detailsToggle.addEventListener('click', () => {
    const ui = loadUiState();
    ui[uiKey] = ui[uiKey] || {};
    ui[uiKey].detailsOpen = !ui[uiKey].detailsOpen;
    saveUiState(ui);
    buildShiftLeadPanel(leadKey);
  });

  page.querySelectorAll('.kpi-inner-tabs button[data-inner-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      const { innerTab } = btn.dataset;
      const ui = loadUiState();
      ui[uiKey] = ui[uiKey] || {};
      ui[uiKey].innerTab = innerTab;
      saveUiState(ui);
      buildShiftLeadPanel(leadKey);
    });
  });

  document.getElementById(`${leadKey}AddTicketBtn`).addEventListener('click', () => {
    const ticketKey = document.getElementById(`${leadKey}NewTicket`).value.trim();
    const shift = document.getElementById(`${leadKey}NewShift`).value;
    const logDate = document.getElementById(`${leadKey}NewLogDate`).value;
    if (!logDate) { document.getElementById(`${leadKey}NewLogDate`).focus(); return; }
    const createdAtEl = document.getElementById(`${leadKey}NewCreatedAt`);
    const assignedAtEl = document.getElementById(`${leadKey}NewAssignedAt`);
    const slaBreached = document.getElementById(`${leadKey}NewSlaBreached`).checked;
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ticketKey, shift, logDate,
      createdAt: createdAtEl.value || null,
      assignedAt: assignedAtEl.value || null,
      fromTeam: document.getElementById(`${leadKey}NewFromTeam`).value.trim(),
      toTeam: document.getElementById(`${leadKey}NewToTeam`).value.trim(),
      closedWithinShift: document.getElementById(`${leadKey}NewClosedWithinShift`).checked,
      slaBreached,
      rcaProvided: slaBreached ? document.getElementById(`${leadKey}NewRcaProvided`).checked : false,
    };
    const current = loadShiftLeadData();
    getLeadTickets(current, leadKey).push(entry);
    saveShiftLeadData(current);
    buildShiftLeadPanel(leadKey);
  });

  page.querySelectorAll('.kpi-delete-project-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const { leader, projectId } = btn.dataset;
      const current = loadShiftLeadData();
      current[leader] = getLeadTickets(current, leader).filter(t => t.id !== projectId);
      saveShiftLeadData(current);
      buildShiftLeadPanel(leader);
    });
  });

  document.getElementById(`${uiKey}AnchorInput`).addEventListener('change', (e) => {
    if (!e.target.value) return;
    const anchors = loadAnchors();
    anchors[uiKey] = e.target.value;
    saveAnchors(anchors);
    buildShiftLeadPanel(leadKey);
  });
  document.getElementById(`${uiKey}ResetAnchorBtn`).addEventListener('click', () => {
    const anchors = loadAnchors();
    anchors[uiKey] = isoDate(mostRecentMonday(new Date()));
    saveAnchors(anchors);
    buildShiftLeadPanel(leadKey);
  });

  page.querySelectorAll('.kpi-week-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const { toggleWeek } = btn.dataset;
      const ui = loadUiState();
      const w = Number(toggleWeek);
      ui[uiKey] = ui[uiKey] || {};
      ui[uiKey].expandedWeek = ui[uiKey].expandedWeek === w ? -1 : w;
      saveUiState(ui);
      buildShiftLeadPanel(leadKey);
    });
  });
}

// Live check (not history-based — Neutara Ticketing has no changelog) for tickets that
// are CURRENTLY in the Dev department with no assignee, using the last completed sync.
async function loadUnassignedDevSection() {
  const statusEl = document.getElementById('unassignedDevStatus');
  const sectionEl = document.getElementById('unassignedDevSection');
  statusEl.textContent = 'Loading…';
  const data = await Api.getNtaCurrent().catch(() => null);
  if (!data) {
    statusEl.textContent = '';
    sectionEl.innerHTML = '<div class="empty-state">No Neutara Ticketing sync yet. Trigger one in Settings.</div>';
    return;
  }
  // Checks the Dev-specific assignee (a ticket keeps a separate assignee per department it
  // has touched), not the single top-level assignee, which reflects whichever department is
  // currently active and can be populated even while Dev itself has nobody assigned.
  const matches = data.issues.filter(i => i.department === 'Dev' && !(i.deptAssignees && i.deptAssignees.Dev));
  statusEl.textContent = 'Updated ' + new Date().toLocaleString();
  if (!matches.length) {
    sectionEl.innerHTML = '<div class="empty-state">No unassigned tickets currently in Dev. 🎉</div>';
    return;
  }
  const rows = matches.map(i => `<tr>
    <td><a href="${browseUrl(i.key)}" target="_blank" rel="noopener">${escapeHtml(i.key)}</a></td>
    <td>${escapeHtml(i.fields.summary || '')}</td>
    <td>${escapeHtml(i.fields.status.name || '')}</td>
    <td>${i.fields.created ? new Date(i.fields.created).toLocaleDateString() : '—'}</td>
    <td>${i.fields.updated ? new Date(i.fields.updated).toLocaleDateString() : '—'}</td>
  </tr>`).join('');
  sectionEl.innerHTML = `<div class="table-scroll"><table class="kpi-table">
    <thead><tr><th>Key</th><th>Summary</th><th>Status</th><th>Created</th><th>Updated</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

document.addEventListener('DOMContentLoaded', () => {
  SHIFT_LEADS.forEach(l => buildShiftLeadPanel(l.key));
  document.getElementById('refreshUnassignedDevBtn').addEventListener('click', loadUnassignedDevSection);
});
