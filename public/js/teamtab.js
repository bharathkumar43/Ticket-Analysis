// Generic "team tab" renderer for Customer Engineering / QA / Infra — mirrors
// TEAM_TAB_DEFS/TEAM_TAB_STATE from the reference artifact. Each tab independently toggles
// between Live Neutara Ticketing (full feature set, including RCA/Fix Description — native
// fields, available to any team, not just Customer Engineering) and Uploaded Excel (the
// old Jira export's First Response/Resolution SLA breach flags only — no
// description/attachment/RCA/Fix Description/reopened-ticket data).

const TEAM_TAB_PAGE_IDS = { eng: 'page-customereng', qa: 'page-qateam', infra: 'page-infrateam' };
const TEAM_TAB_STATE = {};
Object.keys(C.TEAM_TAB_DEFS).forEach(teamKey => {
  TEAM_TAB_STATE[teamKey] = { loaded: false, source: 'live', tickets: [], issues: [], selectedPerson: 'all', summaryMonthIdx: 0 };
});

function buildTeamTabSkeleton(teamKey) {
  const def = C.TEAM_TAB_DEFS[teamKey];
  const pageId = TEAM_TAB_PAGE_IDS[teamKey];
  const page = document.getElementById(pageId);
  page.innerHTML = `
    <h2 id="${teamKey}Heading">${def.label} — all tickets</h2>
    <p class="sub" style="margin-top:-6px" id="${teamKey}SubNote"></p>
    <div class="table-toolbar" style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;">
      <span class="source-toggle">Data source: <select id="${teamKey}SourceSel"><option value="live">Live Neutara Ticketing</option><option value="excel">Uploaded Excel</option></select></span>
      <select id="${teamKey}PersonSel"><option value="all">All ${def.label}</option></select>
      <button class="secondary" id="${teamKey}RefreshBtn">Refresh this tab's data</button>
      <span id="${teamKey}Status" style="font-size:12px;color:#6b7280;align-self:center;"></span>
    </div>
    <h3 style="margin:16px 0 4px;">Monthly summary</h3>
    <div id="${teamKey}Monthly"><div class="empty-state">Switch to this tab to load.</div></div>
    <h3 style="margin:20px 0 4px;">Per-person SLA summary</h3>
    <div id="${teamKey}Summary"></div>
    <h3 style="margin:20px 0 4px;">Summary</h3>
    <div class="cards" id="${teamKey}Cards"></div>
    <div class="table-wrap" style="margin-top:10px">
      <div class="table-scroll">
        <table id="${teamKey}Table">
          <thead><tr><th>Ticket</th><th>Board</th><th>Assignee</th><th>Reporter</th><th>Status</th><th>Summary</th><th>Created</th><th>Updated</th><th>Resolution SLA breached</th>${def.hasRcaFix ? '<th>RCA</th><th>Fix Description</th>' : ''}</tr></thead>
          <tbody id="${teamKey}Body"></tbody>
        </table>
      </div>
    </div>`;

  document.getElementById(`${teamKey}SourceSel`).addEventListener('change', (e) => {
    TEAM_TAB_STATE[teamKey].source = e.target.value;
    loadTeamTabSection(teamKey);
  });
  document.getElementById(`${teamKey}RefreshBtn`).addEventListener('click', () => loadTeamTabSection(teamKey));
  document.getElementById(`${teamKey}PersonSel`).addEventListener('change', (e) => {
    TEAM_TAB_STATE[teamKey].selectedPerson = e.target.value;
    renderTeamTabTable(teamKey);
  });
}

