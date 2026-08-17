// Dashboard tab — sections 1 (backlog), 2 (SLA health), 3 (recent activity), 4 (team
// overview), 5 (per-person hygiene), 6 (reopened tickets), 7 (weekly reports). All of this
// reads the cached, synced Neutara Ticketing dataset (Api.getNtaCurrent()) and computes
// every metric via plain array filtering — there's no query language to send this to a
// server the way Jira's JQL worked, so the whole synced set is pulled once per section and
// filtered here instead.
//
// Known semantic differences from the old Jira-JQL version (see README):
// - "Reopened" is based on the ticket's CURRENT status being Reopened, not a changelog
//   ("status changed to Reopened after X") — NTA doesn't expose status-change history yet.
// - "Marked duplicate" has no NTA equivalent (no resolution field) and was dropped.
// - Screenshot/attachment-evidence and closing-comment checks will show "no data" for
//   every ticket right now since comments/attachments are empty in the synced dataset.

let personRows = [];
let sortKey = 'score', sortAsc = true;
let currentTableTeam = 'all';
let currentSearch = '';

function inDateWindow(f, fromStr, toExclusiveStr) {
  return (f.created && f.created >= fromStr && f.created < toExclusiveStr) ||
         (f.updated && f.updated >= fromStr && f.updated < toExclusiveStr);
}

function teamFiltered(issues, teamKey) {
  return teamKey === 'all' ? issues : issues.filter(i => i.teamKey === teamKey);
}

function loadBacklog(allIssues, fromStr, toStr, toExclusiveStr, staleDays, teamKey) {
  const el = document.getElementById('backlogCards');
  el.innerHTML = '';
  document.getElementById('backlogTeamLabel').textContent = `(${teamKey === 'all' ? 'all teams' : C.TEAM_LABELS[teamKey]}, ${fromStr} to ${toStr}, created or updated)`;
  document.getElementById('excludedNote').textContent = 'Every ticket in the last completed Neutara Ticketing sync, classified by department (see README).';

  const base = teamFiltered(allIssues, teamKey).filter(i => inDateWindow(i.fields, fromStr, toExclusiveStr));
  const isOpen = i => i.fields.status && i.fields.status.category !== 'done';

  const totalOpen = base.filter(isOpen);
  card(el, totalOpen.length, 'Total open tickets (not in a Done-category status)', '', false, () => showFilteredDetail('Total open tickets', totalOpen, () => true));

  if (teamKey === 'all') {
    const unassigned = totalOpen.filter(i => !i.fields.assignee);
    card(el, unassigned.length, 'Unassigned (open only)', unassigned.length && totalOpen.length && unassigned.length / totalOpen.length > 0.3 ? 'warn' : '', false, () => showFilteredDetail('Unassigned (open only)', unassigned, () => true));
  }

  const old30 = totalOpen.filter(i => i.fields.created && (Date.now() - new Date(i.fields.created).getTime()) / 86400000 > 30);
  card(el, old30.length, 'Old tickets — open > 30 days', 'warn', false, () => showFilteredDetail('Old tickets — open > 30 days', old30, () => true));

  const overdue = totalOpen.filter(i => i.fields.duedate && new Date(i.fields.duedate).getTime() < Date.now());
  card(el, overdue.length, 'Overdue (past due date)', 'bad', false, () => showFilteredDetail('Overdue (past due date)', overdue, () => true));

  const blocked = totalOpen.filter(i => C.BLOCKED_STATUSES.includes((i.fields.status && i.fields.status.name) || ''));
  card(el, blocked.length, 'Blocked (waiting on a dependency)', '', true, () => showFilteredDetail('Blocked', blocked, () => true));

  const waitingCustomer = totalOpen.filter(i => (i.fields.status && i.fields.status.name) === C.WAITING_CUSTOMER_STATUS);
  card(el, waitingCustomer.length, 'Waiting on customer', '', true, () => showFilteredDetail('Waiting on customer', waitingCustomer, () => true));

  const waitingCustomerExt = waitingCustomer.filter(i => i.fields.updated && (Date.now() - new Date(i.fields.updated).getTime()) / 86400000 > staleDays);
  card(el, waitingCustomerExt.length, `Waiting on customer > ${staleDays}d (no update)`, 'warn', true, () => showFilteredDetail('Waiting on customer (stale)', waitingCustomerExt, () => true));
}

