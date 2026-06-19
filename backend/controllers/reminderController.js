const RefillReminder = require('../models/RefillReminder');
const Customer = require('../models/Customer');
const Prescription = require('../models/Prescription');
const Medicine = require('../models/Medicine');

const AuditLog = require('../models/AuditLog');
const Sale = require('../models/Sale');
const { getSetting } = require('../config/SettingsService');

const logAudit = async (userId, action, entityId, oldValues = null, newValues = null, ipAddress = '', remarks = '') => {
  const audit = new AuditLog({
    user: userId,
    action,
    entityType: 'RefillReminder',
    entityId,
    oldValues,
    newValues,
    ipAddress,
    remarks
  });
  await audit.save();
};

// @desc    Get all reminders with filters
// @route   GET /api/reminders
// @access  Private (Staff, Pharmacist, Admin)
const getReminders = async (req, res, next) => {
  try {
    const {
      customerId,
      status,
      reminderPriority,
      isManual,
      page = 1,
      limit = 10
    } = req.query;

    const query = { isArchived: false };

    if (customerId) query.customerId = customerId;
    if (status) query.status = status;
    if (reminderPriority) query.reminderPriority = reminderPriority;
    if (isManual !== undefined) query.isManual = isManual === 'true';

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    const reminders = await RefillReminder.find(query)
      .sort({ refillDueDate: 1 })
      .skip(skip)
      .limit(limitNum)
      .populate('customerId', 'name phone')
      .populate('prescriptionId', 'prescriptionNumber')
      .populate('medicineId', 'medicineName medicineCode')
      .populate('createdBy', 'name');

    const total = await RefillReminder.countDocuments(query);

    res.json({
      success: true,
      reminders,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
      total
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create manual refill reminder
// @route   POST /api/reminders
// @access  Private (Staff, Pharmacist, Admin)
const createManualReminder = async (req, res, next) => {
  try {
    const {
      customerId,
      prescriptionId,
      medicineId,
      refillDueDate,
      reminderPriority = 'Medium',
      branchId = null
    } = req.body;

    if (!customerId || !prescriptionId || !medicineId || !refillDueDate) {
      return res.status(400).json({ success: false, message: 'Missing required reminder parameters.' });
    }

    const dueDateObj = new Date(refillDueDate);
    const duplicateWindowDays = parseInt(getSetting('REFILL_DUPLICATE_PREVENTION_DAYS', 30), 10);

    // Check duplicate reminder prevention within window days
    const minDate = new Date(dueDateObj.getTime() - duplicateWindowDays * 24 * 60 * 60 * 1000);
    const maxDate = new Date(dueDateObj.getTime() + duplicateWindowDays * 24 * 60 * 60 * 1000);

    const duplicate = await RefillReminder.findOne({
      customerId,
      prescriptionId,
      medicineId,
      refillDueDate: { $gte: minDate, $lte: maxDate },
      status: { $ne: 'Cancelled' },
      isArchived: false
    });

    if (duplicate) {
      return res.status(400).json({
        success: false,
        message: `A duplicate refill reminder already exists for this customer and medicine within the duplicate prevention window.`
      });
    }

    // Generate unique reminder sequence code
    const count = await RefillReminder.countDocuments({});
    const reminderNumber = `REM-M-${String(count + 1).padStart(6, '0')}`;

    const reminder = await RefillReminder.create({
      reminderNumber,
      customerId,
      prescriptionId,
      medicineId,
      refillDueDate: dueDateObj,
      reminderPriority,
      status: 'Scheduled',
      isManual: true,
      createdBy: req.user.id
    });

    await logAudit(
      req.user.id,
      'Refill Reminder Creation',
      reminder._id,
      null,
      { reminderNumber, customerId },
      req.ip || '127.0.0.1',
      'Manual refill reminder scheduled'
    );

    res.status(201).json({ success: true, reminder, message: 'Refill reminder created successfully' });
  } catch (error) {
    next(error);
  }
};

// @desc    Manually cancel reminder
// @route   PUT /api/reminders/:id/cancel
// @access  Private (Staff, Pharmacist, Admin)
const cancelReminder = async (req, res, next) => {
  try {
    const reminder = await RefillReminder.findOne({ _id: req.params.id, isArchived: false });
    if (!reminder) {
      return res.status(404).json({ success: false, message: 'Reminder not found or archived' });
    }

    const oldStatus = reminder.status;
    reminder.status = 'Cancelled';
    await reminder.save();

    await logAudit(
      req.user.id,
      'Refill Reminder Cancellation',
      reminder._id,
      { status: oldStatus },
      { status: 'Cancelled' },
      req.ip || '127.0.0.1',
      'Refill reminder cancelled manually'
    );

    res.json({ success: true, reminder, message: 'Refill reminder cancelled successfully.' });
  } catch (error) {
    next(error);
  }
};

// @desc    Calculate refill reminder effectiveness report
// @route   GET /api/reminders/reports/effectiveness
// @access  Private (Pharmacist, Admin only)
const getReminderEffectiveness = async (req, res, next) => {
  try {
    const totalSent = await RefillReminder.countDocuments({ status: 'Sent' });
    
    // An effectiveness conversion is defined as a completed Sale billed to the customer for the same medicine 
    // within 7 days of the reminder's sent Date.
    const sentReminders = await RefillReminder.find({ status: 'Sent' });
    let convertedReminders = 0;

    for (const rem of sentReminders) {
      if (!rem.sentAt) continue;

      const dateLimit = new Date(rem.sentAt.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days window
      
      const salesQuery = {
        customerId: rem.customerId,
        createdAt: { $gte: rem.sentAt, $lte: dateLimit },
        invoiceStatus: 'Completed'
      };

      const matchingSale = await Sale.findOne(salesQuery);
      if (matchingSale) {
        convertedReminders++;
        // Optionally mark reminder status as Claimed
        rem.status = 'Claimed';
        await rem.save();
      }
    }

    const rate = totalSent > 0 ? (convertedReminders / totalSent) * 100 : 0;

    res.json({
      success: true,
      stats: {
        totalSent,
        claimedRefills: convertedReminders,
        effectivenessRate: Math.round(rate * 100) / 100
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Manually update reminder status
// @route   PUT /api/reminders/:id/status
// @access  Private (Staff, Pharmacist, Admin)
const updateReminderStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const allowedStatuses = ['Scheduled', 'Contacted', 'Completed', 'Cancelled'];
    
    if (!status || !allowedStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid reminder status' });
    }

    const reminder = await RefillReminder.findOne({ _id: req.params.id, isArchived: false });
    if (!reminder) {
      return res.status(404).json({ success: false, message: 'Reminder not found or archived' });
    }

    const oldStatus = reminder.status;
    reminder.status = status;
    if (status === 'Contacted') {
      reminder.sentAt = new Date();
    }
    await reminder.save();

    await logAudit(
      req.user.id,
      'Refill Reminder Status Update',
      reminder._id,
      { status: oldStatus },
      { status },
      req.ip || '127.0.0.1',
      `Refill reminder status manually updated to ${status}`
    );

    res.json({ success: true, reminder, message: `Reminder status updated to ${status} successfully.` });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getReminders,
  createManualReminder,
  cancelReminder,
  updateReminderStatus,
  getReminderEffectiveness
};
