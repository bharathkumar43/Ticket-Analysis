// Leader Mertices (Ajay / Abhishek / Ankit sub-tabs): weekly KPI tracker built on a
// per-project log. Each leader has a "metric profile" — a set of boolean flags checked
// per project, each with its own % target — since Ankit's role tracks a different set
// of KPIs (CSAT, RCA timeliness, call attendance, etc.) than Ajay/Abhishek's on-time
// delivery metrics. On Time / SOW-based metrics compare two dates; all others are plain
// checkboxes. A project is bucketed into Week/Day by its SOW date (falls back to a
// generic "Date" field for Ankit's profile, where there's no delivery to compare against),
// via a calendar-anchor system (Week 1 Day 1 = a configurable start date, rolling into a
// new 4-week cycle every 28 days). Not derivable from Jira fields, so this is a
// standalone localStorage-backed log.

// Each metric: key, label, target %, comparison ('gte' or 'lte'), and how it's derived:
//   type 'onTime'  — computed from sowDate vs deliveredDate (needs both fields on the project)
//   type 'flag'    — a plain checkbox on the project
const LEADER_METRIC_PROFILES = {
  default: {
    dateFieldLabel: 'SOW date',
    metrics: [
      { key: 'onTime', label: 'On Time', shortLabel: 'On Time', target: 70, comparison: 'gte', type: 'onTime' },
      { key: 'fiveStar', label: '5-Star Reviews', shortLabel: '5-Star', target: 50, comparison: 'gte', type: 'flag', icon: '⭐' },
      { key: 'escalated', label: 'Escalation', shortLabel: 'Escalation', target: 5, comparison: 'lte', type: 'flag', icon: '⚠️' },
      { key: 'slaBreached', label: 'SLA Breach', shortLabel: 'SLA Breach', target: 5, comparison: 'lte', type: 'flag', icon: '🔴' },
    ],
  },
  ankit: {
    dateFieldLabel: 'Date',
    metrics: [
      { key: 'resolvedWithinSla', label: 'Issue Resolution Rate (≤4hr SLA)', shortLabel: 'Resolution Rate', target: 90, comparison: 'gte', type: 'flag', icon: '✅' },
      { key: 'reopened', label: 'Reopen Rate', shortLabel: 'Reopen Rate', target: 5, comparison: 'lte', type: 'flag', icon: '🔁' },
      { key: 'requirementAccurate', label: 'Requirement Capture Accuracy', shortLabel: 'Req. Accuracy', target: 90, comparison: 'gte', type: 'flag', icon: '📋' },
      { key: 'csatPositive', label: 'Customer Satisfaction (CSAT)', shortLabel: 'CSAT', target: 90, comparison: 'gte', type: 'flag', icon: '😀' },
      { key: 'rcaOnTime', label: 'RCA Submission Timeliness (≤24hrs)', shortLabel: 'RCA Timely', target: 90, comparison: 'gte', type: 'flag', icon: '📝' },
      { key: 'escalationPrevented', label: 'Escalation Prevention Rate', shortLabel: 'Esc. Prevention', target: 95, comparison: 'gte', type: 'flag', icon: '🛡️' },
      { key: 'goodHandoff', label: 'Handoff Quality to CS/Migration', shortLabel: 'Handoff Quality', target: 90, comparison: 'gte', type: 'flag', icon: '🤝' },
      { key: 'callAttended', label: 'Call Attendance / Responsiveness', shortLabel: 'Call Attendance', target: 95, comparison: 'gte', type: 'flag', icon: '📞' },
      { key: 'customerEscalationMail', label: 'Escalation Mail from Customer/Anthony', shortLabel: 'Escalation Mail', target: 5, comparison: 'lte', type: 'flag', icon: '✉️' },
    ],
  },
};
function profileForLeader(leaderKey) {
  return LEADER_METRIC_PROFILES[leaderKey] || LEADER_METRIC_PROFILES.default;
}

const LEADER_METRICS_SHIFTS = [
  { key: 'day', label: 'Day shift', time: '1pm – 10pm' },
  { key: 'night', label: 'Night shift', time: '9pm – 6am' },
];
const LEADER_METRICS_LEADERS = ['ajay', 'abhishek', 'ankit'];
const LEADER_METRICS_WEEKS = 4;
const LEADER_METRICS_DAYS = 7;