function loadSla(allIssues, fromStr, toExclusiveStr) {
  const el = document.getElementById('slaCards');
  el.innerHTML = '';
  C.ALL_TICKETS_TEAMS.forEach(teamKey => {
    const inRange = allIssues.filter(i => i.teamKey === teamKey && i.fields.created && i.fields.created >= fromStr && i.fields.created < toExclusiveStr);
    const tracked = inRange.filter(i => i.rb !== null);
    const breached = tracked.filter(i => i.rb === true);
    card(el, tracked.length ? breached.length : null, `${C.TEAM_LABELS[teamKey]} — Resolution SLA breached (of ${tracked.length} tracked / ${inRange.length})`, breached.length ? 'bad' : 'good', false,
      breached.length ? () => showFilteredDetail(`${C.TEAM_LABELS[teamKey]} — SLA breached`, breached, () => true) : undefined);
  });
}

function loadRecent(allIssues, fromStr, toExclusiveStr, teamKey) {
  const el = document.getElementById('recentCards');
  el.innerHTML = '';
  const base = teamFiltered(allIssues, teamKey);

  const created = base.filter(i => i.fields.created && i.fields.created >= fromStr && i.fields.created < toExclusiveStr);
  card(el, created.length, 'Created in range', '', false, () => showFilteredDetail('Created in range', created, () => true));

  const resolved = base.filter(i => i.fields.status && i.fields.status.category === 'done' && i.fields.resolutiondate && i.fields.resolutiondate >= fromStr && i.fields.resolutiondate < toExclusiveStr);
  card(el, resolved.length, 'Resolved in range', (resolved.length < created.length) ? 'warn' : 'good', false, () => showFilteredDetail('Resolved in range', resolved, () => true));

  // "Reopened" = current status is Reopened (no changelog available) — see README.
  const reopened = base.filter(i => C.REOPENED_STATUS_NAMES.some(s => s.toLowerCase() === ((i.fields.status && i.fields.status.name) || '').toLowerCase()) && inDateWindow(i.fields, fromStr, toExclusiveStr));
  card(el, reopened.length, 'Currently "Reopened" in range', 'warn', true, () => showFilteredDetail('Reopened in range', reopened, () => true));

  const properClose = s => /^closed$/i.test(s) || /^done$/i.test(s);
  const noClosure = resolved.filter(i => !properClose((i.fields.status && i.fields.status.name) || ''));
  card(el, noClosure.length, 'Resolved w/o "Closed" status', 'warn', true, () => showFilteredDetail('Resolved w/o Closed status', noClosure, () => true));

  const missingEvidence = resolved.filter(i => !(i.fields.attachment && i.fields.attachment.length));
  card(el, missingEvidence.length, 'Closed with no attachment', 'warn', true, () => showFilteredDetail('Closed with no attachment', missingEvidence, () => true));
}

function gradeFor(score) { return Logic.gradeFor(score); }

function loadPersonData(allIssues, fromStr, toExclusiveStr, staleDays) {
  const openItems = [], closedItems = [];
  allIssues.forEach(issue => {
    const f = issue.fields;
    if (!f.assignee) return;
    const isOpen = f.status && f.status.category !== 'done';
    if (isOpen) { if (f.updated && f.updated >= fromStr && f.updated < toExclusiveStr) openItems.push(issue); }
    else if (f.resolutiondate && f.resolutiondate >= fromStr && f.resolutiondate < toExclusiveStr) closedItems.push(issue);
  });
  personRows = Logic.computeHygiene(openItems, closedItems, staleDays);
  renderTeamCards();
  renderPersonTable();
}

