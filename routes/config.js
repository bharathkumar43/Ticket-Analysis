'use strict';
const express = require('express');
const router = express.Router();
const configStore = require('../lib/configStore');

// GET /api/config -> current Neutara Ticketing settings, with the API key masked (never
// sent in full, and never logged anywhere in this app).
router.get('/', (req, res) => {
  const cfg = configStore.readConfig();
  res.json({
    nta: {
      baseUrl: cfg.nta.baseUrl || '',
      apiKeyMasked: configStore.maskToken(cfg.nta.apiKey),
      configured: configStore.isNtaConfigured(),
    },
  });
});

// POST /api/config { nta: { baseUrl, apiKey? } } -> saves credentials. apiKey is optional
// on update — omit it (or send empty string) to keep the previously stored key unchanged.
router.post('/', (req, res) => {
  const { nta } = req.body || {};
  if (!nta || !nta.baseUrl) return res.status(400).json({ error: 'nta.baseUrl is required.' });
  const update = { nta: { baseUrl: nta.baseUrl.replace(/\/+$/, '') } };
  if (nta.apiKey) update.nta.apiKey = nta.apiKey;

  const saved = configStore.writeConfig(update);
  res.json({
    ok: true,
    nta: {
      baseUrl: saved.nta.baseUrl || '',
      apiKeyMasked: configStore.maskToken(saved.nta.apiKey),
      configured: configStore.isNtaConfigured(),
    },
  });
});

module.exports = router;