async function loadTeamTabSection(teamKey) {
  const def = C.TEAM_TAB_DEFS[teamKey];
  const state = TEAM_TAB_STATE[teamKey];
  const { fromStr, toStr } = AppState;
  const toExclusiveStr = toExclusive(toStr);
  const statusEl = document.getElementById(`${teamKey}Status`);
  const subNote = document.getElementById(`${teamKey}SubNote`);
  document.getElementById(`${teamKey}Heading`).textContent = `${def.label} — all tickets (${fromStr} to ${toStr}, created or updated) — ${state.source === 'live' ? 'Live Neutara Ticketing' : 'Uploaded Excel'}`;
  statusEl.textContent = 'Loading…';

  if (state.source === 'live') {
    const data = await Api.getNtaCurrent().catch(() => null);
    if (!data) { statusEl.textContent = 'No Neutara Ticketing sync yet. Trigger one in Settings.'; state.tickets = []; state.issues = []; renderTeamTabAll(teamKey); return; }
    subNote.textContent = 'Live Neutara Ticketing: includes Hygiene checks, SLA breach, and Root Cause / Fix Description.';
    const items = Logic.getFileTicketsForTeam(data.issues, teamKey, fromStr, toExclusiveStr);
    state.issues = items;
    state.tickets = items.map(issue => ({ ...Logic.classifyFileTicket(issue), ...Logic.classifyNtaTicket(issue) }));
  } else {
    const data = await Api.getCurrentData().catch(() => null);
    if (!data) { statusEl.textContent = 'No Excel upload found. Upload one in Settings.'; state.tickets = []; state.issues = []; renderTeamTabAll(teamKey); return; }
    subNote.textContent = `Uploaded Excel: covers ${data.meta.dateRange.from || '?'} to ${data.meta.dateRange.to || '?'} only. No description/comment/RCA/Fix Description fields — Hygiene score and Reopened tickets aren't available here.`;
    const items = Logic.getFileTicketsForTeam(data.issues, teamKey, fromStr, toExclusiveStr);
    state.issues = items;
    state.tickets = items.map(Logic.classifyFileTicket);
  }

  state.loaded = true;
  statusEl.textContent = `Loaded ${state.tickets.length} tickets — ` + new Date().toLocaleString();
  populateTeamTabPersonSel(teamKey);
  renderTeamTabAll(teamKey);
}

function populateTeamTabPersonSel(teamKey) {
  const def = C.TEAM_TAB_DEFS[teamKey];
  const state = TEAM_TAB_STATE[teamKey];
  const sel = document.getElementById(`${teamKey}PersonSel`);
  const counts = {};
  state.tickets.forEach(t => { counts[t.assigneeEmail] = (counts[t.assigneeEmail] || 0) + 1; });
  const roster = C.TEAMS[teamKey].map(e => e.toLowerCase()).sort((a, b) => Logic.emailToName(a).localeCompare(Logic.emailToName(b)));
  const options = [`<option value="all">All ${def.label} (${state.tickets.length})</option>`]
    .concat(roster.map(email => `<option value="${escapeHtml(email)}">${escapeHtml(Logic.emailToName(email))} (${counts[email] || 0})</option>`));
  sel.innerHTML = options.join('');
  const stillValid = state.selectedPerson === 'all' || roster.includes(state.selectedPerson);
  state.selectedPerson = stillValid ? state.selectedPerson : 'all';
  sel.value = state.selectedPerson;
}

function renderTeamTabAll(teamKey) {
  renderTeamTabMonthly(teamKey);
  renderTeamTabPersonSummary(teamKey);
  renderTeamTabTable(teamKey);
}