const LEADER_METRICS_STORE_KEY = 'leaderMetricsProjects';
// Shape: { [leaderKey]: [ { id, name, shift, sowDate, deliveredDate, ...metricFlags } ] }
const LEADER_METRICS_ANCHOR_KEY = 'leaderMetricsAnchor'; // { [leaderKey]: 'YYYY-MM-DD' for Week 1 Day 1 }
const LEADER_METRICS_UI_KEY = 'leaderMetricsUi'; // { [leaderKey]: { expandedWeek: number } }

function loadLeaderMetricsData() {
  try { return JSON.parse(localStorage.getItem(LEADER_METRICS_STORE_KEY)) || {}; }
  catch (e) { return {}; }
}
function saveLeaderMetricsData(all) {
  localStorage.setItem(LEADER_METRICS_STORE_KEY, JSON.stringify(all));
}
function getLeaderProjects(all, leaderKey) {
  all[leaderKey] = all[leaderKey] || [];
  return all[leaderKey];
}
function loadAnchors() {
  try { return JSON.parse(localStorage.getItem(LEADER_METRICS_ANCHOR_KEY)) || {}; }
  catch (e) { return {}; }
}
function saveAnchors(all) { localStorage.setItem(LEADER_METRICS_ANCHOR_KEY, JSON.stringify(all)); }
function loadUiState() {
  try { return JSON.parse(localStorage.getItem(LEADER_METRICS_UI_KEY)) || {}; }
  catch (e) { return {}; }
}
function saveUiState(all) { localStorage.setItem(LEADER_METRICS_UI_KEY, JSON.stringify(all)); }

function isoDate(d) { return d.toISOString().slice(0, 10); }
function mostRecentMonday(d) {
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setUTCDate(monday.getUTCDate() + diff);
  return monday;
}
function getAnchor(leaderKey) {
  const anchors = loadAnchors();
  if (!anchors[leaderKey]) {
    anchors[leaderKey] = isoDate(mostRecentMonday(new Date()));
    saveAnchors(anchors);
  }
  return anchors[leaderKey];
}
function addDaysIso(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return isoDate(d);
}
function fmtRangeDate(dateStr) {
  return new Date(dateStr + 'T00:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
// Maps a date to { week, day } relative to the anchor, or null if outside the current
// 4-week window (28 days starting at the anchor — no wraparound for past cycles, since
// each project keeps its own real date).
function slotForDate(anchor, dateStr) {
  const anchorD = new Date(anchor + 'T00:00:00Z');
  const d = new Date(dateStr + 'T00:00:00Z');
  const daysSince = Math.round((d - anchorD) / 86400000);
  if (daysSince < 0 || daysSince >= LEADER_METRICS_WEEKS * LEADER_METRICS_DAYS) return null;
  return { week: Math.floor(daysSince / 7), day: daysSince % 7 };
}
function todayIso() { return isoDate(new Date()); }

function isOnTime(project) {
  if (!project.deliveredDate) return null; // not yet delivered
  return project.deliveredDate <= project.sowDate;
}
function metricTrue(project, metric) {
  return metric.type === 'onTime' ? isOnTime(project) === true : !!project[metric.key];
}
function metricApplicable(project, metric) {
  return metric.type === 'onTime' ? !!project.deliveredDate : true;
}

function pct(numerator, denominator) {
  if (!denominator) return null;
  return (numerator / denominator) * 100;
}
function fmtPct(v) { return v === null || v === undefined ? '—' : `${v.toFixed(1)}%`; }
function pctClass(v, target, comparison) {
  if (v === null || v === undefined) return '';
  const ok = comparison === 'lte' ? v <= target : v >= target;
  return ok ? 'good-cell' : 'bad-cell';
}

function computeAgg(profile, projects) {
  const total = projects.length;
  const perMetric = {};
  profile.metrics.forEach(metric => {
    const applicable = projects.filter(p => metricApplicable(p, metric));
    const trueCount = applicable.filter(p => metricTrue(p, metric)).length;
    perMetric[metric.key] = { count: trueCount, applicable: applicable.length, pct: pct(trueCount, total) };
  });
  return { total, perMetric };
}

function scorecardHtml(profile, weekAgg) {
  const cards = profile.metrics.map(m => {
    const v = weekAgg.perMetric[m.key];
    const ok = pctClass(v.pct, m.target, m.comparison);
    return `<div class="kpi-score-card ${ok}">
      <div class="kpi-score-val">${fmtPct(v.pct)}</div>
      <div class="kpi-score-lbl">${escapeHtml(m.shortLabel)}</div>
      <div class="kpi-score-target">Target: ${m.comparison === 'lte' ? '&le;' : '&ge;'}${m.target}%</div>
    </div>`;
  }).join('');
  return `<div class="kpi-scorecard-block">
    <div class="kpi-scorecard-head">This Week at a Glance <span class="kpi-block-hint">${weekAgg.total} entr${weekAgg.total === 1 ? 'y' : 'ies'} logged</span></div>
    <div class="kpi-scorecard-grid">${cards}</div>
  </div>`;
}

function innerTabsHtml(leaderKey, activeInner) {
  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'day', label: 'Day Shift' },
    { key: 'night', label: 'Night Shift' },
  ];
  return `<div class="seg-tab-bar kpi-inner-tabs">
    ${tabs.map(t => `<button type="button" class="seg-tab-btn${activeInner === t.key ? ' active' : ''}" data-leader="${leaderKey}" data-inner-tab="${t.key}">${t.label}</button>`).join('')}
  </div>`;
}

