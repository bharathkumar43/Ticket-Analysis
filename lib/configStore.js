'use strict';
// Server-side storage for the Neutara Ticketing (NTA) API credentials, entered once via the
// Settings screen. Persisted to data/config.json (gitignored — never commit real
// credentials; lives alongside the synced-ticket/Excel caches so a single mounted volume,
// e.g. in Docker, covers all of this app's persistent state). The API key is never sent
// back to the browser in full; GET /api/config masks it.

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');
const NTA_DEFAULT_BASE_URL = 'https://neutaraticketing.cftools.live/api';

function readConfig() {
  let cfg;
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    cfg = JSON.parse(raw);
  } catch (e) {
    cfg = {};
  }
  cfg.nta = { baseUrl: NTA_DEFAULT_BASE_URL, apiKey: '', ...(cfg.nta || {}) };
  return cfg;
}

function writeConfig(cfg) {
  const current = readConfig();
  const next = { ...current, ...cfg };
  if (cfg.nta) next.nta = { ...current.nta, ...cfg.nta };
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

function maskToken(token) {
  if (!token) return '';
  if (token.length <= 6) return '••••••';
  return token.slice(0, 3) + '••••••••••' + token.slice(-3);
}

function isNtaConfigured() {
  const c = readConfig();
  return !!(c.nta && c.nta.baseUrl && c.nta.apiKey);
}

module.exports = { readConfig, writeConfig, maskToken, isNtaConfigured, CONFIG_PATH, NTA_DEFAULT_BASE_URL };
