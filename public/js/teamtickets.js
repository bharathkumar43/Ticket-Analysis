// "Team tickets by individual" tab — one table per team (ENT/SMB/Eng/QA/Infra), one row per
// roster member. Live Neutara Ticketing and Uploaded Excel both feed the same in-memory
// pseudo-issue shape (see lib/ntaMapper.js / lib/excelParser.js), filtered per team via
// Logic.getFileTicketsForTeam and bucketed per person below — one code path for both
// sources (CFITS/ENT/SMB rows aren't in the Excel dataset — see README — so those two teams
// show a note instead of a table when Excel is selected). Every number in the table is
// clickable and opens the tickets behind it.
let teamTicketsSource = 'live';
let lastPerTeam = null;

function newPersonBucket(key, label) {
  return {
    key, label, total: 0, open: 0, breached: 0, breachedRetry: 0, breachedNonRetry: 0, resolvedInTime: 0, resTimesMs: [],
    totalIssues: [], openIssues: [], breachedIssues: [], breachedRetryIssues: [], breachedNonRetryIssues: [], resolvedInTimeIssues: [],
  };
}

async function loadTeamTicketsSection() {
  const container = document.getElementById('teamTicketsSection');
  const statusEl = document.getElementById('teamTicketsStatus');
  const heading = document.getElementById('teamTicketsHeading');
  const { fromStr, toStr } = AppState;
  const toExclusiveStr = toExclusive(toStr);
  heading.textContent = `Team tickets by individual (${fromStr} to ${toStr}, created or updated) — ${teamTicketsSource === 'live' ? 'Live Neutara Ticketing' : 'Uploaded Excel'}`;
  container.innerHTML = '<div class="empty-state">Loading…</div>';

  const data = teamTicketsSource === 'live' ? await Api.getNtaCurrent().catch(() => null) : await Api.getCurrentData().catch(() => null);
  if (!data) {
    container.innerHTML = teamTicketsSource === 'live'
      ? '<div class="empty-state">No Neutara Ticketing sync yet. Trigger one in Settings.</div>'
      : '<div class="empty-state">No Excel upload found. Upload one in Settings.</div>';
    return;
  }

  const perTeam = {};
  for (const teamKey of C.ALL_TICKETS_TEAMS) {
    if (teamTicketsSource === 'excel' && !C.TEAM_TAB_DEFS[teamKey]) {
      perTeam[teamKey] = { people: [], note: `${C.TEAM_LABELS[teamKey]} isn't attributable from the Excel upload (CFITS rows can't be split into ENT vs SMB — see README).` };
      continue;
    }
    const items = Logic.getFileTicketsForTeam(data.issues, teamKey, fromStr, toExclusiveStr);
    perTeam[teamKey] = buildPerTeamFromIssues(teamKey, items);
  }
  lastPerTeam = perTeam;
  statusEl.textContent = 'Updated ' + new Date().toLocaleString();
  renderTeamTicketsSection(perTeam);
}

function buildPerTeamFromIssues(teamKey, issues) {
  const byPerson = {};
  const roster = C.TEAMS[teamKey].map(e => e.toLowerCase());
  issues.forEach(issue => {
    const t = Logic.classifyFileTicket(issue);
    if (!t.assigneeEmail || !roster.includes(t.assigneeEmail)) return;
    if (!byPerson[t.assigneeEmail]) byPerson[t.assigneeEmail] = newPersonBucket(t.assigneeEmail, t.assignee);
    const p = byPerson[t.assigneeEmail];
    p.total++; p.totalIssues.push(issue);
    if (!t.isClosed) { p.open++; p.openIssues.push(issue); }
    if (t.slaBreached === true) {
      p.breached++; p.breachedIssues.push(issue);
      if (Rules.retryMatch(t.summary)) { p.breachedRetry++; p.breachedRetryIssues.push(issue); } else { p.breachedNonRetry++; p.breachedNonRetryIssues.push(issue); }
    }
    if (t.isClosed) {
      if (t.created && t.resolutiondate) p.resTimesMs.push(new Date(t.resolutiondate).getTime() - new Date(t.created).getTime());
      if (t.slaBreached === false) { p.resolvedInTime++; p.resolvedInTimeIssues.push(issue); }
    }
  });
  roster.forEach(email => { if (!byPerson[email]) byPerson[email] = newPersonBucket(email, Logic.emailToName(email)); });
  return { people: Object.values(byPerson).sort((a, b) => b.total - a.total) };
}