function calendarRangeBarHtml(leaderKey, anchor, dateFieldLabel) {
  const endDate = addDaysIso(anchor, LEADER_METRICS_WEEKS * LEADER_METRICS_DAYS - 1);
  return `<div class="kpi-range-bar">
    <span class="kpi-range-label">CALENDAR RANGE</span>
    <span class="kpi-range-dates">${fmtRangeDate(anchor)} – ${fmtRangeDate(endDate)}</span>
    <span class="kpi-range-hint">Week 1, Day 1 starts on</span>
    <input type="date" id="${leaderKey}AnchorInput" value="${anchor}">
    <button type="button" class="secondary" id="${leaderKey}ResetAnchorBtn">Reset to this Monday</button>
  </div>`;
}

function targetsBarHtml(profile) {
  return `<div class="kpi-targets-bar">
    <span class="kpi-targets-label">TARGETS</span>
    ${profile.metrics.map(m => `<span>${escapeHtml(m.shortLabel)}: <b>${m.comparison === 'lte' ? '&le;' : '&ge;'}${m.target}%</b></span>`).join('')}
  </div>`;
}

function aggRowHtml(profile, label, agg) {
  return `<tr>
    <td>${escapeHtml(label)}</td>
    <td>${agg.total}</td>
    ${profile.metrics.map(m => {
      const v = agg.perMetric[m.key];
      return `<td class="${pctClass(v.pct, m.target, m.comparison)}">${fmtPct(v.pct)}</td>`;
    }).join('')}
  </tr>`;
}

function weeklySummaryTableHtml(profile, title, projectsByWeek, monthAgg, cls) {
  const rows = projectsByWeek.map((wp, idx) => aggRowHtml(profile, `Week ${idx + 1}`, computeAgg(profile, wp))).join('');
  return `<div class="kpi-summary-block">
    <div class="kpi-block-header ${cls}">${escapeHtml(title)} — Weekly Summary</div>
    <div class="table-wrap"><div class="table-scroll"><table class="kpi-table">
      <thead><tr><th>Week</th><th>Projects</th>${profile.metrics.map(m => `<th>${escapeHtml(m.shortLabel)} %</th>`).join('')}</tr></thead>
      <tbody>${rows}</tbody>
      <tfoot>${aggRowHtml(profile, 'MONTH TO', monthAgg)}</tfoot>
    </table></div></div>
  </div>`;
}

