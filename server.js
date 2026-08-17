'use strict';
const express = require('express');
const path = require('path');

const ntaRoutes = require('./routes/nta');
const dataRoutes = require('./routes/data');
const configRoutes = require('./routes/config');
const ntaSync = require('./lib/ntaSync');
const configStore = require('./lib/configStore');

const app = express();
const PORT = process.env.PORT || 3000;

// A full Neutara Ticketing sync pulls the entire ~29K-ticket history (no server-side
// date/department filter is honored by the API), which takes several minutes — so it runs
// on a background schedule rather than per-request. Tune via this constant.
const NTA_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

app.use(express.json({ limit: '5mb' }));

// Shared business-logic modules (constants/rules/logic) are served as plain static JS so
// the frontend can load the exact same roster/classification/scoring code the backend and
// the Excel parser use — one source of truth, no drift between server-side and client-side
// logic.
app.use('/shared', express.static(path.join(__dirname, 'shared')));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/nta', ntaRoutes);
app.use('/api/data', dataRoutes);
app.use('/api/config', configRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use((err, req, res, next) => {
  // Never log credentials — this handler only ever sees request errors, and none of our
  // routes attach the API key to req/err objects.
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error.' });
});

app.listen(PORT, () => {
  console.log(`Ticket Hygiene Dashboard running at http://localhost:${PORT}`);
  if (configStore.isNtaConfigured()) {
    ntaSync.runSync().catch((e) => console.error('Initial NTA sync failed:', e.message));
  }
  setInterval(() => {
    if (configStore.isNtaConfigured()) {
      ntaSync.runSync().catch((e) => console.error('Scheduled NTA sync failed:', e.message));
    }
  }, NTA_SYNC_INTERVAL_MS);
});