function renderTeamTabMonthly(teamKey) {
  const state = TEAM_TAB_STATE[teamKey];
  const container = document.getElementById(`${teamKey}Monthly`);
  container.innerHTML = '';
  const buckets = Logic.monthBuckets(AppState.fromStr, AppState.toStr).slice(0, C.TEAM_TAB_MONTHLY_CAP);
  if (!buckets.length) { container.innerHTML = '<div class="empty-state">No months in range.</div>'; return; }
  buckets.forEach(bucket => {
    const inBucket = state.tickets.filter(t => t.created && t.created >= bucket.fromStr && t.created < bucket.toExclusiveStr);
    const breached = inBucket.filter(t => t.slaBreached === true);
    const resolvedInTime = inBucket.filter(t => t.slaBreached === false);
    const breachRate = inBucket.length ? (breached.length / inBucket.length * 100) : null;
    const resolutionPct = inBucket.length ? (resolvedInTime.length / inBucket.length * 100) : null;

    const heading = document.createElement('div');
    heading.style.cssText = 'font-weight:600;font-size:13px;margin:12px 0 6px;color:#374151;';
    heading.textContent = bucket.label;
    container.appendChild(heading);
    const row = document.createElement('div');
    row.className = 'cards';
    card(row, inBucket.length, `Total tickets — ${bucket.label}`);
    card(row, resolvedInTime.length, `Resolved tickets — ${bucket.label}`, resolutionPct !== null && resolutionPct < 70 ? 'warn' : 'good', false, undefined, resolutionPct === null ? '' : `${resolutionPct.toFixed(1)}%`);
    card(row, breached.length, `Resolution SLA breached — ${bucket.label}`, breached.length ? 'bad' : 'good');
    card(row, breachRate === null ? null : `${breachRate.toFixed(1)}%`, `Breach rate — ${bucket.label}`, breachRate ? 'bad' : 'good');
    container.appendChild(row);
  });
}

function renderTeamTabPersonSummary(teamKey) {
  const state = TEAM_TAB_STATE[teamKey];
  const container = document.getElementById(`${teamKey}Summary`);
  const roster = C.TEAMS[teamKey].map(e => e.toLowerCase());
  const buckets = Logic.monthBuckets(AppState.fromStr, AppState.toStr);
  if (!buckets.length) { container.innerHTML = '<div class="empty-state">No months in range.</div>'; return; }
  if (!(state.summaryMonthIdx >= 0 && state.summaryMonthIdx < buckets.length)) state.summaryMonthIdx = 0;

  const monthly = buckets.map(bucket => {
    const stats = {};
    roster.forEach(email => { stats[email] = { email, name: Logic.emailToName(email), total: 0, resolvedSameMonth: 0, resBreached: 0, hoursSum: 0, hoursCount: 0 }; });
    state.tickets.forEach(t => {
      if (!t.created || t.created < bucket.fromStr || t.created >= bucket.toExclusiveStr) return;
      const p = stats[t.assigneeEmail];
      if (!p) return;
      p.total++;
      if (t.slaBreached) p.resBreached++;
      const resEnd = t.resolutiondate || (t.isClosed ? t.updated : null);
      if (resEnd) {
        if (resEnd >= bucket.fromStr && resEnd < bucket.toExclusiveStr) p.resolvedSameMonth++;
        const hrs = (new Date(resEnd).getTime() - new Date(t.created).getTime()) / 3600000;
        if (isFinite(hrs) && hrs >= 0) { p.hoursSum += hrs; p.hoursCount++; }
      }
    });
    return { bucket, stats };
  });

  const tabsHtml = '<div class="month-tabs">' + monthly.map(({ bucket }, idx) =>
    `<button type="button" class="month-tab-btn${idx === state.summaryMonthIdx ? ' active' : ''}" data-idx="${idx}">${escapeHtml(bucket.label)}</button>`).join('') + '</div>';
  const panelsHtml = monthly.map(({ bucket, stats }, idx) => {
    const rows = roster.map(e => stats[e]).sort((a, b) => a.name.localeCompare(b.name));
    const rowsHtml = rows.map(r => {
      const avgHrs = r.hoursCount ? (r.hoursSum / r.hoursCount) : null;
      const pct = r.total ? (r.resolvedSameMonth / r.total * 100) : null;
      return `<tr><td>${escapeHtml(r.name)}</td><td class="tts-num">${r.total}</td>
        <td class="tts-num">${r.resolvedSameMonth}${pct === null ? '' : `<div class="sub" style="font-size:11px;margin-top:2px;">${pct.toFixed(1)}%</div>`}</td>
        <td class="tts-num">${r.resBreached}</td><td class="tts-num">${avgHrs === null ? '—' : avgHrs.toFixed(1)}</td></tr>`;
    }).join('');
    return `<div class="month-tab-panel${idx === state.summaryMonthIdx ? ' active' : ''}" data-panel-idx="${idx}">
      <div class="table-wrap"><div class="table-scroll"><table class="person-tickets-table">
        <thead><tr><th>Name</th><th>Total tickets</th><th>Resolved tickets</th><th>Resolution SLA breached</th><th>Avg. resolution (hours)</th></tr></thead>
        <tbody>${rowsHtml}</tbody></table></div></div></div>`;
  }).join('');
  container.innerHTML = tabsHtml + panelsHtml;
  container.querySelectorAll('.month-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.idx);
      state.summaryMonthIdx = idx;
      container.querySelectorAll('.month-tab-btn').forEach(b => b.classList.toggle('active', Number(b.dataset.idx) === idx));
      container.querySelectorAll('.month-tab-panel').forEach(p => p.classList.toggle('active', Number(p.dataset.panelIdx) === idx));
    });
  });
}