function projectRowHtml(profile, leaderKey, project) {
  const cells = profile.metrics.map(m => {
    if (m.type === 'onTime') {
      const onTime = isOnTime(project);
      const cls = onTime === null ? '' : onTime ? 'good-cell' : 'bad-cell';
      const label = onTime === null ? 'Pending' : onTime ? 'On time' : 'Late';
      return `<td class="${cls}">${label}</td>`;
    }
    return `<td>${project[m.key] ? m.icon : ''}</td>`;
  }).join('');
  return `<tr data-project-id="${project.id}">
    <td>${escapeHtml(project.name || '(unnamed)')}</td>
    <td>${fmtRangeDate(project.sowDate)}</td>
    <td>${project.deliveredDate ? fmtRangeDate(project.deliveredDate) : '—'}</td>
    ${cells}
    <td><button type="button" class="secondary kpi-delete-project-btn" data-leader="${leaderKey}" data-project-id="${project.id}">Delete</button></td>
  </tr>`;
}

function dailyLogTableHtml(profile, leaderKey, shiftKey, shiftLabel, projects, anchor, cls, expandedWeek) {
  const colCount = 4 + profile.metrics.length; // name, date, delivered, ...metrics, delete
  const groups = [];
  for (let w = 0; w < LEADER_METRICS_WEEKS; w++) {
    const isOpen = w === expandedWeek;
    const weekProjects = [];
    for (let d = 0; d < LEADER_METRICS_DAYS; d++) {
      const dateStr = addDaysIso(anchor, w * 7 + d);
      weekProjects.push(...projects.filter(p => p.shift === shiftKey && p.sowDate === dateStr));
    }
    const weekAgg = computeAgg(profile, weekProjects);
    const primaryMetric = profile.metrics[0];
    let dayRowsHtml = '';
    if (isOpen) {
      for (let d = 0; d < LEADER_METRICS_DAYS; d++) {
        const dateStr = addDaysIso(anchor, w * 7 + d);
        const dayProjects = projects.filter(p => p.shift === shiftKey && p.sowDate === dateStr);
        const isToday = dateStr === todayIso();
        dayRowsHtml += `<tr class="kpi-day-group-row${isToday ? ' kpi-today-row' : ''}"><td colspan="${colCount}">
          Day ${d + 1} — ${fmtRangeDate(dateStr)}${isToday ? ' <span class="kpi-today-tag">Today</span>' : ''}
        </td></tr>`;
        if (!dayProjects.length) {
          dayRowsHtml += `<tr><td colspan="${colCount}" class="kpi-empty-day">No entries logged here yet.</td></tr>`;
        } else {
          dayProjects.forEach(p => { dayRowsHtml += projectRowHtml(profile, leaderKey, p); });
        }
      }
    }
    groups.push(`
      <button type="button" class="kpi-week-toggle${isOpen ? ' open' : ''}" data-leader="${leaderKey}" data-toggle-week="${w}">
        <span class="kpi-week-caret">${isOpen ? '▾' : '▸'}</span> Week ${w + 1}
        <span class="kpi-week-toggle-sub">${weekAgg.total} entries · ${escapeHtml(primaryMetric.shortLabel)} ${fmtPct(weekAgg.perMetric[primaryMetric.key].pct)}</span>
      </button>
      ${isOpen ? `<table class="kpi-table kpi-daily-table">
        <thead><tr><th>Name</th><th>${escapeHtml(profile.dateFieldLabel)}</th><th>Resolved/Delivered</th>${profile.metrics.map(m => `<th>${escapeHtml(m.shortLabel)}</th>`).join('')}<th></th></tr></thead>
        <tbody>${dayRowsHtml}</tbody>
      </table>` : ''}
    `);
  }
  return `<div class="kpi-summary-block">
    <div class="kpi-block-header ${cls}">Log — ${escapeHtml(shiftLabel)} <span class="kpi-block-hint">Entries are bucketed by ${escapeHtml(profile.dateFieldLabel)}</span></div>
    <div class="table-wrap">${groups.join('')}</div>
  </div>`;
}

