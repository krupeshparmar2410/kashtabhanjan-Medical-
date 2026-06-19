const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const {
  getReminders,
  createManualReminder,
  cancelReminder,
  updateReminderStatus,
  getReminderEffectiveness
} = require('../controllers/reminderController');

const router = express.Router();

router.route('/')
  .get(protect, authorize('admin', 'pharmacist', 'staff'), getReminders)
  .post(protect, authorize('admin', 'pharmacist', 'staff'), createManualReminder);

router.put('/:id/cancel', protect, authorize('admin', 'pharmacist', 'staff'), cancelReminder);
router.put('/:id/status', protect, authorize('admin', 'pharmacist', 'staff'), updateReminderStatus);
router.get('/reports/effectiveness', protect, authorize('admin', 'pharmacist'), getReminderEffectiveness);

module.exports = router;
