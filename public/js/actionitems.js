// Action items tab — static ACTION_ITEMS / PERMANENT_FIX_ITEMS content (ported verbatim),
// with per-row completion status and free-text Jira ticket links saved to localStorage,
// same as the reference artifact.
function actionItemStatusKey(prefix, id) { return `jira-hygiene-actionitem-${prefix}-${id}`; }
function loadActionItemStatus(key) { try { return localStorage.getItem(key) || ''; } catch (e) { return ''; } }
function saveActionItemStatus(key, value) { try { localStorage.setItem(key, value); } catch (e) {} }
function actionStatusSelectHtml(key, current) {
  const cls = current === 'Yes' ? 'status-yes' : current === 'No' ? 'status-no' : '';
  const opts = ['', 'Yes', 'No'].map(v => `<option value="${v}" ${current === v ? 'selected' : ''}>${v === '' ? '— Select —' : v}</option>`).join('');
  return `<select class="action-status-sel ${cls}" data-key="${escapeHtml(key)}">${opts}</select>`;
}
function jiraTicketsKey(prefix, id) { return `jira-hygiene-actionitem-tickets-${prefix}-${id}`; }
function loadJiraTicketsText(key) { try { return localStorage.getItem(key) || ''; } catch (e) { return ''; } }
function saveJiraTicketsText(key, value) { try { localStorage.setItem(key, value); } catch (e) {} }
function parseJiraTickets(text) {
  const seen = new Set();
  return text.split(/[\n,]+/).map(s => s.trim()).filter(s => {
    if (!s || seen.has(s.toUpperCase())) return false;
    seen.add(s.toUpperCase());
    return true;
  });
}
function jiraTicketsLinksHtml(tickets) {
  if (!tickets.length) return '';
  return `<div style="margin-top:4px;font-size:12px;line-height:1.6;">${tickets.map(t => `<a href="${browseUrl(t)}" target="_blank" rel="noopener">${escapeHtml(t)}</a>`).join(', ')}</div>`;
}
function jiraTicketsCellHtml(key) {
  const text = loadJiraTicketsText(key);
  const tickets = parseJiraTickets(text);
  return `<div><textarea class="jira-tickets-input" data-key="${escapeHtml(key)}" rows="2" placeholder="e.g. L2B-12345, L2B-12399" style="width:100%;font:inherit;padding:4px 6px;border:1px solid #d1d5db;border-radius:4px;resize:vertical;">${escapeHtml(text)}</textarea>
    <div class="jira-tickets-links-wrap">${jiraTicketsLinksHtml(tickets)}</div></div>`;
}
function updateActionItemsSummary() {
  const summaryEl = document.getElementById('actionItemsSummary');
  const allKeys = C.ACTION_ITEMS.map(r => actionItemStatusKey('ai', r.no)).concat(C.PERMANENT_FIX_ITEMS.map(r => actionItemStatusKey('pf', r.ticketId)));
  const done = allKeys.filter(k => loadActionItemStatus(k) === 'Yes').length;
  summaryEl.textContent = `Completed: ${done} of ${allKeys.length}`;
}
function renderActionItemsTab() {
  const aiBody = document.getElementById('actionItemsBody');
  const pfBody = document.getElementById('permanentFixBody');
  aiBody.innerHTML = C.ACTION_ITEMS.map(row => {
    const key = actionItemStatusKey('ai', row.no);
    return `<tr><td>${row.no}</td><td>${escapeHtml(row.item)}</td><td>${escapeHtml(row.owner)}</td>
      <td>${actionStatusSelectHtml(key, loadActionItemStatus(key))}</td><td>${jiraTicketsCellHtml(jiraTicketsKey('ai', row.no))}</td></tr>`;
  }).join('');
  pfBody.innerHTML = C.PERMANENT_FIX_ITEMS.map(row => {
    const key = actionItemStatusKey('pf', row.ticketId);
    return `<tr><td>${escapeHtml(row.ticketId)}</td><td>Permanent Fix</td><td>${escapeHtml(row.owner)}</td>
      <td>${actionStatusSelectHtml(key, loadActionItemStatus(key))}</td><td>${jiraTicketsCellHtml(jiraTicketsKey('pf', row.ticketId))}</td></tr>`;
  }).join('');
  document.querySelectorAll('.action-status-sel').forEach(sel => {
    sel.addEventListener('change', (e) => {
      saveActionItemStatus(e.target.dataset.key, e.target.value);
      e.target.classList.remove('status-yes', 'status-no');
      if (e.target.value === 'Yes') e.target.classList.add('status-yes');
      if (e.target.value === 'No') e.target.classList.add('status-no');
      updateActionItemsSummary();
    });
  });
  document.querySelectorAll('.jira-tickets-input').forEach(ta => {
    ta.addEventListener('input', (e) => {
      saveJiraTicketsText(e.target.dataset.key, e.target.value);
      const tickets = parseJiraTickets(e.target.value);
      const wrap = e.target.parentElement.querySelector('.jira-tickets-links-wrap');
      if (wrap) wrap.innerHTML = jiraTicketsLinksHtml(tickets);
    });
  });
  updateActionItemsSummary();
}
document.addEventListener('DOMContentLoaded', renderActionItemsTab);