function addProjectFormHtml(profile, leaderKey, detailsOpen) {
  const flagMetrics = profile.metrics.filter(m => m.type === 'flag');
  return `<div class="kpi-add-project">
    <div class="kpi-add-project-title">Log an entry</div>
    <div class="kpi-add-project-fields">
      <label>Name<input type="text" id="${leaderKey}NewName" placeholder="e.g. Acme ticket / call"></label>
      <label>Shift
        <select id="${leaderKey}NewShift">
          ${LEADER_METRICS_SHIFTS.map(s => `<option value="${s.key}">${escapeHtml(s.label)}</option>`).join('')}
        </select>
      </label>
      <label>${escapeHtml(profile.dateFieldLabel)}<input type="date" id="${leaderKey}NewSow" value="${todayIso()}"></label>
      <label>Resolved/Delivered date<input type="date" id="${leaderKey}NewDelivered"></label>
      <button type="button" class="primary" id="${leaderKey}AddProjectBtn">Add entry</button>
    </div>
    ${flagMetrics.length ? `
      <button type="button" class="kpi-details-toggle" id="${leaderKey}DetailsToggle">
        ${detailsOpen ? '▾' : '▸'} More details <span class="kpi-block-hint">(${flagMetrics.length} metric checkbox${flagMetrics.length === 1 ? '' : 'es'})</span>
      </button>
      <div class="kpi-add-project-details" style="${detailsOpen ? '' : 'display:none;'}">
        <button type="button" class="secondary kpi-mark-all-good-btn" id="${leaderKey}MarkAllGoodBtn">Mark all good</button>
        <div class="kpi-add-project-checkboxes">
          ${flagMetrics.map(m => `<label class="kpi-add-checkbox"><input type="checkbox" id="${leaderKey}New_${m.key}" data-good-comparison="${m.comparison}"> ${escapeHtml(m.shortLabel)}</label>`).join('')}
        </div>
      </div>` : ''}
  </div>`;
}

