const express = require('express');
const router = express.Router();
const {
  getSettings,
  updateSettings,
  getBackupsList,
  getBackupDetails,
  createBackup,
  restoreDatabase,
  deleteBackup,
  archiveRecords,
  restoreArchivedRecords,
  viewArchivedRecords,
  permanentDeleteArchivedRecords,
  downloadLogs,
  clearOldLogs,
  getDatabaseStats,
  rollbackSettings,
  getSettingsHistory,
  rotateEncryptionKey
} = require('../controllers/settingsController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');

router.use(protect);
router.use(authorize('admin')); // Restrict all database operations and maintenance tools to Admin

// Global settings CRUD
router.route('/')
  .get(getSettings)
  .put(updateSettings);

// Settings snap history & rollback
router.get('/history', getSettingsHistory);
router.post('/rollback', rollbackSettings);
router.post('/key-rotation', rotateEncryptionKey);

// Database stats diagnostics
router.get('/stats', getDatabaseStats);

// Backups API
router.route('/backups')
  .get(getBackupsList)
  .post(createBackup);

router.route('/backups/:id')
  .get(getBackupDetails)
  .delete(deleteBackup);

router.post('/restore', restoreDatabase);

// Soft Archival API
router.route('/archive')
  .get(viewArchivedRecords)
  .post(archiveRecords);

router.post('/archive/restore', restoreArchivedRecords);
router.delete('/archive/purge', permanentDeleteArchivedRecords);

// Winston Logs download / clear API
router.get('/logs/download', downloadLogs);
router.post('/logs/clear', clearOldLogs);

module.exports = router;
