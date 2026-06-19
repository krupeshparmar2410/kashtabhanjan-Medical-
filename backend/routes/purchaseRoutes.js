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

// Protect all routes
router.use(protect);

// Statistics and summaries
router.get('/stats', getPurchaseStats);
router.get('/gst-summary', getPurchaseGSTSummary);

// Returns
router.route('/returns')
  .get(getPurchaseReturns)
  .post(createPurchaseReturn);

// Supplier Payments
router.route('/payments')
  .get(getSupplierPayments)
  .post(createSupplierPayment);

// Bulk CSV/Excel Import
router.post('/import', importPurchaseExcelCSV);

// Main collection routes
router.route('/')
  .get(getPurchases)
  .post(createPurchase);

// Individual resource routes
router.route('/:id')
  .get(getPurchaseById)
  .put(updatePurchase)
  .delete(deletePurchase);

// Post / Approve purchase (Inventory updates and ledger registration)
router.post('/:id/post', postPurchase);

// Print PDF layout raw data
router.get('/:id/pdf', exportInvoicePDF);

module.exports = router;
