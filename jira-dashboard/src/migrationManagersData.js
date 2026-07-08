// Sample Migration Managers dataset — shown clearly as sample data (see the
// "Sample data" badge in MigrationManagers.jsx) since there's no real backend
// source for manager/account/tier/health-score info yet. Deterministic seeded
// random so the numbers are stable across reloads, like demoData.js.
const ENT_NAMES = [
  "Abhishek Sakala", "Ajay Singh", "Harika P", "Lakshmi Prasanna", "Ravi S",
  "Sravan T", "Abhishikth B", "Priya Nair", "Jordan Lee", "Maria Gomez",
  "Sam Chen", "Alex Rivera", "Naved", "Vishal Kumar", "Rehan Khan",
  "Akhila", "Praveen Kumar", "Shiva Amuda", "Shivam Singh", "Kantam Hemadasu",
  "Deepak R J", "Vivin Joseph", "Arundhati Sen", "Joy Prakash",
];
const SMB_NAMES = [
  "Nikhil Rao", "Sneha Iyer", "Farhan Ali", "Kavya Menon", "Rohit Verma",
  "Divya Shetty", "Tariq Hussain", "Meera Pillai", "Yash Gupta", "Ananya Das",
  "Karthik Reddy", "Pooja Nair", "Imran Sheikh", "Ritu Malhotra",
];
const ACCOUNT_MANAGERS = ["Arundhati Sen", "Joy Prakash", "Vivin Joseph", "Deepak R J"];
const TIERS = ["Tier 1", "Tier 2", "Tier 3"];

function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function initials(name) {
  return name.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

function healthLabel(score) {
  if (score >= 80) return "Good";
  if (score >= 65) return "Fair";
  return "Needs Attention";
}

function buildManagers(names, segment, seed) {
  const rand = seededRandom(seed);
  const referenceDate = new Date("2026-07-08T00:00:00Z");

  return names.map((name, i) => {
    const activeProjects = 4 + Math.floor(rand() * 15);
    const onTrackShare = 0.45 + rand() * 0.35;
    const onTrack = Math.round(activeProjects * onTrackShare);
    const remaining = activeProjects - onTrack;
    const atRisk = Math.round(remaining * (0.3 + rand() * 0.4));
    const delayed = Math.round((remaining - atRisk) * (0.4 + rand() * 0.4));
    const completed = Math.max(0, remaining - atRisk - delayed);
    const healthScore = Math.max(40, Math.min(98, Math.round(100 - (atRisk * 4 + delayed * 6) / Math.max(1, activeProjects) * 3 + rand() * 6)));
    const lastUpdated = new Date(referenceDate.getTime() - Math.floor(rand() * 4) * 86400000 - Math.floor(rand() * 12) * 3600000);
    const email = name.toLowerCase().replace(/\s+/g, ".") + "@cloudfuze.com";

    return {
      id: `${segment}-${i + 1}`,
      name,
      email,
      initials: initials(name),
      accountManager: ACCOUNT_MANAGERS[Math.floor(rand() * ACCOUNT_MANAGERS.length)],
      tier: TIERS[Math.floor(rand() * TIERS.length)],
      segment,
      activeProjects,
      onTrack,
      atRisk,
      delayed,
      completed,
      healthScore,
      healthLabel: healthLabel(healthScore),
      lastUpdated,
    };
  });
}

const ENT_MANAGERS = buildManagers(ENT_NAMES, "ENT", 42);
const SMB_MANAGERS = buildManagers(SMB_NAMES, "SMB", 99);

export function getManagers(segment) {
  return segment === "SMB" ? SMB_MANAGERS : ENT_MANAGERS;
}
