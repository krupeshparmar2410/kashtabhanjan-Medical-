const express = require('express');
const router = express.Router();
const {
  createCustomer,
  getCustomers,
  searchCustomers,
  getCustomerById,
  updateCustomer,
  deleteCustomer,
  restoreCustomer,
  getCustomerLedger,
  getCustomerLoyaltyLedger,
  createCustomerPayment,
  getCustomerPayments,
  getCustomerAnalytics,
  findOrCreateCustomerByPhone
} = require('../controllers/customerController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const { checkPermission } = require('../middleware/PermissionMiddleware');

// Protect all routes
router.use(protect);

router.post('/find-or-create', findOrCreateCustomerByPhone);

router.get('/search', searchCustomers);

router.route('/')
  .get(getCustomers)
  .post(createCustomer);

router.route('/:id')
  .get(getCustomerById)
  .put(checkPermission('edit_customer'), updateCustomer)
  .delete(authorize('admin'), deleteCustomer);

router.post('/:id/restore', authorize('admin'), restoreCustomer);
router.get('/:id/ledger', getCustomerLedger);
router.get('/:id/loyalty', getCustomerLoyaltyLedger);
router.get('/:id/analytics', getCustomerAnalytics);

router.route('/:id/payments')
  .get(getCustomerPayments)
  .post(createCustomerPayment);

module.exports = router;
