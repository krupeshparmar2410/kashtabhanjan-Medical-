const express = require('express');
const router = express.Router();
const {
  createPurchase,
  getPurchases,
  getPurchaseById,
  updatePurchase,
  deletePurchase,
  postPurchase,
  createPurchaseReturn,
  getPurchaseReturns,
  createSupplierPayment,
  getSupplierPayments,
  getPurchaseStats,
  getPurchaseGSTSummary,
  exportInvoicePDF,
  importPurchaseExcelCSV
} = require('../controllers/purchaseController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');

// Protect all routes
router.use(protect);

// Statistics and summaries
router.get('/stats', getPurchaseStats);
router.get('/gst-summary', getPurchaseGSTSummary);

// Returns
router.route('/returns')
  .get(getPurchaseReturns)
  .post(authorize('admin', 'pharmacist'), createPurchaseReturn);

// Supplier Payments
router.route('/payments')
  .get(getSupplierPayments)
  .post(authorize('admin', 'pharmacist'), createSupplierPayment);

// Bulk CSV/Excel Import
router.post('/import', authorize('admin', 'pharmacist'), importPurchaseExcelCSV);

// Main collection routes
router.route('/')
  .get(getPurchases)
  .post(authorize('admin', 'pharmacist'), createPurchase);

// Individual resource routes
router.route('/:id')
  .get(getPurchaseById)
  .put(authorize('admin', 'pharmacist'), updatePurchase)
  .delete(authorize('admin'), deletePurchase);

// Post / Approve purchase (Inventory updates and ledger registration)
router.post('/:id/post', authorize('admin', 'pharmacist'), postPurchase);

// Print PDF layout raw data
router.get('/:id/pdf', exportInvoicePDF);

module.exports = router;
