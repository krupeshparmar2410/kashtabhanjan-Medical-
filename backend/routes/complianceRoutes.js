const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const {
  getComplianceStats,
  getComplianceReports
} = require('../controllers/complianceController');

const { getSystemHealth } = require('../config/SystemHealthService');
const { predictStorageExhaustion } = require('../config/PredictiveMaintenanceService');
const RecoveryIncident = require('../models/RecoveryIncident');
const { resolveIncident } = require('../config/RecoveryIncidentService');
const Alert = require('../models/Alert');
const ArchivedAlert = require('../models/ArchivedAlert');
const { runAlertRetentionSweep } = require('../config/AlertRetentionService');

const router = express.Router();

// Administrative verification middleware
const adminOnly = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ success: false, message: 'Forbidden: Administrative access required.' });
  }
};

// Existing routes
router.get('/stats', protect, authorize('admin', 'pharmacist', 'staff'), getComplianceStats);
router.get('/reports', protect, authorize('admin', 'pharmacist'), getComplianceReports);

// New Diagnostic Diagnostics & Health Check routes
router.get('/health', protect, async (req, res) => {
  try {
    const health = await getSystemHealth();
    // Sanitization: Strip absolute drive paths from client responses
    if (health.services && health.services.storage) {
      if (health.services.storage.appStorage) delete health.services.storage.appStorage.path;
      if (health.services.storage.dbStorage) delete health.services.storage.dbStorage.path;
    }
    res.json({ success: true, health });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Predictive Forecasting
router.get('/forecast', protect, async (req, res) => {
  try {
    const forecast = await predictStorageExhaustion();
    res.json({ success: true, forecast });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Recovery Center Incidents List (Admin Only)
router.get('/recovery/incidents', protect, adminOnly, async (req, res) => {
  try {
    const incidents = await RecoveryIncident.find().sort({ createdAt: -1 });
    res.json({ success: true, incidents });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Resolve Recovery Incident (Admin Only)
router.post('/recovery/incidents/:id/resolve', protect, adminOnly, async (req, res) => {
  try {
    const { action, remarks } = req.body;
    const resolved = await resolveIncident(req.params.id, req.user.id, action, remarks);
    res.json({ success: true, incident: resolved });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Active Alerts query
router.get('/alerts', protect, async (req, res) => {
  try {
    const alerts = await Alert.find({ isAcknowledged: false }).sort({ createdAt: -1 });
    res.json({ success: true, alerts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Archived Alerts summary
router.get('/alerts/archived-summary', protect, async (req, res) => {
  try {
    const count = await ArchivedAlert.countDocuments();
    res.json({ success: true, archivedCount: count });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Manual Alert Retention execution (Admin Only)
router.post('/alerts/retention-sweep', protect, adminOnly, async (req, res) => {
  try {
    const result = await runAlertRetentionSweep();
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
