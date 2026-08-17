// Small shared DOM/formatting helpers used across every tab's script.
const C = window.JiraHygieneConstants;
const Rules = window.JiraHygieneRules;
const Logic = window.JiraHygieneLogic;

function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function fmt(n) {
  if (n === null || n === undefined) return 'N/A';
  return n.toLocaleString();
}
function todayStr() { return new Date().toISOString().slice(0, 10); }
function addDaysStr(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function card(container, val, lbl, cls, approx, onClick, subHtml) {
  const div = document.createElement('div');
  div.className = 'card ' + (cls || '') + (val === null ? ' na' : '') + (onClick ? ' clickable' : '');
  div.innerHTML = `<div class="val">${val === null ? 'N/A' : fmt(val)}</div>` +
    (subHtml ? `<div class="sub" style="font-size:11px;margin:2px 0 0;">${subHtml}</div>` : '') +
    `<div class="lbl">${lbl}</div>` + (approx ? '<span class="tag">approx</span>' : '');
  if (onClick) { div.title = 'Click to see the tickets behind this number'; div.addEventListener('click', onClick); }
  container.appendChild(div);
}

// ---- Shared detail modal (drill-down list of tickets behind a card/cell) ----
function openDetailModal(title, sub) {
  document.getElementById('detailModalTitle').textContent = title;
  document.getElementById('detailModalSub').textContent = sub || '';
  document.getElementById('detailModalBody').innerHTML = '<div class="empty-state">Loading…</div>';
  document.getElementById('detailModalOverlay').classList.add('open');
}
function closeDetailModal() { document.getElementById('detailModalOverlay').classList.remove('open'); }

// Best-effort guess at Neutara Ticketing's web UI ticket-detail route — not confirmed
// against the live app, so treat this as a placeholder to correct once the real route is
// known (see README).
function browseUrl(key) {
  const base = (AppState.ntaBaseUrl || '').replace(/\/api\/?$/, '').replace(/\/+$/, '');
  return base ? `${base}/tickets/${key}` : '#';
}

function renderIssueListModal(title, issues) {
  openDetailModal(title, `${issues.length} ticket${issues.length === 1 ? '' : 's'}`);
  const bodyEl = document.getElementById('detailModalBody');
  if (!issues.length) {
    bodyEl.innerHTML = '<div class="empty-state">No tickets in this bucket.</div>';
    return;
  }
  const rows = issues.map(issue => {
    const f = issue.fields || {};
    const assignee = f.assignee ? escapeHtml(f.assignee.displayName) : '<span style="color:#9ca3af">Unassigned</span>';
    const createdStr = f.created ? new Date(f.created).toLocaleDateString() : '—';
    const resolvedStr = f.resolutiondate ? new Date(f.resolutiondate).toLocaleDateString() : '—';
    return `<tr>
      <td><a class="ticket-link" href="${browseUrl(issue.key)}" target="_blank" rel="noopener">${issue.key}</a></td>
      <td>${escapeHtml(f.summary || '')}</td>
      <td>${escapeHtml((f.status && f.status.name) || '')}</td>
      <td>${assignee}</td>
      <td>${escapeHtml((f.project && f.project.key) || '')}</td>
      <td>${createdStr}</td>
      <td>${resolvedStr}</td>
    </tr>`;
  }).join('');
  bodyEl.innerHTML = `<div class="table-scroll"><table>
    <thead><tr><th>Key</th><th>Summary</th><th>Status</th><th>Assignee</th><th>Project</th><th>Created</th><th>Resolved</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

// Drill-down modal driven by a filter predicate over the in-memory synced dataset, instead
// of a query string (Neutara Ticketing has no query language to build one for).
function showFilteredDetail(title, allIssues, predicate) {
  openDetailModal(title, 'Loading…');
  try {
    const issues = allIssues.filter(predicate).slice(0, C.DETAIL_FETCH_CAP);
    renderIssueListModal(title, issues);
  } catch (e) {
    document.getElementById('detailModalBody').innerHTML = `<div class="empty-state">Could not load: ${escapeHtml(e.message)}</div>`;
  }
}

// ---- Shared app-wide state (date range, team filter, stale threshold, NTA base url) ----
const AppState = {
  fromStr: addDaysStr(todayStr(), -14),
  toStr: todayStr(),
  staleDays: 7,
  ntaConfigured: false,
  ntaBaseUrl: '',
  excelAvailable: false,
};

function toExclusive(toStr) { return addDaysStr(toStr, 1); }

document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('detailModalOverlay');
  document.getElementById('detailModalCloseBtn').addEventListener('click', closeDetailModal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeDetailModal(); });
});
