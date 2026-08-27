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
    case 'page-shiftlead':
      await loadUnassignedDevSection();
      // Overview hero row defaults to the full all-time Dev dataset from Neutara (not
      // scoped to whatever narrow range the "Dev Board Tickets" section above just loaded)
      // so it isn't sitting empty/local until someone manually clicks "All time" there.
      if (typeof slOnHeroRangeChange === 'function') await slOnHeroRangeChange();
      break;
    default:
      break;
  }
}

// Switches to a top-level tab (page-dashboard, page-shiftlead, page-settings, ...) the same
// way clicking its button does — factored out so other tabs can jump here programmatically
// (e.g. Settings' Shift Lead section jumping to a lead's panel on the Shift Lead tab) without
// duplicating this logic or simulating a click.
function switchTopTab(tabId) {
  const btn = document.querySelector(`body > .tab-bar > .tab-btn[data-tab="${tabId}"]`);
  const page = document.getElementById(tabId);
  if (!btn || !page) return;
  document.querySelectorAll('body > .tab-bar > .tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('body > .tab-page').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  page.classList.add('active');
  loadTabIfNeeded(tabId, false);
}

document.addEventListener('DOMContentLoaded', () => {
  setDateInputs();

  document.querySelectorAll('body > .tab-bar > .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTopTab(btn.dataset.tab));
  });

  // shiftLeadTabBar is NOT wired here — shiftlead.js owns it and rebuilds it dynamically
  // (its buttons come from the editable Shift Leads Roster, not a fixed set in this HTML), so
  // it wires its own click listeners each time it rebuilds. See slBuildShiftLeadTabBar.
  [
    { barId: 'leaderMetricsTabBar', pageId: 'page-qateam' },
  ].forEach(({ barId, pageId }) => {
    document.querySelectorAll(`#${barId} > .tab-btn`).forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll(`#${barId} > .tab-btn`).forEach(b => b.classList.remove('active'));
        document.querySelectorAll(`#${pageId} > .tab-page`).forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.subtab).classList.add('active');
      });
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
    }
  });

  // Kick off Settings status first (so AppState.ntaConfigured is known), then load the
  // default (Dashboard) tab.
  (async () => {
    await refreshSettingsStatus();
    await loadTabIfNeeded('page-dashboard', false);
  })();
});
