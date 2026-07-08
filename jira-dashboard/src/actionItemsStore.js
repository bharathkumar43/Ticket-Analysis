const KEY = "actionItems.v1";
const SEQ_KEY = "actionItems.seq";

export function loadActionItems() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveActionItems(items) {
  localStorage.setItem(KEY, JSON.stringify(items));
}

// Returns a fresh sequential number (1001, 1002, ...) for a new action item's
// display ID, e.g. "AI-1001". Persisted separately so numbers stay unique and
// stable even after items are removed.
export function nextActionItemSeq() {
  const current = parseInt(localStorage.getItem(SEQ_KEY) || "1000", 10);
  const next = current + 1;
  localStorage.setItem(SEQ_KEY, String(next));
  return next;
}

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// localStorage-backed store with the same shape as the backend store
// (see actionItemsApi.js), so ActionItems.jsx can use either interchangeably.
export function makeLocalActionItemsStore() {
  return {
    kind: "local",
    async list() {
      const loaded = loadActionItems();
      let changed = false;
      const withSeq = loaded.map((it) => {
        if (it.seq) return it;
        changed = true;
        return { ...it, seq: nextActionItemSeq() };
      });
      if (changed) saveActionItems(withSeq);
      return withSeq;
    },
    async create(fields) {
      const item = {
        id: uid(), seq: nextActionItemSeq(),
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        ...fields,
      };
      saveActionItems([item, ...loadActionItems()]);
      return item;
    },
    async update(id, fields) {
      const all = loadActionItems();
      const next = all.map((it) => (it.id === id ? { ...it, ...fields, updatedAt: new Date().toISOString() } : it));
      saveActionItems(next);
      return next.find((it) => it.id === id);
    },
    async remove(id) {
      saveActionItems(loadActionItems().filter((it) => it.id !== id));
    },
    async remind() {
      throw new Error("Email reminders require a backend connection (Connect to Jira / sign in) — not available in local/offline mode.");
    },
  };
}
