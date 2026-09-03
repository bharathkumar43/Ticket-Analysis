// "Customer Engineering" tab — the Customer Engineering ('eng') section pulled out of "Team
// tickets by individual" into its own dedicated tab, same data/columns/behavior, just scoped
// to one team instead of rendering all teams together. Reuses buildPerTeamFromIssues (defined
// in teamtickets.js, loaded before this file — see index.html's script order) rather than
// duplicating the per-person bucketing/breach/retry logic.
let customerEngSource = 'live';
let lastCustomerEng = null;

async function loadCustomerEngSection() {
  const container = document.getElementById('customerEngSection');
  const statusEl = document.getElementById('customerEngStatus');
  const heading = document.getElementById('customerEngHeading');
  const { fromStr, toStr } = AppState;
  const toExclusiveStr = toExclusive(toStr);
  heading.textContent = `Customer Engineering (${fromStr} to ${toStr}, created or updated) — ${customerEngSource === 'live' ? 'Live Neutara Ticketing' : 'Uploaded Excel'}`;
  container.innerHTML = '<div class="empty-state">Loading…</div>';

  const data = customerEngSource === 'live' ? await Api.getNtaCurrent().catch(() => null) : await Api.getCurrentData().catch(() => null);
  if (!data) {
    container.innerHTML = customerEngSource === 'live'
      ? '<div class="empty-state">No Neutara Ticketing sync yet. Trigger one in Settings.</div>'
      : '<div class="empty-state">No Excel upload found. Upload one in Settings.</div>';
    return;
  }

  const teamKey = 'eng';
  let result;
  if (customerEngSource === 'excel' && !C.TEAM_TAB_DEFS[teamKey]) {
    result = { people: [], note: `${C.TEAM_LABELS[teamKey]} isn't attributable from the Excel upload (CFITS rows can't be split into ENT vs SMB — see README).` };
  } else {
    const items = Logic.getFileTicketsForTeam(data.issues, teamKey, fromStr, toExclusiveStr);
    result = buildPerTeamFromIssues(teamKey, items); // from teamtickets.js
  }
  lastCustomerEng = result;
  statusEl.textContent = 'Updated ' + new Date().toLocaleString();
  renderCustomerEngSection(result);
}

// Same table shape as renderTeamTicketsSection's per-team block in teamtickets.js, just
// rendered as the whole tab's content instead of one section among several.
function renderCustomerEngSection({ people, note }) {
  const container = document.getElementById('customerEngSection');
  container.innerHTML = '';
  if (note) {
    container.innerHTML = `<div class="empty-state">${escapeHtml(note)}</div>`;
    return;
  }
  if (!people.length) {
    container.innerHTML = '<div class="empty-state">No tickets in this range.</div>';
    return;
  }
  const avgDays = ms => ms.length ? (ms.reduce((a, b) => a + b, 0) / ms.length / 86400000) : null;
  const numTd = (val, personIdx, field) => `<td class="num-link" data-idx="${personIdx}" data-field="${field}">${fmt(val)}</td>`;
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
  container.appendChild(scrollWrap);

  const fieldLabels = {
    totalIssues: 'Total', openIssues: 'Open', breachedIssues: 'Breached',
    breachedRetryIssues: 'Breached — Retry', breachedNonRetryIssues: 'Breached — Non-retry', resolvedInTimeIssues: 'Resolved in time',
  };
  container.querySelectorAll('td.num-link').forEach(td => {
    td.addEventListener('click', () => {
      const p = lastCustomerEng.people[Number(td.dataset.idx)];
      const field = td.dataset.field;
      showFilteredDetail(`${p.label} — ${fieldLabels[field]}`, p[field], () => true);
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const toolbar = document.querySelector('#page-customereng .table-toolbar');
  const sourceWrap = document.createElement('span');
  sourceWrap.className = 'source-toggle';
  sourceWrap.innerHTML = `Data source: <select id="customerEngSourceSel"><option value="live">Live Neutara Ticketing</option><option value="excel">Uploaded Excel</option></select>`;
  toolbar.appendChild(sourceWrap);
  document.getElementById('customerEngSourceSel').addEventListener('change', (e) => {
    customerEngSource = e.target.value;
    loadCustomerEngSection();
  });
  document.getElementById('refreshCustomerEngBtn').addEventListener('click', loadCustomerEngSection);
});
