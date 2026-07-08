// Sample ticket dataset shown on first load, before the user uploads a real
// workbook or connects to Jira, so the dashboard is never an empty landing page.
const ASSIGNEES = ["Alex Rivera", "Priya Nair", "Sam Chen", "Jordan Lee", "Maria Gomez"];
const PRIORITIES = ["Highest", "High", "Medium", "Low"];
const ISSUE_TYPES = ["Migration", "Bug", "Task", "Support"];
const COMBINATIONS = ["Box → SharePoint", "Dropbox → OneDrive", "GDrive → SharePoint", "Slack → Teams"];
const STATUSES_RESOLVED = ["Resolved", "Closed", "Done"];
const STATUSES_OPEN = ["In Progress", "Open", "Waiting on Customer"];

function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

export function generateDemoData() {
  const rand = seededRandom(42);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const now = new Date("2026-07-07T00:00:00Z").getTime();
  const DAY = 86400000;

  const rows = Array.from({ length: 60 }, (_, i) => {
    const isResolved = rand() > 0.35;
    const priority = pick(PRIORITIES);
    const createdAt = new Date(now - Math.floor(rand() * 60) * DAY);
    const resolutionDays = isResolved ? Math.round((1 + rand() * 12) * 10) / 10 : null;
    const resolvedAt = isResolved ? new Date(createdAt.getTime() + resolutionDays * DAY) : null;
    const slaBreached = isResolved && resolutionDays > 5 && rand() > 0.5 ? "Yes" : "No";

    return {
      key: `DEMO-${1000 + i}`,
      summary: `Sample migration ticket #${i + 1}`,
      assignee: pick(ASSIGNEES),
      priority,
      status: isResolved ? pick(STATUSES_RESOLVED) : pick(STATUSES_OPEN),
      issueType: pick(ISSUE_TYPES),
      combination: pick(COMBINATIONS),
      resolutionDays,
      slaBreached,
      createdAt,
      resolvedAt,
      project: "DEMO",
    };
  });

  return {
    rows,
    sheet: "Demo",
    warnings: [],
    fileName: "Sample Data",
    isDemo: true,
  };
}
