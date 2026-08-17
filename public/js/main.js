// Tab switching, shared date-range controls, and lazy per-tab loading (mirrors the
// reference artifact's "load on first visit, or via its own refresh button" pattern).
const loadedTabs = new Set();

function setDateInputs() {
  document.getElementById('fromDate').value = AppState.fromStr;
  document.getElementById('toDate').value = AppState.toStr;
  document.getElementById('staleSel').value = String(AppState.staleDays);
}

function readDateInputs() {
  AppState.fromStr = document.getElementById('fromDate').value || AppState.fromStr;
  AppState.toStr = document.getElementById('toDate').value || AppState.toStr;
  AppState.staleDays = Number(document.getElementById('staleSel').value) || 7;
}

async function loadTabIfNeeded(tabId, force) {
  if (!force && loadedTabs.has(tabId)) return;
  loadedTabs.add(tabId);
  switch (tabId) {
    case 'page-dashboard':
      await refreshDashboard();
      await loadReopenedSection(AppState.fromStr, AppState.toStr, toExclusive(AppState.toStr));
      await loadWeeklyReportsSection();
      break;
    case 'page-teamtickets':
      await loadTeamTicketsSection();
      break;
    case 'page-customereng':
      await loadTeamTabSection('eng');
      break;
    case 'page-qateam':
      await loadTeamTabSection('qa');
      break;
    case 'page-infrateam':
      await loadTeamTabSection('infra');
      break;
    default:
      break;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  setDateInputs();

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-page').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const page = document.getElementById(btn.dataset.tab);
      page.classList.add('active');
      loadTabIfNeeded(btn.dataset.tab, false);
    });
  });

  document.querySelectorAll('.preset').forEach(btn => {
    btn.addEventListener('click', () => {
      const days = Number(btn.dataset.days);
      AppState.toStr = todayStr();
      AppState.fromStr = addDaysStr(AppState.toStr, -days);
      setDateInputs();
    });
  });

  document.getElementById('applyBtn').addEventListener('click', async () => {
    readDateInputs();
    const activeTab = document.querySelector('.tab-btn.active').dataset.tab;
    // "Apply & refresh" re-runs whichever tab is currently visible, same as the reference.
    if (activeTab === 'page-dashboard') {
      await refreshDashboard();
      await loadReopenedSection(AppState.fromStr, AppState.toStr, toExclusive(AppState.toStr));
    } else if (activeTab === 'page-teamtickets') {
      await loadTeamTicketsSection();
    } else if (C.TEAM_TAB_DEFS[activeTab.replace('page-customereng', 'eng').replace('page-qateam', 'qa').replace('page-infrateam', 'infra')]) {
      const teamKey = activeTab === 'page-customereng' ? 'eng' : activeTab === 'page-qateam' ? 'qa' : 'infra';
      await loadTeamTabSection(teamKey);
    }
  });

  // Kick off Settings status first (so AppState.ntaConfigured is known), then load the
  // default (Dashboard) tab.
  (async () => {
    await refreshSettingsStatus();
    await loadTabIfNeeded('page-dashboard', false);
  })();
});
