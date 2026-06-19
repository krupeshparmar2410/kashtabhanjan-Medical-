const express = require('express');
const router = express.Router();
const {
  getBackups,
  triggerBackup,
  downloadBackup,
  restoreBackup,
  archiveBackup
} = require('../controllers/backupController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');

router.use(protect);
router.use(authorize('admin'));

router.get('/', getBackups);
router.post('/create', triggerBackup);
router.get('/download/:id', downloadBackup);
router.post('/restore', restoreBackup);
router.delete('/:id', archiveBackup);

module.exports = router;
