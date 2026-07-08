import React, { useEffect, useMemo, useRef, useState } from "react";
import { makeLocalActionItemsStore } from "./actionItemsStore.js";
import { makeBackendActionItemsStore } from "./actionItemsApi.js";
import { parseActionItemsFile } from "./actionItemsImport.js";

const MEETING_TYPES = ["MBR", "Leadership"];
const STATUSES = ["Open", "In Progress", "Resolved"];
const PRIORITIES = ["High", "Medium", "Low"];
const PAGE_SIZE_OPTIONS = [10, 25, 50];
const NOTIFICATION_TRIGGERS = [
  { key: "assigned", label: "When an item is assigned to me" },
  { key: "dueSoon",  label: "When due date is approaching (1 day before)" },
  { key: "overdue",  label: "When an item is overdue" },
  { key: "status",   label: "When status is updated" },
];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function isOverdue(item) {
  if (item.status === "Resolved" || !item.dueDate) return false;
  return item.dueDate < todayStr();
}

function daysUntil(dueDate) {
  if (!dueDate) return null;
  const ms = new Date(dueDate).getTime() - new Date(todayStr()).getTime();
  return Math.round(ms / 86400000);
}

function initials(name) {
  return (name || "?").trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

function emptyForm() {
  return { title: "", meetingType: "MBR", owner: "", ownerEmail: "", priority: "Medium", dueDate: "", status: "Open", notes: "" };
}

function badgeClassForStatus(status) {
  if (status === "Resolved") return "b-green";
  if (status === "In Progress") return "b-amber";
  return "b-blue";
}

function badgeClassForPriority(p) {
  if (p === "High") return "b-red";
  if (p === "Low") return "b-green";
  return "b-amber";
}

function displayId(item) {
  return "AI-" + item.seq;
}

function formatUpdated(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) +
    ", " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function ActionItems({ onChange, jiraCtx }) {
  const backendConnected = !!(jiraCtx?.backendUrl && jiraCtx?.beToken);
  const store = useMemo(
    () => backendConnected ? makeBackendActionItemsStore(jiraCtx.backendUrl, jiraCtx.beToken) : makeLocalActionItemsStore(),
    [backendConnected, jiraCtx?.backendUrl, jiraCtx?.beToken]
  );

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState("");
  const [meetingFilter, setMeetingFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [priorityFilter, setPriorityFilter] = useState("All");
  const [ownerFilter, setOwnerFilter] = useState("All");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [copied, setCopied] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState(null); // { type: "ok" | "error", text }
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [triggers, setTriggers] = useState(() => Object.fromEntries(NOTIFICATION_TRIGGERS.map((t) => [t.key, true])));
  const [remindingId, setRemindingId] = useState(null);
  const [pendingFile, setPendingFile] = useState(null);
  const [uploadMeeting, setUploadMeeting] = useState("MBR");
  const [uploadMeetingCustom, setUploadMeetingCustom] = useState("");
  const emailPanelRef = useRef();
  const fileInputRef = useRef();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    store.list()
      .then((list) => { if (!cancelled) setItems(list); })
      .catch((err) => { if (!cancelled) setLoadError(err.message || "Failed to load action items."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [store]);

  async function refresh() {
    const list = await store.list();
    setItems(list);
    onChange?.();
    return list;
  }

  function submitForm(e) {
    e.preventDefault();
    if (!form.title.trim()) return;
    const action = editingId ? store.update(editingId, { ...form, title: form.title.trim() }) : store.create({ ...form, title: form.title.trim() });
    action.then(refresh).catch((err) => setUploadMsg({ type: "error", text: err.message || "Failed to save." }));
    closeForm();
    setPage(1);
  }

  function openAddForm() {
    setEditingId(null);
    setForm(emptyForm());
    setShowForm(true);
  }

  function openEditForm(item) {
    setEditingId(item.id);
    setForm({
      title: item.title, meetingType: item.meetingType, owner: item.owner, ownerEmail: item.ownerEmail || "",
      priority: item.priority || "Medium", dueDate: item.dueDate || "",
      status: item.status, notes: item.notes || "",
    });
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm());
  }

  function updateStatus(id, status) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, status } : it))); // optimistic
    store.update(id, { status }).then(refresh).catch((err) => setUploadMsg({ type: "error", text: err.message || "Failed to update." }));
  }

  function updateField(id, field, value) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, [field]: value } : it))); // optimistic
    store.update(id, { [field]: value }).then(refresh).catch((err) => setUploadMsg({ type: "error", text: err.message || "Failed to update." }));
  }

  function removeItem(id) {
    setItems((prev) => prev.filter((it) => it.id !== id)); // optimistic
    store.remove(id).then(refresh).catch((err) => setUploadMsg({ type: "error", text: err.message || "Failed to remove." }));
  }

  function remindNow(item) {
    if (!item.ownerEmail) {
      setUploadMsg({ type: "error", text: `${item.title}: no owner email set — add one via Edit first.` });
      return;
    }
    setRemindingId(item.id);
    store.remind(item.id)
      .then((res) => setUploadMsg({ type: "ok", text: `Reminder sent to ${res?.to || item.ownerEmail}.` }))
      .catch((err) => setUploadMsg({ type: "error", text: err.message || "Failed to send reminder." }))
      .finally(() => setRemindingId(null));
  }

  const owners = useMemo(() => [...new Set(items.map((it) => it.owner).filter(Boolean))], [items]);
  const meetingTypesPresent = useMemo(
    () => [...new Set([...MEETING_TYPES, ...items.map((it) => it.meetingType).filter(Boolean)])],
    [items]
  );

  const filtered = items.filter((it) => {
    const q = search.trim().toLowerCase();
    return (
      (!q || it.title.toLowerCase().includes(q) || (it.owner || "").toLowerCase().includes(q)) &&
      (meetingFilter === "All" || it.meetingType === meetingFilter) &&
      (statusFilter === "All" || it.status === statusFilter) &&
      (priorityFilter === "All" || it.priority === priorityFilter) &&
      (ownerFilter === "All" || it.owner === ownerFilter)
    );
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize);

  const totalCount     = items.length;
  const openCount      = items.filter((it) => it.status === "Open").length;
  const inProgressCount = items.filter((it) => it.status === "In Progress").length;
  const resolvedCount  = items.filter((it) => it.status === "Resolved").length;
  const overdueCount   = items.filter(isOverdue).length;

  const upcomingReminders = useMemo(() => {
    const today = todayStr();
    return items
      .filter((it) => it.status !== "Resolved" && it.dueDate && it.dueDate >= today)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .slice(0, 5);
  }, [items]);

  function toggleTrigger(key) {
    setTriggers((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function clearFilters() {
    setSearch(""); setMeetingFilter("All"); setStatusFilter("All"); setPriorityFilter("All"); setOwnerFilter("All"); setPage(1);
  }

  const summaryText = useMemo(() => {
    const open = items.filter((it) => it.status !== "Resolved");
    if (!open.length) return "No open action items. 🎉";
    const byMeeting = meetingTypesPresent.map((mt) => {
      const rows = open.filter((it) => it.meetingType === mt);
      if (!rows.length) return null;
      const lines = rows.map((it) => {
        const flag = isOverdue(it) ? " ⚠ OVERDUE" : "";
        const due = it.dueDate ? ` (due ${it.dueDate})` : "";
        const owner = it.owner ? ` — ${it.owner}` : "";
        return `  • ${it.title}${owner}${due}${flag}`;
      });
      return `${mt}:\n${lines.join("\n")}`;
    }).filter(Boolean);
    return `Open Action Items (as of ${todayStr()})\n\n${byMeeting.join("\n\n")}`;
  }, [items, meetingTypesPresent]);

  function copySummary() {
    navigator.clipboard?.writeText(summaryText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function pickFile(file) {
    if (!file) return;
    setPendingFile(file);
    setUploadMeeting("MBR");
    setUploadMeetingCustom("");
  }

  function cancelPendingUpload() {
    setPendingFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function confirmUpload() {
    const file = pendingFile;
    if (!file) return;
    const meetingType = uploadMeeting === "__custom__" ? uploadMeetingCustom.trim() || "Other" : uploadMeeting;

    setPendingFile(null);
    setUploading(true);
    setUploadMsg(null);
    try {
      const { items: imported } = await parseActionItemsFile(file);
      for (const it of imported) {
        await store.create({ ...it, meetingType });
      }
      await refresh();
      setUploadMsg({ type: "ok", text: `Imported ${imported.length} action item(s) from ${file.name} as "${meetingType}".` });
      setPage(1);
    } catch (err) {
      setUploadMsg({ type: "error", text: err.message || "Failed to import file." });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="ai-wrap">
      <div className="ai-layout">
      <div className="ai-main">
      <div className="ai-header-row">
        <div>
          <h2 className="ai-title">Action Items Tracking</h2>
          <p className="ai-subtitle">Track and follow up on action items from MBR and Leadership meetings</p>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--muted)" }}>
            {backendConnected ? "🔗 Synced with backend — shared across devices" : "💾 Saved locally in this browser only"}
          </p>
        </div>
        <div className="ai-header-actions">
          <button className="btn-sm" onClick={copySummary}>{copied ? "Copied!" : "📋 Copy Summary"}</button>
          <button className="btn-sm" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
            {uploading ? "⏳ Importing…" : "📥 Upload Excel/CSV/PDF/Word"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv,.pdf,.doc,.docx"
            style={{ display: "none" }}
            onChange={(e) => pickFile(e.target.files[0])}
          />
          <button className="jc-btn" style={{ padding: "9px 18px", fontSize: 14 }} onClick={openAddForm}>+ Add Action Item</button>
        </div>
      </div>

      {loadError && (
        <div className="import-error" style={{ marginBottom: 16 }}>
          ⚠️ Couldn't load action items from the backend: {loadError}
        </div>
      )}

      {uploadMsg && (
        <div className={uploadMsg.type === "ok" ? "import-hint" : "import-error"} style={{ marginBottom: 16 }}>
          {uploadMsg.type === "ok" ? "✅ " : "⚠️ "}{uploadMsg.text}
        </div>
      )}

      <div className="ai-kpis">
        <div className="ai-kpi">
          <div className="ai-kpi-icon ai-icon-blue">📋</div>
          <div><div className="ai-kpi-value">{totalCount}</div><div className="ai-kpi-label">Total Action Items</div></div>
        </div>
        <div className="ai-kpi">
          <div className="ai-kpi-icon ai-icon-indigo">✉️</div>
          <div><div className="ai-kpi-value">{openCount}</div><div className="ai-kpi-label">Open</div></div>
        </div>
        <div className="ai-kpi">
          <div className="ai-kpi-icon ai-icon-amber">⏳</div>
          <div><div className="ai-kpi-value">{inProgressCount}</div><div className="ai-kpi-label">In Progress</div></div>
        </div>
        <div className="ai-kpi">
          <div className="ai-kpi-icon ai-icon-green">✅</div>
          <div><div className="ai-kpi-value">{resolvedCount}</div><div className="ai-kpi-label">Resolved</div></div>
        </div>
        <div className="ai-kpi">
          <div className="ai-kpi-icon ai-icon-red">⚠️</div>
          <div><div className="ai-kpi-value" style={{ color: overdueCount ? "var(--red)" : undefined }}>{overdueCount}</div><div className="ai-kpi-label">Overdue</div></div>
        </div>
      </div>

      <div className="ai-filterbar">
        <div className="to-filter-group" style={{ flex: "2 1 220px" }}>
          <label>Search</label>
          <input placeholder="Search by title or owner" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <div className="to-filter-group">
          <label>Status</label>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
            <option>All</option>{STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="to-filter-group">
          <label>Priority</label>
          <select value={priorityFilter} onChange={(e) => { setPriorityFilter(e.target.value); setPage(1); }}>
            <option>All</option>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}
          </select>
        </div>
        <div className="to-filter-group">
          <label>Meeting</label>
          <select value={meetingFilter} onChange={(e) => { setMeetingFilter(e.target.value); setPage(1); }}>
            <option>All</option>{meetingTypesPresent.map((m) => <option key={m}>{m}</option>)}
          </select>
        </div>
        <div className="to-filter-group">
          <label>Owner</label>
          <select value={ownerFilter} onChange={(e) => { setOwnerFilter(e.target.value); setPage(1); }}>
            <option>All</option>{owners.map((o) => <option key={o}>{o}</option>)}
          </select>
        </div>
        <button className="btn-sm" onClick={clearFilters}>↺ Clear Filters</button>
        <div className="to-filter-group" style={{ marginLeft: "auto" }}>
          <label>Show</label>
          <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
            {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n} entries</option>)}
          </select>
        </div>
      </div>

      {showForm && (
        <div className="ai-backdrop" onClick={closeForm}>
          <div className="ai-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ai-modal-header">
              <h3 style={{ margin: 0 }}>{editingId ? "Edit Action Item" : "Add Action Item"}</h3>
              <button className="th-close" style={{ color: "var(--text)", background: "var(--panel2)" }} onClick={closeForm}>✕</button>
            </div>
            <form onSubmit={submitForm} className="ai-modal-body">
              <label className="jc-label">Title
                <input className="jc-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} autoFocus />
              </label>
              <div className="ai-modal-grid">
                <label className="jc-label">Meeting
                  <select className="jc-input jc-select" value={form.meetingType} onChange={(e) => setForm({ ...form, meetingType: e.target.value })}>
                    {MEETING_TYPES.map((m) => <option key={m}>{m}</option>)}
                  </select>
                </label>
                <label className="jc-label">Priority
                  <select className="jc-input jc-select" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                    {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
                  </select>
                </label>
                <label className="jc-label">Owner
                  <input className="jc-input" value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} />
                </label>
                <label className="jc-label">Owner Email
                  <input className="jc-input" type="email" placeholder="owner@company.com" value={form.ownerEmail} onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })} />
                  <span className="jc-hint">Needed for email reminders — leave blank to skip.</span>
                </label>
                <label className="jc-label">Due Date
                  <input className="jc-input" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
                </label>
                <label className="jc-label">Status
                  <select className="jc-input jc-select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    {STATUSES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </label>
              </div>
              <label className="jc-label">Notes
                <textarea className="jc-input jc-textarea" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </label>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
                <button type="button" className="btn-sm" onClick={closeForm}>Cancel</button>
                <button type="submit" className="jc-btn" style={{ padding: "9px 20px" }}>{editingId ? "Save Changes" : "Add Item"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {pendingFile && (
        <div className="ai-backdrop" onClick={cancelPendingUpload}>
          <div className="ai-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ai-modal-header">
              <h3 style={{ margin: 0 }}>Which meeting is this for?</h3>
              <button className="th-close" style={{ color: "var(--text)", background: "var(--panel2)" }} onClick={cancelPendingUpload}>✕</button>
            </div>
            <p style={{ fontSize: 13, color: "var(--muted)", marginTop: -8 }}>
              Importing <strong>{pendingFile.name}</strong> — all action items from this file will be tagged with the meeting you choose below.
            </p>
            <div className="ai-modal-body">
              <label className="jc-label">Meeting
                <select className="jc-input jc-select" value={uploadMeeting} onChange={(e) => setUploadMeeting(e.target.value)}>
                  {MEETING_TYPES.map((m) => <option key={m} value={m}>{m}</option>)}
                  <option value="__custom__">Other / Custom…</option>
                </select>
              </label>
              {uploadMeeting === "__custom__" && (
                <label className="jc-label">Custom meeting name
                  <input className="jc-input" value={uploadMeetingCustom} onChange={(e) => setUploadMeetingCustom(e.target.value)}
                    placeholder="e.g. QBR, Sprint Review" autoFocus />
                </label>
              )}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
                <button type="button" className="btn-sm" onClick={cancelPendingUpload}>Cancel</button>
                <button
                  type="button"
                  className="jc-btn"
                  style={{ padding: "9px 20px" }}
                  disabled={uploadMeeting === "__custom__" && !uploadMeetingCustom.trim()}
                  onClick={confirmUpload}
                >
                  Import
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="loading">Loading action items…</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="es-icon">✅</div>
          <h3>No action items match these filters</h3>
          <p>Try clearing filters, or add a new action item from MBR/Leadership meetings.</p>
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Action Item</th>
                  <th>Meeting</th>
                  <th>Owner</th>
                  <th>Priority</th>
                  <th>Due Date</th>
                  <th>Status</th>
                  <th>Last Updated</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((it) => {
                  const dLeft = daysUntil(it.dueDate);
                  const overdue = isOverdue(it);
                  return (
                    <tr key={it.id}>
                      <td><span className="ai-id">{displayId(it)}</span></td>
                      <td className="wrap">
                        <input
                          className="ai-inline-input ai-inline-title"
                          value={it.title}
                          onChange={(e) => updateField(it.id, "title", e.target.value)}
                        />
                      </td>
                      <td>
                        <select
                          className="ai-inline-select badge b-blue"
                          value={it.meetingType}
                          onChange={(e) => updateField(it.id, "meetingType", e.target.value)}
                        >
                          {meetingTypesPresent.map((m) => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span className="mc-avatar" style={{ width: 26, height: 26, fontSize: 11, flexShrink: 0 }}>{initials(it.owner)}</span>
                          <input
                            className="ai-inline-input"
                            placeholder="Unassigned"
                            value={it.owner}
                            onChange={(e) => updateField(it.id, "owner", e.target.value)}
                          />
                        </div>
                      </td>
                      <td>
                        <select
                          className={"ai-inline-select badge " + badgeClassForPriority(it.priority)}
                          value={it.priority || "Medium"}
                          onChange={(e) => updateField(it.id, "priority", e.target.value)}
                        >
                          {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                        </select>
                      </td>
                      <td>
                        <input
                          type="date"
                          className="ai-inline-input"
                          value={it.dueDate || ""}
                          onChange={(e) => updateField(it.id, "dueDate", e.target.value)}
                        />
                        {it.dueDate && (
                          <div style={{ fontSize: 11, color: overdue ? "var(--red)" : "var(--muted)" }}>
                            {overdue ? "Overdue" : dLeft === 0 ? "Due today" : dLeft > 0 ? `${dLeft}d left` : ""}
                          </div>
                        )}
                      </td>
                      <td>
                        <select value={it.status} onChange={(e) => updateStatus(it.id, e.target.value)} className={"ai-inline-select badge " + badgeClassForStatus(it.status)}>
                          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                      <td style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>{formatUpdated(it.updatedAt)}</td>
                      <td style={{ display: "flex", gap: 6 }}>
                        <button
                          className="btn-icon"
                          title={it.ownerEmail ? `Send reminder to ${it.ownerEmail}` : "No owner email set"}
                          disabled={remindingId === it.id}
                          onClick={() => remindNow(it)}
                        >
                          {remindingId === it.id ? "⏳" : "🔔"}
                        </button>
                        <button className="btn-icon" title="Edit" onClick={() => openEditForm(it)}>✎</button>
                        <button className="btn-icon" title="Remove" onClick={() => removeItem(it.id)}>🗑</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="ai-pagination">
            <span>Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} of {filtered.length}</span>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn-sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>← Prev</button>
              <button className="btn-sm" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>Next →</button>
            </div>
          </div>
        </>
      )}

      <div className="ai-cta-banner">
        <div className="ai-cta-icon">✉️</div>
        <div className="ai-cta-text">
          <strong>Never miss an update!</strong>
          <div style={{ color: "var(--muted)", fontSize: 13 }}>Enable email notifications to stay informed about action items, due dates, and updates.</div>
        </div>
        <button className="jc-btn" style={{ padding: "9px 18px", whiteSpace: "nowrap" }}
          onClick={() => emailPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>
          🔔 Configure Email Notifications
        </button>
      </div>
      </div>

      <aside className="ai-side">
        <div className="card" ref={emailPanelRef}>
          <div className="ai-side-header">
            <h3 style={{ margin: 0 }}>📧 Email Notifications</h3>
          </div>
          <p style={{ fontSize: 12.5, color: "var(--muted)", marginTop: -6 }}>
            {backendConnected
              ? "Reminders are sent by the backend on this schedule — set an Owner Email on each item and use the 🔔 button, or wait for the daily due/overdue check. Sending requires the backend's SMTP settings to be configured."
              : "Requires signing in / connecting to the backend — reminders can't be sent in local/offline mode."}
          </p>
          <div className="ai-toggle-row">
            <div>
              <div style={{ fontWeight: 600, fontSize: 13.5 }}>Email Notifications</div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>Enable email alerts for action items</div>
            </div>
            <label className="ai-switch">
              <input type="checkbox" checked={emailEnabled} onChange={() => setEmailEnabled((v) => !v)} />
              <span className="ai-switch-track" />
            </label>
          </div>

          <div className="ai-side-subhead">Notification Triggers</div>
          <div className="ai-trigger-list">
            {NOTIFICATION_TRIGGERS.map((t) => (
              <label key={t.key} className="ai-trigger-item">
                <input type="checkbox" checked={triggers[t.key]} disabled={!emailEnabled} onChange={() => toggleTrigger(t.key)} />
                {t.label}
              </label>
            ))}
          </div>
        </div>

        <div className="card">
          <h3 style={{ marginBottom: 12 }}>⏰ Upcoming Reminders</h3>
          {upcomingReminders.length === 0 ? (
            <p style={{ color: "var(--muted)", fontSize: 13 }}>Nothing due soon.</p>
          ) : (
            <div className="ai-reminder-list">
              {upcomingReminders.map((it) => (
                <div key={it.id} className={"ai-reminder " + (it.priority === "High" ? "ai-reminder-high" : it.priority === "Low" ? "ai-reminder-low" : "ai-reminder-med")}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{it.title}</div>
                  <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>
                    Due {it.dueDate} · <span className={"badge " + badgeClassForPriority(it.priority)}>{it.priority || "Medium"}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
      </div>
    </div>
  );
}
