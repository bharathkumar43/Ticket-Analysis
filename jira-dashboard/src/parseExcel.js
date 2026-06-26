import * as XLSX from "xlsx";
import { SLA_THRESHOLDS } from "./utils.js";

// ── Column name → internal field mapping ─────────────────────────────────────
const COL_VARIANTS = {
  key:            ["key", "ticket key", "issue key", "ticket id", "id"],
  summary:        ["summary", "title", "subject", "description", "issue summary"],
  assignee:       ["assignee", "assigned to", "owner", "engineer"],
  priority:       ["priority"],
  status:         ["status", "ticket status", "state", "current status"],
  issueType:      ["issue type", "type", "ticket type", "issuetype", "kind", "category"],
  combination:    ["combination", "migration path", "path", "route", "migration route",
                   "source → target", "source > target", "source to target"],
  resolutionDays: ["resolution days", "res days", "days to resolve",
                   "resolution time (days)", "time to resolve (days)", "age (days)", "age days"],
  slaBreached:    ["sla breached", "sla breach", "breached", "sla status", "sla compliance"],

  // ── "Resolved" in Jira = text field: "Done" / "Fixed" / "Won't Fix" / empty ──
  // This is NOT a date — keep it separate from date columns.
  resolution:     ["resolved", "resolution", "fix version", "resolve status"],

  // ── Actual date columns ──────────────────────────────────────────────────────
  createdDate:    ["created", "creation date", "date created", "created at",
                   "opened", "open date", "raised", "raised on", "create date"],
  resolvedDate:   ["resolved date", "resolution date", "date resolved", "closed",
                   "close date", "resolved at", "completed", "completion date",
                   "done date", "close on", "closed on", "closed date"],
};

// "Done" synonyms — ticket is considered resolved if resolution matches any of these
const DONE_VALUES = new Set([
  "done", "fixed", "resolved", "closed", "completed",
  "won't fix", "wont fix", "won't do", "wont do",
  "duplicate", "cannot reproduce", "not a bug", "by design",
]);

function isDoneResolution(text) {
  return DONE_VALUES.has(String(text ?? "").toLowerCase().trim());
}

// ── Column header matching ────────────────────────────────────────────────────
function matchField(header) {
  const h = header.toLowerCase().trim().replace(/\s+/g, " ");
  // exact match first
  for (const [field, variants] of Object.entries(COL_VARIANTS)) {
    if (variants.includes(h)) return field;
  }
  // partial match — only for variants longer than 3 chars to avoid false positives
  for (const [field, variants] of Object.entries(COL_VARIANTS)) {
    if (variants.some((v) => v.length > 3 && (h.includes(v) || v.includes(h)))) return field;
  }
  return null;
}

function buildMapping(headers) {
  const mapping = {};
  for (const h of headers) {
    const field = matchField(String(h));
    if (field && !mapping[field]) mapping[field] = h; // first match wins
  }
  return mapping;
}

// ── Date parser ───────────────────────────────────────────────────────────────
// Handles JS Date objects (SheetJS cellDates:true), ISO strings, Jira format
const MONTH_IDX = {jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};

function toDate(v) {
  if (!v && v !== 0) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  const s = String(v).trim();
  if (!s || s === "-" || s === "n/a" || s === "none") return null;

  // ISO / standard strings
  let d = new Date(s);
  if (!isNaN(d.getTime())) return d;

  // Jira format: "01/Jan/26 10:30 AM" or "01/Jan/2026"
  const jira = s.match(/^(\d{1,2})\/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\/(\d{2,4})/i);
  if (jira) {
    let yr = parseInt(jira[3]);
    if (yr < 100) yr += 2000;
    d = new Date(yr, MONTH_IDX[jira[2].toLowerCase()], parseInt(jira[1]));
    if (!isNaN(d.getTime())) return d;
  }

  // DD/MM/YYYY or MM/DD/YYYY
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (dmy) {
    let yr = parseInt(dmy[3]);
    if (yr < 100) yr += 2000;
    d = new Date(yr, parseInt(dmy[2]) - 1, parseInt(dmy[1]));
    if (!isNaN(d.getTime())) return d;
  }

  return null;
}

function diffDays(a, b) {
  const ms = b.getTime() - a.getTime();
  if (ms < 0) return null;
  return Math.round((ms / 86400000) * 10) / 10;
}

