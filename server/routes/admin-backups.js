const express = require('express');
const {
  authMiddleware,
  requireExactRole,
  requirePermission,
} = require('../middleware/auth');
const { createBackupService } = require('../services/backups');
const { writeAuditLog } = require('../services/audit-log');

const backups = createBackupService();
const router = express.Router();
router.use(
  authMiddleware,
  requireExactRole('developer'),
  requirePermission('backups.manage'),
);
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
const failure = (res, error) =>
  res
    .status(error.status || 503)
    .json({
      error: error.status ? error.message : 'Backup service unavailable',
    });

router.get('/', async (req, res) => {
  try {
    res.json(await backups.status());
  } catch (error) {
    failure(res, error);
  }
});
router.patch('/schedule', async (req, res) => {
  try {
    res.json(await backups.configure(req.body, req));
  } catch (error) {
    failure(res, error);
  }
});
router.post('/run', async (req, res) => {
  if (Object.keys(req.body || {}).length)
    return res.status(400).json({ error: 'No backup parameters are accepted' });
  try {
    res.status(201).json(await backups.run(req));
  } catch (error) {
    failure(res, error);
  }
});
router.get('/:id/:file', async (req, res) => {
  try {
    const filename = backups.filePath(req.params.id, req.params.file);
    // Download only files belonging to a completed backup.
    const fs = require('node:fs/promises');
    await fs.access(filename);
    await writeAuditLog({
      req,
      actor: req.user,
      action: 'backup.downloaded',
      targetType: 'backup',
      metadata: { id: req.params.id, file: req.params.file },
    });
    res.download(filename, `${req.params.id}-${req.params.file}`, (error) => {
      if (error && !res.headersSent)
        res.status(404).json({ error: 'Backup not found' });
    });
  } catch (error) {
    if (error.code === 'ENOENT')
      res.status(404).json({ error: 'Backup not found' });
    else failure(res, error);
  }
});

module.exports = { router, backups };
