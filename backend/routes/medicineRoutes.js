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

// Protect all routes under /api/medicines
router.use(protect);

// Statistics route
router.get('/stats', getMedicineStats);

// Main collection routes
router.route('/')
  .get(getMedicines)
  .post(createMedicine);

// Individual resource routes
router.route('/:id')
  .get(getMedicineById)
  .put(updateMedicine)
  .delete(deleteMedicine);

// Activity logs route
router.get('/:id/activities', getMedicineActivities);

module.exports = router;
