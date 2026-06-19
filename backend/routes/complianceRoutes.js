const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const {
  getComplianceStats,
  getComplianceReports
} = require('../controllers/complianceController');

const router = express.Router();

router.get('/stats', protect, authorize('admin', 'pharmacist', 'staff'), getComplianceStats);
router.get('/reports', protect, authorize('admin', 'pharmacist'), getComplianceReports);

module.exports = router;
