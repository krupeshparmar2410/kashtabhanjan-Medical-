const mongoose = require('mongoose');
const CashClosing = require('../models/CashClosing');
const Sale = require('../models/Sale');
const SystemBackup = require('../models/SystemBackup');
const { getActiveTransactionsCount } = require('./TransactionManager');

const validateCashCounterClosed = async () => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  // If a cash closing for today exists and is still open, counter is open
  const openCounter = await CashClosing.findOne({
    closingDate: { $gte: todayStart, $lte: todayEnd },
    status: 'Open'
  });
  return !openCounter;
};

const validateNoActiveBillingSessions = async () => {
  const activeDraftsCount = await Sale.countDocuments({ invoiceStatus: 'Draft' });
  return activeDraftsCount === 0;
};

const validateNoPendingTransactions = async () => {
  return getActiveTransactionsCount() === 0;
};

const validateNoBackupJobs = async () => {
  const activeBackupCount = await SystemBackup.countDocuments({ status: 'InProgress' });
  return activeBackupCount === 0;
};

const validateNoRestoreJobs = async () => {
  const db = mongoose.connection.db;
  const collections = await db.listCollections().toArray();
  const hasTemp = collections.some(col => col.name.startsWith('temp_'));
  return !hasTemp;
};

const validateSystemSafeForCompaction = async () => {
  const isCounterClosed = await validateCashCounterClosed();
  const noBillingSessions = await validateNoActiveBillingSessions();
  const noTransactions = await validateNoPendingTransactions();
  const noBackups = await validateNoBackupJobs();
  const noRestores = await validateNoRestoreJobs();

  const reasons = [];
  if (!isCounterClosed) reasons.push('Today\'s cash counter session is still open');
  if (!noBillingSessions) reasons.push('Active draft billing sheets exist in system');
  if (!noTransactions) reasons.push('Active mongoose transaction sessions are running');
  if (!noBackups) reasons.push('A database backup operation is in progress');
  if (!noRestores) reasons.push('A database restoration or collection swap is in progress');

  return {
    isSafe: reasons.length === 0,
    reasons
  };
};

module.exports = {
  validateCashCounterClosed,
  validateNoActiveBillingSessions,
  validateNoPendingTransactions,
  validateNoBackupJobs,
  validateNoRestoreJobs,
  validateSystemSafeForCompaction
};