// ── Main export ───────────────────────────────────────────────────────────────
export function parseExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));

    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: "array", cellDates: true });

        // Pick the sheet with the most matched columns
        let bestSheet = null, bestMapping = {}, bestScore = -1, bestHeaders = [];

        for (const sheetName of wb.SheetNames) {
          const ws = wb.Sheets[sheetName];
          const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
          if (data.length < 2) continue;

          const headers = (data[0] || []).map(String);
          const mapping = buildMapping(headers);
          const score   = Object.keys(mapping).length;

          if (score > bestScore) {
            bestScore   = score;
            bestSheet   = sheetName;
            bestMapping = mapping;
            bestHeaders = headers;
          }
        }

        if (!bestSheet || bestScore < 2) {
          reject(new Error(
            "Could not identify ticket data columns. Expected columns like: Key, Summary, Assignee, Priority, Status. " +
            "Sheets found: " + wb.SheetNames.join(", ")
          ));
          return;
        }

        const ws      = wb.Sheets[bestSheet];
        const rawRows = XLSX.utils.sheet_to_json(ws, { defval: "" });
        const warnings = [];

        const getString = (row, field) => {
          const col = bestMapping[field];
          return col !== undefined ? String(row[col] ?? "").trim() : "";
        };
        const getRaw = (row, field) => {
          const col = bestMapping[field];
          return col !== undefined ? row[col] : undefined;
        };

        const hasResDays      = !!bestMapping.resolutionDays;
        const hasCreatedDate  = !!bestMapping.createdDate;
        const hasResolvedDate = !!bestMapping.resolvedDate;   // actual date column
        const hasResolution   = !!bestMapping.resolution;     // text column ("Done")

        const todayMs = Date.now();
        const PRIO_VALID = new Set(["Highest", "High", "Medium", "Low", "Lowest"]);

        const rows = rawRows
          .filter((r) => Object.values(r).some((v) => String(v).trim()))
          .map((r, i) => {
            const key         = getString(r, "key")       || `ROW-${i + 1}`;
            const summary     = getString(r, "summary");
            const assignee    = getString(r, "assignee")  || "Unassigned";
            const rawPrio     = getString(r, "priority");
            const priority    = PRIO_VALID.has(rawPrio) ? rawPrio : "Medium";
            const issueType   = getString(r, "issueType") || "Task";
            const combination = getString(r, "combination");

            // ── Status ────────────────────────────────────────────────────────
            // Prefer explicit status column; supplement with resolution text
            let status = getString(r, "status");
            const resolutionText = getString(r, "resolution");
            if (!status && resolutionText) {
              // If only resolution column exists, derive status from it
              status = isDoneResolution(resolutionText) ? "Resolved" : "Open";
            } else if (status && isDoneResolution(resolutionText)) {
              // If resolution says Done but status doesn't say Resolved, upgrade it
              const sl = status.toLowerCase();
              if (!["resolved", "closed", "done", "completed", "fixed"].includes(sl)) {
                status = "Resolved";
              }
            }

            // ── Resolution days ───────────────────────────────────────────────
            let resolutionDays = null;

            // 1. Explicit numeric "Resolution Days" column
            if (hasResDays) {
              const rdRaw = getString(r, "resolutionDays").replace(",", ".");
              const n = parseFloat(rdRaw);
              if (!isNaN(n)) resolutionDays = Math.round(n * 10) / 10;
            }

            // 2. Created date → Resolved date (actual date column)
            if (resolutionDays === null && hasCreatedDate && hasResolvedDate) {
              const created  = toDate(getRaw(r, "createdDate")  ?? getString(r, "createdDate"));
              const resolved = toDate(getRaw(r, "resolvedDate") ?? getString(r, "resolvedDate"));
              if (created && resolved) resolutionDays = diffDays(created, resolved);
            }

            // 3. Created date → today (fallback)
            //    Works for both open tickets (current age) and done tickets where
            //    no resolved-date column exists (age from creation = at least as long as it took)
            if (resolutionDays === null && hasCreatedDate) {
              const created = toDate(getRaw(r, "createdDate") ?? getString(r, "createdDate"));
              if (created) {
                const ms = todayMs - created.getTime();
                if (ms >= 0) resolutionDays = Math.round((ms / 86400000) * 10) / 10;
              }
            }

            // ── SLA breached ──────────────────────────────────────────────────
            const slaRaw = getString(r, "slaBreached").toLowerCase();
            let slaBreached;
            if (slaRaw) {
              slaBreached = ["yes", "true", "1", "breached", "y"].includes(slaRaw) ? "Yes" : "No";
            } else if (resolutionDays !== null && SLA_THRESHOLDS[priority]) {
              slaBreached = resolutionDays > SLA_THRESHOLDS[priority] ? "Yes" : "No";
            } else {
              slaBreached = "No";
            }

            return { key, summary, assignee, priority, status, issueType, combination, resolutionDays, slaBreached };
          });

        // ── Warnings ──────────────────────────────────────────────────────────
        if (!bestMapping.slaBreached) {
          warnings.push("SLA Breached calculated from Priority thresholds.");
        }

        const resolvedCount = rows.filter((r) => r.resolutionDays !== null).length;

        if (!hasResDays && !hasCreatedDate && !hasResolvedDate) {
          warnings.push("No date or Resolution Days column found — Ticket Ageing will be empty.");
        } else if (!hasResDays && hasCreatedDate && !hasResolvedDate) {
          warnings.push("Ageing = days from Created date (no Resolved date column found).");
        } else if (!hasResDays && hasCreatedDate && hasResolvedDate) {
          warnings.push("Resolution Days calculated from Created → Resolved date columns.");
        }


        resolve({
          rows,
          sheet:       bestSheet,
          mapping:     bestMapping,
          sheetNames:  wb.SheetNames,
          columnNames: bestHeaders,
          warnings,
        });
      } catch (err) {
        reject(err);
      }
    };

    reader.readAsArrayBuffer(file);
  });
}
