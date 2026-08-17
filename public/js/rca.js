// RCA Documents tab — static RCA_DOCUMENTS content (ported verbatim), grouped by manager
// then by project, each a short index card linking out to the full document in SharePoint.
function renderRcaTab() {
  const container = document.getElementById('rcaDocsContainer');
  if (!C.RCA_DOCUMENTS.length) { container.innerHTML = '<div class="empty-state">No RCA documents added yet.</div>'; return; }
  const byManager = {};
  C.RCA_DOCUMENTS.forEach(doc => {
    const mgrKey = `${doc.manager}${doc.subManager ? ' / ' + doc.subManager : ''}`;
    if (!byManager[mgrKey]) byManager[mgrKey] = [];
    byManager[mgrKey].push(doc);
  });
  container.innerHTML = Object.keys(byManager).sort().map(mgrKey => {
    const docs = byManager[mgrKey];
    const cards = docs.map(doc => `
      <div class="rca-card">
        <div class="rca-title">${escapeHtml(doc.project)} — ${escapeHtml(doc.title)}</div>
        <div class="rca-meta">${doc.ticketId ? escapeHtml(doc.ticketId) + ' · ' : ''}${doc.date ? escapeHtml(doc.date) : ''}</div>
        <div>${escapeHtml(doc.summary)}</div>
        <div style="margin-top:6px;"><a href="${doc.link}" target="_blank" rel="noopener">Open full document in SharePoint →</a></div>
      </div>`).join('');
    return `<div class="rca-manager"><div class="rca-manager-title">${escapeHtml(mgrKey)}</div>${cards}</div>`;
  }).join('');
}
document.addEventListener('DOMContentLoaded', renderRcaTab);
