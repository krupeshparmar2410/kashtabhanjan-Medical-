const express = require('express');
const router = express.Router();
const {
  getAgencyStats,
  getAgencies,
  getAgencyById,
  createAgency,
  updateAgency,
  deleteAgency,
  getAgencyActivities,
  exportAgenciesExcel,
  exportAgenciesPdf
} = require('../controllers/agencyController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');

// Protect all routes
router.use(protect);

router.get('/stats', getAgencyStats);
router.get('/export/excel', exportAgenciesExcel);
router.get('/export/pdf', exportAgenciesPdf);

router.route('/')
  .get(getAgencies)
  .post(authorize('admin', 'pharmacist'), createAgency);

router.route('/:id')
  .get(getAgencyById)
  .put(authorize('admin', 'pharmacist'), updateAgency)
  .delete(authorize('admin'), deleteAgency);

router.get('/:id/activities', getAgencyActivities);

module.exports = router;