function renderTeamTicketsSection(perTeam) {
  const container = document.getElementById('teamTicketsSection');
  container.innerHTML = '';
  C.ALL_TICKETS_TEAMS.forEach(teamKey => {
    const { people, note } = perTeam[teamKey];
    const wrap = document.createElement('div');
    wrap.style.marginBottom = '26px';
    const titleBar = document.createElement('div');
    titleBar.style.cssText = 'background:#0129AC;color:#fff;font-weight:700;font-size:14px;padding:8px 12px;border-radius:6px;margin-bottom:10px;';
    titleBar.textContent = C.TEAM_LABELS[teamKey];
    wrap.appendChild(titleBar);
    if (note) {
      const n = document.createElement('div');
      n.className = 'empty-state';
      n.textContent = note;
      wrap.appendChild(n);
      container.appendChild(wrap);
      return;
    }
    if (!people.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'No tickets in this range.';
      wrap.appendChild(empty);
      container.appendChild(wrap);
      return;
    }
    const avgDays = ms => ms.length ? (ms.reduce((a, b) => a + b, 0) / ms.length / 86400000) : null;
    const numTd = (val, personIdx, field) => `<td class="num-link" data-team="${teamKey}" data-idx="${personIdx}" data-field="${field}">${fmt(val)}</td>`;
    const rowsHtml = people.map((p, idx) => `<tr>
      <td>${escapeHtml(p.label)}</td>${numTd(p.total, idx, 'totalIssues')}${numTd(p.open, idx, 'openIssues')}${numTd(p.breached, idx, 'breachedIssues')}
      ${numTd(p.breachedRetry, idx, 'breachedRetryIssues')}${numTd(p.breachedNonRetry, idx, 'breachedNonRetryIssues')}${numTd(p.resolvedInTime, idx, 'resolvedInTimeIssues')}
      <td>${avgDays(p.resTimesMs) === null ? '—' : avgDays(p.resTimesMs).toFixed(1) + 'd'}</td></tr>`).join('');
    const totals = people.reduce((acc, p) => {
      acc.total += p.total; acc.open += p.open; acc.breached += p.breached; acc.breachedRetry += p.breachedRetry;
      acc.breachedNonRetry += p.breachedNonRetry; acc.resolvedInTime += p.resolvedInTime; acc.ms = acc.ms.concat(p.resTimesMs);
      return acc;
    }, { total: 0, open: 0, breached: 0, breachedRetry: 0, breachedNonRetry: 0, resolvedInTime: 0, ms: [] });
    const footHtml = `<tr><td>Team total</td><td>${totals.total}</td><td>${totals.open}</td><td>${totals.breached}</td><td>${totals.breachedRetry}</td><td>${totals.breachedNonRetry}</td><td>${totals.resolvedInTime}</td><td>${avgDays(totals.ms) === null ? '—' : avgDays(totals.ms).toFixed(1) + 'd'}</td></tr>`;
    const scrollWrap = document.createElement('div');
    scrollWrap.className = 'table-scroll';
    scrollWrap.innerHTML = `<table class="person-tickets-table"><thead><tr>
      <th>Name</th><th>Total</th><th>Open</th><th>Breached</th><th>Breached&nbsp;— Retry</th><th>Breached&nbsp;— Non-retry</th><th>Resolved in time</th><th>Avg. resolution</th>
      </tr></thead><tbody>${rowsHtml}</tbody><tfoot>${footHtml}</tfoot></table>`;
    wrap.appendChild(scrollWrap);
    container.appendChild(wrap);
  });

  const fieldLabels = {
    totalIssues: 'Total', openIssues: 'Open', breachedIssues: 'Breached',
    breachedRetryIssues: 'Breached — Retry', breachedNonRetryIssues: 'Breached — Non-retry', resolvedInTimeIssues: 'Resolved in time',
  };
  container.querySelectorAll('td.num-link').forEach(td => {
    td.addEventListener('click', () => {
      const p = lastPerTeam[td.dataset.team].people[Number(td.dataset.idx)];
      const field = td.dataset.field;
      showFilteredDetail(`${p.label} — ${fieldLabels[field]}`, p[field], () => true);
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const toolbar = document.querySelector('#page-teamtickets .table-toolbar');
  const sourceWrap = document.createElement('span');
  sourceWrap.className = 'source-toggle';
  sourceWrap.innerHTML = `Data source: <select id="teamTicketsSourceSel"><option value="live">Live Neutara Ticketing</option><option value="excel">Uploaded Excel</option></select>`;
  toolbar.appendChild(sourceWrap);
  document.getElementById('teamTicketsSourceSel').addEventListener('change', (e) => {
    teamTicketsSource = e.target.value;
    loadTeamTicketsSection();
  });
  document.getElementById('refreshTeamTicketsBtn').addEventListener('click', loadTeamTicketsSection);
});
