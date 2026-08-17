'use strict';
const express = require('express');
const multer = require('multer');
const router = express.Router();
const excelParser = require('../lib/excelParser');
const dataStore = require('../lib/dataStore');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
  fileFilter: (req, file, cb) => {
    const okExt = /\.(xlsx|xlsm|xls)$/i.test(file.originalname || '');
    if (!okExt) return cb(new Error('Only .xlsx/.xlsm/.xls files are accepted.'));
    cb(null, true);
  },
});

// POST /api/data/upload (multipart form field name: "file")
router.post('/upload', (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded (expected multipart field "file").' });
    try {
      const parsed = excelParser.parseWorkbookBuffer(req.file.buffer);
      parsed.meta.fileName = req.file.originalname;
      dataStore.save(parsed);
      res.json({ ok: true, meta: parsed.meta });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
});

// GET /api/data/current -> the parsed dataset + metadata
router.get('/current', (req, res) => {
  const current = dataStore.load();
  if (!current) return res.status(404).json({ error: 'No Excel upload has been processed yet. Use Settings → Upload Excel.' });
  res.json(current);
});

module.exports = router;
