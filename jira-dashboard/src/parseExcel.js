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
  // Absorbs "First Response SLA Breach" so it doesn't claim the slaBreached slot
  firstResponseSla: ["first response sla breach", "first response sla", "first response time sla"],
  slaBreached:    ["sla breached", "sla breach", "breached", "sla status", "sla compliance",
                   "resolution sla breach", "resolution sla"],

  // ── Resolution text column: "Done" / "Fixed" / "Won't Fix" / empty ──
  resolution:     ["resolution", "fix version", "resolve status"],

  // ── Actual date columns ──────────────────────────────────────────────────────
  createdDate:    ["created", "creation date", "date created", "created at",
                   "opened", "open date", "raised", "raised on", "create date"],
  resolvedDate:   ["resolved", "resolved date", "resolution date", "date resolved", "closed",
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
  let h = header.toLowerCase().trim().replace(/\s+/g, " ");
  // Strip Jira's "Custom field (X)" wrapper so the inner name can match directly
  // e.g. "Custom field (Resolution SLA Breach)" → "resolution sla breach"
  const cfMatch = h.match(/^custom field \((.+)\)$/);
  if (cfMatch) h = cfMatch[1];
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
  // multiCols tracks ALL column names that map to the same field (for repeated Jira custom fields)
  const multiCols = {};
  for (const h of headers) {
    const field = matchField(String(h));
    if (!field) continue;
    if (!mapping[field]) {
      mapping[field] = h; // first match wins as primary
      multiCols[field] = [h];
    } else if (!multiCols[field].includes(h)) {
      multiCols[field].push(h); // track duplicates for multi-value fields
    }
  }
  mapping.__multi = multiCols;
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

// ── Business day approximation ────────────────────────────────────────────────
// Converts calendar days to approximate business days (Mon–Fri only).
// This reduces false positives for tickets that span weekends or holidays.
// Formula: 5 business days per 7 calendar days.
function calendarToBusinessDays(calDays) {
  if (calDays == null) return null;
  const weeks = Math.floor(calDays / 7);
  const remainder = calDays % 7;
  return weeks * 5 + Math.min(remainder, 5);
}

// ── Header row detection ──────────────────────────────────────────────────────
// Scans the first few rows of a sheet (not just row 0) so tables preceded by a
// title/blank row, or workbooks with an unconventional layout, still parse.
const HEADER_SCAN_ROWS = 10;

function findBestHeaderRow(data) {
  let best = { rowIdx: -1, headers: [], mapping: {}, score: -1 };
  for (let i = 0; i < Math.min(HEADER_SCAN_ROWS, data.length); i++) {
    const headers = (data[i] || []).map(String);
    if (!headers.some((h) => h.trim())) continue;
    const mapping = buildMapping(headers);
    const score = Object.keys(mapping).length;
    if (score > best.score) best = { rowIdx: i, headers, mapping, score };
  }
  return best;
}

function extractSheetRows(ws) {
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  if (data.length < 2) return null;

  const { rowIdx, headers, mapping, score } = findBestHeaderRow(data);
  if (rowIdx === -1 || score < 2) return null;

  const rawRows = data.slice(rowIdx + 1).map((r) => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = r[i] ?? ""; });
    return obj;
  });

  return { headers, mapping, score, rawRows };
}