function renderTeamTabTable(teamKey) {
  const def = C.TEAM_TAB_DEFS[teamKey];
  const state = TEAM_TAB_STATE[teamKey];
  const cardsEl = document.getElementById(`${teamKey}Cards`);
  const tbody = document.getElementById(`${teamKey}Body`);
  cardsEl.innerHTML = '';
  const selectedPerson = state.selectedPerson || 'all';
  const tickets = state.tickets.filter(t => selectedPerson === 'all' || t.assigneeEmail === selectedPerson);
  const personLabel = selectedPerson === 'all' ? def.label : Logic.emailToName(selectedPerson);
  if (!tickets.length) {
    tbody.innerHTML = `<tr><td colspan="9" class="empty-state">No tickets for ${escapeHtml(personLabel)} in this date range.</td></tr>`;
    return;
  }
  const resInTime = tickets.filter(t => t.slaBreached === false).length;
  const resBreached = tickets.filter(t => t.slaBreached === true).length;
  const resTracked = resInTime + resBreached;
  card(cardsEl, tickets.length, `Total tickets — ${personLabel}`);
  card(cardsEl, resTracked ? resInTime : null, `Resolved within SLA (of ${resTracked} tracked)`, resTracked && (resInTime / resTracked) < 0.7 ? 'warn' : 'good');
  card(cardsEl, resTracked ? resBreached : null, `Resolution SLA breached (of ${resTracked} tracked)`, resBreached ? 'bad' : 'good');

  const yn = (v) => v === null ? '<span style="color:#9ca3af">N/A</span>' : v ? '<span style="color:#b91c1c">Yes</span>' : '<span style="color:#15803d">No</span>';
  tbody.innerHTML = tickets.map(t => `<tr>
    <td><a href="${browseUrl(t.key)}" target="_blank" rel="noopener">${t.key}</a></td>
    <td><span class="teamtag">${escapeHtml(t.project)}</span></td>
    <td>${escapeHtml(t.assignee)}</td><td>${escapeHtml(t.reporterName)}</td><td>${escapeHtml(t.statusName)}</td>
    <td>${escapeHtml(t.summary)}</td>
    <td>${t.created ? new Date(t.created).toLocaleDateString() : '—'}</td>
    <td>${t.updated ? new Date(t.updated).toLocaleDateString() : '—'}</td>
    <td>${yn(t.slaBreached)}</td>
    ${def.hasRcaFix ? `<td>${yn(t.hasRCA !== undefined ? t.hasRCA : null)}</td><td>${yn(t.hasFixDescription !== undefined ? t.hasFixDescription : null)}</td>` : ''}
  </tr>`).join('');
}

document.addEventListener('DOMContentLoaded', () => {
  Object.keys(C.TEAM_TAB_DEFS).forEach(buildTeamTabSkeleton);
  document.addEventListener('excel-data-updated', () => {
    Object.keys(TEAM_TAB_STATE).forEach(teamKey => {
      if (TEAM_TAB_STATE[teamKey].source === 'excel' && TEAM_TAB_STATE[teamKey].loaded) loadTeamTabSection(teamKey);
    });
  });
});
