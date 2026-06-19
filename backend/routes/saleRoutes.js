const express = require('express');
const router = express.Router();
const {
  createSale,
  getSales,
  getSaleById,
  cancelSale,
  createSalesReturn,
  getSalesReturns,
  getSubstituteMedicines,
  getSalesDashboard,
  getSalesActivity,
  getSalesReport,
  getSystemHealth,
  createMedicineRecall,
  getMedicineRecalls,
  getRecentNotifications,
  markNotificationRead,
  getInvoicePDF,
  createCashClosing,
  getCashClosings,
  getAuditLogs
} = require('../controllers/saleController');
const { protect } = require('../middleware/authMiddleware');
const { checkPermission } = require('../middleware/PermissionMiddleware');

// Public health check route
router.get('/health', getSystemHealth);

// Protect all other routes
router.use(protect);

router.get('/audit-logs', getAuditLogs);
router.get('/dashboard', getSalesDashboard);
router.get('/activities', getSalesActivity);
router.get('/reports', getSalesReport);
router.get('/substitutes/:medicineId', getSubstituteMedicines);

router.route('/notifications')
  .get(getRecentNotifications);
router.put('/notifications/:id', markNotificationRead);

router.route('/recalls')
  .get(getMedicineRecalls)
  .post(checkPermission('manage_recalls'), createMedicineRecall);

router.route('/cash-closings')
  .get(getCashClosings)
  .post(checkPermission('close_cash_counter'), createCashClosing);

router.route('/returns')
  .get(getSalesReturns)
  .post(checkPermission('process_return'), createSalesReturn);

router.route('/')
  .get(getSales)
  .post(checkPermission('create_sale'), createSale);

router.route('/:id')
  .get(getSaleById);

router.post('/:id/cancel', checkPermission('cancel_sale'), cancelSale);
router.get('/:id/pdf', getInvoicePDF);

module.exports = router;