// ── Main export ───────────────────────────────────────────────────────────────
export function parseExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));

    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: "array", cellDates: true });

        // Scan every sheet; any sheet whose columns look like ticket data gets
        // pulled in and merged (handles workbooks with multiple ticket tabs,
        // e.g. "Active" + "Completed", instead of only using the single best sheet).
        const matchedSheets = [];
        for (const sheetName of wb.SheetNames) {
          const extracted = extractSheetRows(wb.Sheets[sheetName]);
          if (extracted) matchedSheets.push({ sheetName, ...extracted });
        }

        if (!matchedSheets.length) {
          reject(new Error(
            "Could not identify ticket data columns in any sheet. Expected columns like: Key, Summary, Assignee, Priority, Status. " +
            "Sheets found: " + wb.SheetNames.join(", ")
          ));
          return;
        }

        // Union matched fields and their column-name variants across all sheets, so a row from
        // any sheet resolves correctly even if sheets use slightly different header names.
        const bestMapping = { __multi: {} };
        for (const s of matchedSheets) {
          for (const [field, cols] of Object.entries(s.mapping.__multi || {})) {
            if (!bestMapping[field]) bestMapping[field] = s.mapping[field];
            bestMapping.__multi[field] = [...new Set([...(bestMapping.__multi[field] || []), ...cols])];
          }
        }
        const bestHeaders = matchedSheets.flatMap((s) => s.headers);
        const bestSheet   = matchedSheets.map((s) => s.sheetName).join(" + ");
        const rawRows     = matchedSheets.flatMap((s) => s.rawRows);
        const warnings = [];

        if (matchedSheets.length > 1) {
          warnings.push(`Merged ${matchedSheets.length} sheets: ${matchedSheets.map((s) => s.sheetName).join(", ")}.`);
        }

        const getString = (row, field) => {
          // For fields with multiple columns (e.g. Jira's repeated "Custom field (Combination)"),
          // return the first non-empty value across all matched columns.
          const cols = (bestMapping.__multi || {})[field] || [];
          for (const col of cols) {
            const v = String(row[col] ?? "").trim();
            if (v) return v;
          }
          return "";
        };
        const getRaw = (row, field) => {
          const cols = (bestMapping.__multi || {})[field] || [];
          for (const col of cols) {
            const v = row[col];
            if (v !== undefined && v !== "") return v;
          }
          return undefined;
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
            const slaRaw = getString(r, "slaBreached").toLowerCase().trim();
            let slaBreached;
            if (slaRaw) {
              // Jira exports SLA fields in several formats — handle all of them:
              //   "Breached 05/May/26 01:05 PM"  → breached  (starts with "breached")
              //   "Completed 07/May/26 10:24 AM" → within SLA
              //   "-1d 2h"  negative time        → breached
              //   "Yes" / "No" / "1" / "0"       → explicit
              const isBreached =
                slaRaw.startsWith("breached") ||
                slaRaw.includes("breach") ||
                ["yes", "true", "1", "y"].includes(slaRaw) ||
                /^-\d/.test(slaRaw); // negative time remaining = already breached
              slaBreached = isBreached ? "Yes" : "No";
            } else if (resolutionDays !== null && SLA_THRESHOLDS[priority]) {
              // No SLA column — fall back to business-day calculation.
              // Only flag RESOLVED tickets; open tickets are still in progress.
              const sl = status.toLowerCase();
              const ticketIsResolved =
                ["resolved", "closed", "done", "completed", "fixed"].includes(sl) ||
                isDoneResolution(resolutionText);
              const businessDays = calendarToBusinessDays(resolutionDays);
              slaBreached = (ticketIsResolved && businessDays > SLA_THRESHOLDS[priority]) ? "Yes" : "No";
            } else {
              slaBreached = "No";
            }

            // ── Store raw dates for date-range filtering ───────────────────────
            const createdAt  = hasCreatedDate
              ? (toDate(getRaw(r, "createdDate")  ?? getString(r, "createdDate"))  ?? null)
              : null;
            const resolvedAt = hasResolvedDate
              ? (toDate(getRaw(r, "resolvedDate") ?? getString(r, "resolvedDate")) ?? null)
              : null;

            // ── Project key (prefix before first hyphen in ticket key) ─────────
            const project = key.includes("-") ? key.split("-")[0].toUpperCase() : "";

            return { key, summary, assignee, priority, status, issueType, combination,
                     resolutionDays, slaBreached, createdAt, resolvedAt, project };
          });

        // ── Warnings ──────────────────────────────────────────────────────────
        if (!bestMapping.slaBreached) {
          warnings.push("No 'Resolution SLA Breach' column found — SLA breach estimated from business days vs priority thresholds. For accurate data, export your Jira CSV with that field included.");
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