function renderTeamCards() {
  const el = document.getElementById('teamCards');
  el.innerHTML = '';
  const teamKeys = ['ent', 'smb', 'eng', 'qa', 'infra', 'other'];
  for (const key of teamKeys) {
    const members = personRows.filter(r => r.team === key);
    const totalOpen = members.reduce((s, m) => s + m.open, 0);
    const totalStale = members.reduce((s, m) => s + m.stale, 0);
    const totalClosed = members.reduce((s, m) => s + m.closed, 0);
    const totalShots = members.reduce((s, m) => s + m.screenshots, 0);
    const totalShotChecks = members.reduce((s, m) => s + m.closedWithAttachmentCheck, 0);
    const avgScore = members.length ? Math.round(members.reduce((s, m) => s + m.score, 0) / members.length) : null;
    const shotPct = totalShotChecks > 0 ? Math.round((totalShots / totalShotChecks) * 100) : null;
    const div = document.createElement('div');
    div.className = 'team-card' + (currentTableTeam === key ? ' active' : '');
    div.innerHTML = `
      <div class="tgroup">${key === 'ent' || key === 'smb' ? 'Migration' : ''}</div>
      <div class="tname">${C.TEAM_LABELS[key]}</div>
      <div class="trow"><span>Active people</span><span>${members.length}</span></div>
      <div class="trow"><span>Open tickets</span><span>${totalOpen}</span></div>
      <div class="trow"><span>Stale</span><span>${totalStale}</span></div>
      <div class="trow"><span>Closed (window)</span><span>${totalClosed}</span></div>
      <div class="trow"><span>Screenshot compliance</span><span>${shotPct === null ? '—' : shotPct + '%'}</span></div>
      <div class="tscore">${avgScore === null ? '—' : avgScore}</div>`;
    div.addEventListener('click', () => {
      currentTableTeam = key;
      document.getElementById('teamFilterSel').value = key;
      renderTeamCards();
      renderPersonTable();
    });
    el.appendChild(div);
  }
}

function renderPersonTable() {
  const tbody = document.getElementById('personBody');
  let rows = personRows;
  if (currentTableTeam !== 'all') rows = rows.filter(r => r.team === currentTableTeam);
  if (currentSearch) {
    const q = currentSearch.toLowerCase();
    rows = rows.filter(r => (r.name || '').toLowerCase().includes(q) || (r.email || '').toLowerCase().includes(q));
  }
  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="11" class="empty-state">No matching activity in this window.</td></tr>';
    return;
  }
  const sorted = [...rows].sort((a, b) => {
    const av = a[sortKey], bv = b[sortKey];
    if (typeof av === 'string') return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
    const an = (av === null ? -1 : av), bn = (bv === null ? -1 : bv);
    return sortAsc ? an - bn : bn - an;
  });
  tbody.innerHTML = sorted.map(r => {
    const [cls, label] = gradeFor(r.score);
    return `<tr>
      <td>${escapeHtml(r.name)}${r.email ? '<br><span style="color:#9ca3af;font-size:11px">' + escapeHtml(r.email) + '</span>' : ''}</td>
      <td><span class="teamtag">${C.TEAM_LABELS[r.team]}</span></td>
      <td>${r.touched}</td><td>${r.open}</td><td>${r.stale}</td><td>${r.missing}</td><td>${r.overdue}</td>
      <td>${r.closed}</td><td>${r.noClosure}</td><td>${r.screenshotPct === null ? '—' : r.screenshotPct + '%'}</td>
      <td><span class="grade ${cls}">${r.score} · ${label}</span></td>
    </tr>`;
  }).join('');
}

async function loadReopenedSection(fromStr, toStr, toExclusiveStr) {
  const container = document.getElementById('reopenedSection');
  const statusEl = document.getElementById('reopenedStatus');
  container.innerHTML = '<div class="empty-state">Loading…</div>';
  const data = await Api.getNtaCurrent().catch(() => null);
  const perTeam = {};
  C.ALL_TICKETS_TEAMS.forEach(k => { perTeam[k] = []; });
  if (data) {
    data.issues.forEach(issue => {
      const statusName = (issue.fields.status && issue.fields.status.name) || '';
      const isReopened = C.REOPENED_STATUS_NAMES.some(s => s.toLowerCase() === statusName.toLowerCase());
      if (!isReopened || !inDateWindow(issue.fields, fromStr, toExclusiveStr)) return;
      if (perTeam[issue.teamKey]) perTeam[issue.teamKey].push(issue);
    });
  }
  statusEl.textContent = data ? 'Updated ' + new Date().toLocaleString() : 'No Neutara Ticketing sync yet — configure it and Sync now in Settings.';
  renderReopenedSection(perTeam);
}

