const express = require('express');
const router = express.Router();
const {
  getAudits,
  runAuditChainVerification,
  exportAuditsReport
} = require('../controllers/auditController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');

router.use(protect);
router.use(authorize('admin'));

router.get('/', getAudits);
router.get('/verify', runAuditChainVerification);
router.get('/export', exportAuditsReport);

module.exports = router;
