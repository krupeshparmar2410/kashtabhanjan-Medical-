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

// Protect all routes
router.use(protect);

router.get('/stats', getAgencyStats);
router.get('/export/excel', exportAgenciesExcel);
router.get('/export/pdf', exportAgenciesPdf);

router.route('/')
  .get(getAgencies)
  .post(createAgency);

router.route('/:id')
  .get(getAgencyById)
  .put(updateAgency)
  .delete(deleteAgency);

router.get('/:id/activities', getAgencyActivities);

module.exports = router;