function renderReopenedSection(perTeam) {
  const container = document.getElementById('reopenedSection');
  container.innerHTML = '';
  const totalCount = C.ALL_TICKETS_TEAMS.reduce((sum, k) => sum + perTeam[k].length, 0);
  const banner = document.createElement('div');
  if (totalCount === 0) {
    banner.className = 'empty-state';
    banner.style.cssText = 'color:#15803d;font-weight:600;background:#f0fdf4;border:1px solid #bbf7d0;';
    banner.textContent = 'No tickets currently in a "Reopened" status on any team right now.';
  } else {
    banner.style.cssText = 'font-size:13px;color:#6b7280;margin-bottom:12px;';
    banner.textContent = `${totalCount} ticket${totalCount === 1 ? '' : 's'} currently "Reopened" across all teams. Based on current status, not a change history — see README.`;
  }
  container.appendChild(banner);

  C.ALL_TICKETS_TEAMS.forEach(teamKey => {
    const issues = perTeam[teamKey];
    if (!issues.length) return;
    const wrap = document.createElement('div');
    wrap.style.marginBottom = '20px';
    const titleBar = document.createElement('div');
    titleBar.style.cssText = 'background:#b91c1c;color:#fff;font-weight:700;font-size:14px;padding:8px 12px;border-radius:6px;margin-bottom:10px;';
    titleBar.textContent = `${C.TEAM_LABELS[teamKey]} — ${issues.length} reopened`;
    wrap.appendChild(titleBar);
    const sorted = issues.slice().sort((a, b) => new Date(b.fields.updated || 0) - new Date(a.fields.updated || 0));
    const rows = sorted.map(issue => {
      const f = issue.fields;
      const assignee = f.assignee ? escapeHtml(f.assignee.displayName) : '<span style="color:#9ca3af">Unassigned</span>';
      const statusName = (f.status && f.status.name) || '';
      return `<tr><td><a class="ticket-link" href="${browseUrl(issue.key)}" target="_blank" rel="noopener">${issue.key}</a></td>
        <td>${escapeHtml(f.summary || '')}</td><td>${escapeHtml(statusName)}</td><td>${assignee}</td>
        <td>${f.created ? new Date(f.created).toLocaleDateString() : '—'}</td>
        <td>${f.updated ? new Date(f.updated).toLocaleDateString() : '—'}</td></tr>`;
    }).join('');
    const scrollWrap = document.createElement('div');
    scrollWrap.className = 'table-scroll';
    scrollWrap.innerHTML = `<table><thead><tr><th>Key</th><th>Summary</th><th>Current status</th><th>Assignee</th><th>Created</th><th>Last updated</th></tr></thead><tbody>${rows}</tbody></table>`;
    wrap.appendChild(scrollWrap);
    container.appendChild(wrap);
  });
}

async function loadWeeklyReportsSection() {
  const rangeLabel = document.getElementById('weeklyReportsRangeLabel');
  const statusEl = document.getElementById('weeklyStatus');
  const gridEl = document.getElementById('weeklyReportsSection');
  const { from, to } = Logic.getLastCompletedWeekRange();
  const fromStr = Logic.ymdLocal(from), toStr = Logic.ymdLocal(to);
  const toExclusive = new Date(to); toExclusive.setDate(toExclusive.getDate() + 1);
  const toExclusiveStr = Logic.ymdLocal(toExclusive);
  rangeLabel.textContent = `Week of ${fromStr} to ${toStr} (Monday–Sunday) — Migration ENT, Migration SMB, Customer Engineering`;
  statusEl.textContent = 'Loading…';
  gridEl.innerHTML = '<div class="empty-state">Loading…</div>';

  const data = await Api.getNtaCurrent().catch(() => null);
  const map = {};
  if (data) {
    data.issues.forEach(issue => {
      if (!C.WEEKLY_REPORT_TEAMS.includes(issue.teamKey)) return;
      const f = issue.fields;
      const isOpen = f.status && f.status.category !== 'done';
      const inWindow = isOpen
        ? (f.updated && f.updated >= fromStr && f.updated < toExclusiveStr)
        : (f.resolutiondate && f.resolutiondate >= fromStr && f.resolutiondate < toExclusiveStr);
      if (!inWindow) return;
      const email = f.assignee ? f.assignee.emailAddress : null;
      if (!email) return;
      if (!map[email]) map[email] = { name: f.assignee.displayName, email, team: issue.teamKey, tickets: [] };
      map[email].tickets.push(Logic.classifyNtaTicket(issue));
    });
  }
  statusEl.textContent = data ? 'Loaded ' + new Date().toLocaleString() : 'No Neutara Ticketing sync yet.';
  renderWeeklyReportsSection(map);
}

