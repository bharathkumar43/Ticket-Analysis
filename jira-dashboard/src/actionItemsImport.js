import * as XLSX from "xlsx";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.mjs?url";
import mammoth from "mammoth";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const STATUSES = ["Open", "In Progress", "Resolved"];
const PRIORITIES = ["High", "Medium", "Low"];

const COL_VARIANTS = {
  title:       ["title", "action item", "action", "item", "task", "description", "summary"],
  owner:       ["owner", "assignee", "assigned to", "responsible", "responsible person"],
  meetingType: ["meeting", "meeting type", "category"],
  priority:    ["priority"],
  dueDate:     ["due date", "due", "deadline", "target date"],
  status:      ["status"],
  notes:       ["notes", "comments", "remarks"],
};

function matchField(header) {
  const h = String(header).toLowerCase().trim().replace(/\s+/g, " ");
  for (const [field, variants] of Object.entries(COL_VARIANTS)) {
    if (variants.includes(h)) return field;
  }
  for (const [field, variants] of Object.entries(COL_VARIANTS)) {
    if (variants.some((v) => v.length > 3 && h.includes(v))) return field;
  }
  return null;
}

function buildMapping(headers) {
  const mapping = {};
  headers.forEach((h) => {
    const field = matchField(h);
    if (field && !mapping[field]) mapping[field] = h;
  });
  return mapping;
}

function normalizeStatus(v) {
  const s = String(v || "").toLowerCase().trim();
  if (["resolved", "done", "closed", "complete", "completed"].includes(s)) return "Resolved";
  if (["in progress", "inprogress", "ongoing", "in-progress"].includes(s)) return "In Progress";
  return STATUSES.includes(v) ? v : "Open";
}

function normalizePriority(v) {
  const s = String(v || "").toLowerCase().trim();
  if (s.startsWith("high")) return "High";
  if (s.startsWith("low")) return "Low";
  return PRIORITIES.includes(v) ? v : "Medium";
}

function toIsoDate(v) {
  if (!v) return "";
  if (v instanceof Date) return isNaN(v.getTime()) ? "" : v.toISOString().slice(0, 10);
  const s = String(v).trim();
  if (!s) return "";
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (dmy) {
    let yr = parseInt(dmy[3]);
    if (yr < 100) yr += 2000;
    const d2 = new Date(yr, parseInt(dmy[2]) - 1, parseInt(dmy[1]));
    if (!isNaN(d2.getTime())) return d2.toISOString().slice(0, 10);
  }
  return "";
}

function rowsToItems(rawRows, mapping) {
  return rawRows
    .map((r) => {
      const get = (field) => (mapping[field] != null ? r[mapping[field]] : undefined);
      const title = String(get("title") ?? "").trim();
      if (!title) return null;
      return {
        title,
        meetingType: String(get("meetingType") ?? "").trim() || "MBR",
        owner: String(get("owner") ?? "").trim(),
        priority: normalizePriority(get("priority")),
        dueDate: toIsoDate(get("dueDate")),
        status: normalizeStatus(get("status")),
        notes: String(get("notes") ?? "").trim(),
      };
    })
    .filter(Boolean);
}

function linesToItems(text) {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 2)
    .map((title) => ({
      title,
      meetingType: "MBR",
      owner: "",
      priority: "Medium",
      dueDate: "",
      status: "Open",
      notes: "",
    }));
}

async function parseSpreadsheet(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const allItems = [];
  for (const sheetName of wb.SheetNames) {
    const data = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: "" });
    if (data.length < 2) continue;
    const headers = (data[0] || []).map(String);
    const mapping = buildMapping(headers);
    if (!mapping.title) continue;
    const rawRows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: "" });
    allItems.push(...rowsToItems(rawRows, mapping));
  }
  if (!allItems.length) {
    throw new Error("Could not find an action item column (e.g. 'Action Item' / 'Title' / 'Task') in this file.");
  }
  return allItems;
}

async function parsePdf(file) {
  const buf = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: buf }).promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((it) => it.str).join(" ") + "\n";
  }
  const items = linesToItems(text);
  if (!items.length) throw new Error("No readable text found in this PDF.");
  return items;
}

async function parseWord(file) {
  const buf = await file.arrayBuffer();
  const { value } = await mammoth.extractRawText({ arrayBuffer: buf });
  const items = linesToItems(value);
  if (!items.length) throw new Error("No readable text found in this Word document.");
  return items;
}

export async function parseActionItemsFile(file) {
  const name = file.name.toLowerCase();
  if (/\.(xlsx|xls|csv)$/.test(name)) {
    return { items: await parseSpreadsheet(file), kind: "spreadsheet" };
  }
  if (/\.pdf$/.test(name)) {
    return { items: await parsePdf(file), kind: "pdf" };
  }
  if (/\.doc$/.test(name)) {
    throw new Error("Legacy .doc files aren't supported — please save it as .docx and try again.");
  }
  if (/\.docx$/.test(name)) {
    return { items: await parseWord(file), kind: "word" };
  }
  throw new Error("Unsupported file type. Please upload an Excel/CSV, PDF, or Word file.");
}