function buildLeaderMetricsPanel(leaderKey) {
  const pageId = `leader-${leaderKey}`;
  const page = document.getElementById(pageId);
  if (!page) return;
  const profile = profileForLeader(leaderKey);
  const all = loadLeaderMetricsData();
  const projects = getLeaderProjects(all, leaderKey);
  const anchor = getAnchor(leaderKey);

  const dayProjects = projects.filter(p => p.shift === 'day');
  const nightProjects = projects.filter(p => p.shift === 'night');
  const projectsByWeek = (list) => Array.from({ length: LEADER_METRICS_WEEKS }, (_, w) => {
    const from = addDaysIso(anchor, w * 7);
    const to = addDaysIso(anchor, w * 7 + 6);
    return list.filter(p => p.sowDate >= from && p.sowDate <= to);
  });
  const dayByWeek = projectsByWeek(dayProjects);
  const nightByWeek = projectsByWeek(nightProjects);
  const bothByWeek = dayByWeek.map((wk, i) => wk.concat(nightByWeek[i]));
  const dayMonthAgg = computeAgg(profile, dayByWeek.flat());
  const nightMonthAgg = computeAgg(profile, nightByWeek.flat());
  const bothMonthAgg = computeAgg(profile, bothByWeek.flat());

  const uiState = loadUiState();
  const leaderUi = uiState[leaderKey] || {};
  const todaySlotForExpand = slotForDate(anchor, todayIso());
  const expandedWeek = leaderUi.expandedWeek !== undefined ? leaderUi.expandedWeek : (todaySlotForExpand ? todaySlotForExpand.week : 0);
  const currentWeekIdx = todaySlotForExpand ? todaySlotForExpand.week : 0;
  const activeInner = leaderUi.innerTab || 'overview';
  const detailsOpen = !!leaderUi.detailsOpen;

  const sections = {
    overview: `${scorecardHtml(profile, computeAgg(profile, bothByWeek[currentWeekIdx]))}
      ${weeklySummaryTableHtml(profile, 'Both Shifts Together', bothByWeek, bothMonthAgg, 'kpi-head-both')}`,
    day: `${weeklySummaryTableHtml(profile, 'Day Shift', dayByWeek, dayMonthAgg, 'kpi-head-day')}
      ${dailyLogTableHtml(profile, leaderKey, 'day', 'Day Shift', projects, anchor, 'kpi-head-day', expandedWeek)}`,
    night: `${weeklySummaryTableHtml(profile, 'Night Shift', nightByWeek, nightMonthAgg, 'kpi-head-night')}
      ${dailyLogTableHtml(profile, leaderKey, 'night', 'Night Shift', projects, anchor, 'kpi-head-night', expandedWeek)}`,
  };

  page.innerHTML = `
    <h3 style="margin:16px 0 10px;">Weekly KPI Tracker</h3>
    ${calendarRangeBarHtml(leaderKey, anchor)}
    ${targetsBarHtml(profile)}
    ${addProjectFormHtml(profile, leaderKey, detailsOpen)}
    ${innerTabsHtml(leaderKey, activeInner)}
    <div class="kpi-inner-tab-body">${sections[activeInner] || sections.overview}</div>
  `;

  document.getElementById(`${leaderKey}DetailsToggle`) && document.getElementById(`${leaderKey}DetailsToggle`).addEventListener('click', () => {
    const ui = loadUiState();
    ui[leaderKey] = ui[leaderKey] || {};
    ui[leaderKey].detailsOpen = !ui[leaderKey].detailsOpen;
    saveUiState(ui);
    buildLeaderMetricsPanel(leaderKey);
  });
  document.getElementById(`${leaderKey}MarkAllGoodBtn`) && document.getElementById(`${leaderKey}MarkAllGoodBtn`).addEventListener('click', () => {
    profile.metrics.filter(m => m.type === 'flag').forEach(m => {
      const cb = document.getElementById(`${leaderKey}New_${m.key}`);
      if (cb) cb.checked = m.comparison === 'gte';
    });
  });
  page.querySelectorAll('.kpi-inner-tabs button[data-inner-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      const { leader, innerTab } = btn.dataset;
      const ui = loadUiState();
      ui[leader] = ui[leader] || {};
      ui[leader].innerTab = innerTab;
      saveUiState(ui);
      buildLeaderMetricsPanel(leader);
    });
  });

  document.getElementById(`${leaderKey}AddProjectBtn`).addEventListener('click', () => {
    const name = document.getElementById(`${leaderKey}NewName`).value.trim();
    const shift = document.getElementById(`${leaderKey}NewShift`).value;
    const sowDate = document.getElementById(`${leaderKey}NewSow`).value;
    const deliveredDate = document.getElementById(`${leaderKey}NewDelivered`).value || null;
    if (!sowDate) { document.getElementById(`${leaderKey}NewSow`).focus(); return; }
    const entry = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name, shift, sowDate, deliveredDate };
    profile.metrics.filter(m => m.type === 'flag').forEach(m => {
      entry[m.key] = document.getElementById(`${leaderKey}New_${m.key}`).checked;
    });
    const current = loadLeaderMetricsData();
    getLeaderProjects(current, leaderKey).push(entry);
    saveLeaderMetricsData(current);
    buildLeaderMetricsPanel(leaderKey);
  });

  page.querySelectorAll('.kpi-delete-project-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const { leader, projectId } = btn.dataset;
      const current = loadLeaderMetricsData();
      current[leader] = getLeaderProjects(current, leader).filter(p => p.id !== projectId);
      saveLeaderMetricsData(current);
      buildLeaderMetricsPanel(leader);
    });
  });

  document.getElementById(`${leaderKey}AnchorInput`).addEventListener('change', (e) => {
    if (!e.target.value) return;
    const anchors = loadAnchors();
    anchors[leaderKey] = e.target.value;
    saveAnchors(anchors);
    buildLeaderMetricsPanel(leaderKey);
  });
  document.getElementById(`${leaderKey}ResetAnchorBtn`).addEventListener('click', () => {
    const anchors = loadAnchors();
    anchors[leaderKey] = isoDate(mostRecentMonday(new Date()));
    saveAnchors(anchors);
    buildLeaderMetricsPanel(leaderKey);
  });

  page.querySelectorAll('.kpi-week-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const { leader, toggleWeek } = btn.dataset;
      const ui = loadUiState();
      const w = Number(toggleWeek);
      ui[leader] = ui[leader] || {};
      ui[leader].expandedWeek = ui[leader].expandedWeek === w ? -1 : w;
      saveUiState(ui);
      buildLeaderMetricsPanel(leader);
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  LEADER_METRICS_LEADERS.forEach(buildLeaderMetricsPanel);
});