function renderWeeklyReportsSection(map) {
  const gridEl = document.getElementById('weeklyReportsSection');
  const teamKeys = C.WEEKLY_REPORT_TEAMS;
  gridEl.innerHTML = '';
  teamKeys.forEach(teamKey => {
    const people = Object.values(map).filter(p => p.team === teamKey);
    const wrap = document.createElement('div');
    wrap.style.marginBottom = '20px';
    const title = document.createElement('div');
    title.style.cssText = 'background:#0129AC;color:#fff;font-weight:700;font-size:14px;padding:8px 12px;border-radius:6px;margin-bottom:10px;';
    title.textContent = C.TEAM_LABELS[teamKey];
    wrap.appendChild(title);
    if (!people.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'No activity for this team last week.';
      wrap.appendChild(empty);
      gridEl.appendChild(wrap);
      return;
    }
    const rows = people.map(p => {
      const fs = Logic.computePersonFactorScores(p);
      return { p, fs };
    }).sort((a, b) => (b.fs.overallScore100 || 0) - (a.fs.overallScore100 || 0));
    const rowsHtml = rows.map(({ p, fs }) => {
      const scoreCls = fs.overallScore100 === null ? '' : (fs.overallScore100 >= 80 ? 'tts-score-good' : fs.overallScore100 >= 60 ? 'tts-score-amber' : 'tts-score-bad');
      return `<tr><td>${escapeHtml(p.name)}</td><td class="tts-num">${p.tickets.length}</td><td class="tts-num ${scoreCls}">${fs.overallScore100 === null ? 'N/A' : fs.overallScore100}</td><td>${fs.rating}</td></tr>`;
    }).join('');
    const scrollWrap = document.createElement('div');
    scrollWrap.className = 'table-scroll';
    scrollWrap.innerHTML = `<table class="person-tickets-table"><thead><tr><th>Name</th><th>Tickets</th><th>Overall Score</th><th>Rating</th></tr></thead><tbody>${rowsHtml}</tbody></table>`;
    wrap.appendChild(scrollWrap);
    gridEl.appendChild(wrap);
  });
}

async function refreshDashboard() {
  document.getElementById('globalStatusLine').textContent = 'Loading…';
  const data = await Api.getNtaCurrent().catch(() => null);
  const note = document.getElementById('liveNtaRequiredNote');
  if (note) note.style.display = data ? 'none' : 'block';
  if (!data) {
    document.getElementById('globalStatusLine').textContent = 'No Neutara Ticketing sync yet — configure it and Sync now in Settings.';
    loadBacklog([], AppState.fromStr, AppState.toStr, toExclusive(AppState.toStr), AppState.staleDays, 'all');
    loadSla([], AppState.fromStr, toExclusive(AppState.toStr));
    loadRecent([], AppState.fromStr, toExclusive(AppState.toStr), 'all');
    personRows = [];
    renderTeamCards();
    renderPersonTable();
    return;
  }
  const { fromStr, toStr } = AppState;
  const toExclusiveStr = toExclusive(toStr);
  loadBacklog(data.issues, fromStr, toStr, toExclusiveStr, AppState.staleDays, 'all');
  loadSla(data.issues, fromStr, toExclusiveStr);
  loadRecent(data.issues, fromStr, toExclusiveStr, 'all');
  loadPersonData(data.issues, fromStr, toExclusiveStr, AppState.staleDays);
  document.getElementById('globalStatusLine').textContent = 'Updated ' + new Date().toLocaleString();
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('teamFilterSel').addEventListener('change', (e) => {
    currentTableTeam = e.target.value;
    renderTeamCards();
    renderPersonTable();
  });
  document.getElementById('searchBtn').addEventListener('click', () => {
    currentSearch = document.getElementById('searchInput').value.trim();
    renderPersonTable();
  });
  document.getElementById('clearSearchBtn').addEventListener('click', () => {
    currentSearch = '';
    document.getElementById('searchInput').value = '';
    renderPersonTable();
  });
  document.querySelectorAll('#personTable th[data-key]').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.key;
      if (sortKey === key) sortAsc = !sortAsc; else { sortKey = key; sortAsc = true; }
      document.querySelectorAll('#personTable th').forEach(t => t.classList.remove('sorted'));
      th.classList.add('sorted');
      renderPersonTable();
    });
  });
  document.getElementById('refreshReopenedBtn').addEventListener('click', () => {
    loadReopenedSection(AppState.fromStr, AppState.toStr, toExclusive(AppState.toStr));
  });
  document.getElementById('refreshWeeklyBtn').addEventListener('click', loadWeeklyReportsSection);
});
