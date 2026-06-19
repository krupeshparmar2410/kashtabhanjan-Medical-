const express = require('express');
const router = express.Router();
const {
  getInventoryBatches,
  getFEFOStock,
  getInventoryValuation,
  takeDailySnapshot,
  getInventoryTrends,
  disposeStock,
  adjustInventory,
  toggleLock,
  getRecentActivities,
  getReportingData
} = require('../controllers/inventoryController');
const { protect } = require('../middleware/authMiddleware');

// Protect all routes
router.use(protect);

// Batches list
router.get('/batches', getInventoryBatches);

// Lock or unlock batch for sales
router.put('/batches/:id/lock', toggleLock);

// FEFO consumption lookup
router.get('/fefo/:medicineId', getFEFOStock);

// Valuation calculations
router.get('/valuation', getInventoryValuation);

// Daily snapshot logs
router.route('/snapshots')
  .get(getInventoryTrends)
  .post(takeDailySnapshot);

// Disposals & stock adjustments
router.post('/dispose', disposeStock);
router.post('/adjust', adjustInventory);

// Activities log audit timeline
router.get('/activities', getRecentActivities);

// Alerts lists, low stock, expired statistics
router.get('/reports', getReportingData);

module.exports = router;
