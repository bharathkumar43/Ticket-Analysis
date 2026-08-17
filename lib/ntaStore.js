'use strict';
// In-memory holder for the last completed Neutara Ticketing sync, persisted to
// data/latest-nta-sync.json so it survives a server restart (gitignored — this is user
// data). Same tiny save/load/clear pattern as lib/dataStore.js (kept separate, not shared,
// so Live-NTA and Uploaded-Excel stay two independently toggleable datasets).

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'latest-nta-sync.json');

let current = null; // { issues, meta }

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function save(parsed) {
  current = parsed;
  ensureDataDir();
  fs.writeFileSync(DATA_FILE, JSON.stringify(parsed), 'utf8');
  return current;
}

function load() {
  if (current) return current;
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    current = JSON.parse(raw);
  } catch (e) {
    current = null;
  }
  return current;
}

function clear() {
  current = null;
  try { fs.unlinkSync(DATA_FILE); } catch (e) { /* ignore */ }
}

module.exports = { save, load, clear };
