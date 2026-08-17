// Settings tab: Neutara Ticketing credentials + sync status/trigger + Excel upload
// (file-backed tabs).
async function refreshSettingsStatus() {
  try {
    const cfg = await Api.getConfig();
    AppState.ntaConfigured = cfg.nta.configured;
    AppState.ntaBaseUrl = cfg.nta.baseUrl || '';
    document.getElementById('ntaBaseUrl').value = cfg.nta.baseUrl || '';
    document.getElementById('ntaKeyMasked').textContent = cfg.nta.apiKeyMasked ? `Current key: ${cfg.nta.apiKeyMasked}` : 'No key saved yet.';
  } catch (e) { /* ignore */ }

  try {
    const data = await Api.getCurrentData();
    AppState.excelAvailable = !!data;
    AppState.excelMeta = data ? data.meta : null;
    renderUploadMeta();
  } catch (e) { /* ignore */ }

  await refreshNtaSyncStatus();

  const note = document.getElementById('liveNtaRequiredNote');
  if (note) note.style.display = AppState.ntaConfigured ? 'none' : 'block';
}

async function refreshNtaSyncStatus() {
  const el = document.getElementById('ntaSyncStatus');
  if (!el) return;
  try {
    const status = await Api.getNtaSyncStatus();
    if (status.inProgress) {
      el.textContent = 'Sync in progress… (a full sync takes several minutes)';
    } else if (status.lastError) {
      el.innerHTML = `<span style="color:#b91c1c">Last sync failed: ${escapeHtml(status.lastError)}</span>`;
    } else if (status.lastSyncedAt) {
      el.textContent = `Last synced ${new Date(status.lastSyncedAt).toLocaleString()} — ${status.ticketCount.toLocaleString()} tickets cached.`;
    } else {
      el.textContent = 'No sync has completed yet.';
    }
  } catch (e) { /* ignore */ }
}

function renderUploadMeta() {
  const el = document.getElementById('uploadMeta');
  if (!el) return;
  const meta = AppState.excelMeta;
  if (!meta) { el.innerHTML = '<span class="sub">No Excel file uploaded yet.</span>'; return; }
  el.innerHTML = `<b>${escapeHtml(meta.fileName || 'Uploaded file')}</b> — ${meta.rowCount} rows parsed (of ${meta.sourceRowCount} source rows), ` +
    `uploaded ${new Date(meta.uploadedAt).toLocaleString()}.<br>` +
    `Date range: ${meta.dateRange.from || '—'} to ${meta.dateRange.to || '—'}.<br>` +
    `Team-attributed rows: ${Object.entries(meta.teamCounts || {}).map(([k, v]) => `${C.TEAM_LABELS[k] || k}: ${v}`).join(', ') || 'none'}.<br>` +
    (meta.cfitsRowCount ? `<span style="color:#b45309">${meta.cfitsRowCount} CFITS row(s) found but not attributed to a team — Migration ENT/SMB can't be split from this sheet alone (see README).</span><br>` : '') +
    (meta.unmatchedRosterCount ? `<span style="color:#b45309">${meta.unmatchedRosterCount} row(s) had an assignee name that didn't match a confirmed team roster — kept in the dataset but excluded from team tabs.</span><br>` : '') +
    (meta.warnings && meta.warnings.length ? `<span style="color:#b91c1c">${meta.warnings.map(escapeHtml).join('<br>')}</span>` : '');
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('saveNtaBtn').addEventListener('click', async () => {
    const baseUrl = document.getElementById('ntaBaseUrl').value.trim();
    const apiKey = document.getElementById('ntaApiKey').value;
    const statusEl = document.getElementById('ntaConnStatus');
    try {
      await Api.saveConfig({ nta: { baseUrl, apiKey } });
      document.getElementById('ntaApiKey').value = '';
      statusEl.innerHTML = '<span style="color:#15803d">Saved.</span>';
      await refreshSettingsStatus();
    } catch (e) {
      statusEl.innerHTML = `<span style="color:#b91c1c">${escapeHtml(e.message)}</span>`;
    }
  });

  document.getElementById('testNtaBtn').addEventListener('click', async () => {
    const statusEl = document.getElementById('ntaConnStatus');
    statusEl.textContent = 'Testing…';
    try {
      const result = await Api.ntaTestConnection();
      const boardNames = (result.boards || []).map(b => b.name).join(', ') || 'none';
      statusEl.innerHTML = `<span style="color:#15803d">Connected — ${result.boardCount} board(s): ${escapeHtml(boardNames)}.</span>`;
    } catch (e) {
      statusEl.innerHTML = `<span style="color:#b91c1c">${escapeHtml(e.message)}</span>`;
    }
  });

  document.getElementById('syncNtaBtn').addEventListener('click', async () => {
    const statusEl = document.getElementById('ntaSyncStatus');
    statusEl.textContent = 'Syncing… this can take several minutes for the full ticket history.';
    try {
      await Api.syncNta();
      await refreshNtaSyncStatus();
    } catch (e) {
      statusEl.innerHTML = `<span style="color:#b91c1c">${escapeHtml(e.message)}</span>`;
    }
  });

  document.getElementById('uploadExcelBtn').addEventListener('click', async () => {
    const input = document.getElementById('excelFileInput');
    const statusEl = document.getElementById('uploadStatus');
    if (!input.files || !input.files[0]) { statusEl.innerHTML = '<span style="color:#b91c1c">Choose a file first.</span>'; return; }
    statusEl.textContent = 'Uploading…';
    try {
      const result = await Api.uploadExcel(input.files[0]);
      AppState.excelAvailable = true;
      AppState.excelMeta = result.meta;
      statusEl.innerHTML = '<span style="color:#15803d">Parsed successfully.</span>';
      renderUploadMeta();
      document.dispatchEvent(new CustomEvent('excel-data-updated'));
    } catch (e) {
      statusEl.innerHTML = `<span style="color:#b91c1c">${escapeHtml(e.message)}</span>`;
    }
  });

  refreshSettingsStatus();
});
