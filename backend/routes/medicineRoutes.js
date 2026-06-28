const express = require('express');
const router = express.Router();
const {
  getMedicineStats,
  getMedicines,
  getMedicineById,
  createMedicine,
  updateMedicine,
  deleteMedicine,
  getMedicineActivities
} = require('../controllers/medicineController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');

// Protect all routes under /api/medicines
router.use(protect);

// Statistics route
router.get('/stats', getMedicineStats);

// Main collection routes
router.route('/')
  .get(getMedicines)
  .post(authorize('admin', 'pharmacist'), createMedicine);

// Individual resource routes
router.route('/:id')
  .get(getMedicineById)
  .put(authorize('admin', 'pharmacist'), updateMedicine)
  .delete(authorize('admin'), deleteMedicine);

// Activity logs route
router.get('/:id/activities', getMedicineActivities);

module.exports = router;
