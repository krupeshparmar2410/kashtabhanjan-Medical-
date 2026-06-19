const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const logger = require('../config/logger');

// Import all models for backup/restore dynamic support
const User = require('../models/User');
const Agency = require('../models/Agency');
const AgencyActivity = require('../models/AgencyActivity');
const AgencyLedger = require('../models/AgencyLedger');
const SupplierPayment = require('../models/SupplierPayment');
const Medicine = require('../models/Medicine');
const InventoryBatch = require('../models/InventoryBatch');
const InventorySnapshot = require('../models/InventorySnapshot');
const InventoryActivity = require('../models/InventoryActivity');
const Customer = require('../models/Customer');
const CustomerLedger = require('../models/CustomerLedger');
const LoyaltyLedger = require('../models/LoyaltyLedger');
const CustomerActivity = require('../models/CustomerActivity');
const CustomerPayment = require('../models/CustomerPayment');
const Sequence = require('../models/Sequence');
const AuditLog = require('../models/AuditLog');
const Notification = require('../models/Notification');
const MedicineRecall = require('../models/MedicineRecall');
const CashClosing = require('../models/CashClosing');
const CommunicationLog = require('../models/CommunicationLog');
const FailedTransaction = require('../models/FailedTransaction');
const Settings = require('../models/Settings');
const Sale = require('../models/Sale');
const SaleItem = require('../models/SaleItem');
const SalesReturn = require('../models/SalesReturn');
const SalesReturnItem = require('../models/SalesReturnItem');
const BackupMetadata = require('../models/BackupMetadata');
const SystemBackup = require('../models/SystemBackup');
const SystemSettingsHistory = require('../models/SystemSettingsHistory');
const { logSystemAction } = require('../config/AuditService');

const { reloadCache, getSetting } = require('../config/SettingsService');
const { getNextSequence } = require('../config/SequenceService');

const models = {
  User,
  Agency,
  AgencyActivity,
  AgencyLedger,
  SupplierPayment,
  Medicine,
  InventoryBatch,
  InventorySnapshot,
  InventoryActivity,
  Customer,
  CustomerLedger,
  LoyaltyLedger,
  CustomerActivity,
  CustomerPayment,
  Sequence,
  AuditLog,
  Notification,
  MedicineRecall,
  CashClosing,
  CommunicationLog,
  FailedTransaction,
  Settings,
  Sale,
  SaleItem,
  SalesReturn,
  SalesReturnItem
};

// Log central audit helper
const logAudit = async (userId, action, entityType, entityId, oldValues = null, newValues = null, ipAddress = '', session = null) => {
  try {
    const audit = new AuditLog({
      user: userId,
      action,
      entityType,
      entityId,
      oldValues,
      newValues,
      ipAddress
    });
    await audit.save({ session });
  } catch (err) {
    logger.error('Failed to log audit:', err);
  }
};

// @desc    Get all settings
// @route   GET /api/settings
// @access  Private
const getSettings = async (req, res, next) => {
  try {
    const settings = await Settings.find();
    res.json({ success: true, settings });
  } catch (error) {
    next(error);
  }
};

// @desc    Update settings bulk or key
// @route   PUT /api/settings
// @access  Private
const updateSettings = async (req, res, next) => {
  try {
    const updates = req.body;

    if (!Array.isArray(updates)) {
      return res.status(400).json({ success: false, message: 'Updates parameter must be an array of settings' });
    }

    // 1. Capture current snapshot before update
    const currentSettings = await Settings.find().lean();
    const snapshotObj = {};
    currentSettings.forEach(s => {
      snapshotObj[s.key] = s.value;
    });

    // 2. Find next version number
    const lastHistory = await SystemSettingsHistory.findOne().sort({ versionNumber: -1 });
    const versionNumber = lastHistory ? lastHistory.versionNumber + 1 : 1;

    // 3. Save snapshot history
    await SystemSettingsHistory.create({
      settingsSnapshot: snapshotObj,
      changedBy: req.user.id,
      changeReason: req.body.changeReason || 'Manual bulk update',
      versionNumber
    });

    // 4. Perform updates
    for (const item of updates) {
      await Settings.findOneAndUpdate(
        { key: item.key },
        { value: item.value },
        { new: true, upsert: true }
      );
    }

    await reloadCache();

    await logSystemAction(req, {
      actionType: 'System Settings Updated',
      module: 'Settings',
      entityType: 'Settings',
      entityId: req.user.id,
      oldValues: snapshotObj,
      newValues: updates.reduce((acc, curr) => { acc[curr.key] = curr.value; return acc; }, {}),
      remarks: `Settings configurations updated. History version #${versionNumber} logged.`
    });

    res.json({ success: true, message: `Settings updated successfully and version #${versionNumber} snapshot archived.` });
  } catch (error) {
    next(error);
  }
};

// @desc    Get list of backups
// @route   GET /api/settings/backups
// @access  Private
const getBackupsList = async (req, res, next) => {
  try {
    const backups = await BackupMetadata.find()
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 })
      .lean();

    // Verify if file still exists on disk
    const backupDir = path.join(__dirname, '../../backups');
    const checkedBackups = backups.map(b => {
      const exists = fs.existsSync(path.join(backupDir, b.fileName));
      return { ...b, fileExistsOnDisk: exists };
    });

    res.json({ success: true, backups: checkedBackups });
  } catch (error) {
    next(error);
  }
};

// @desc    Get details of a specific backup
// @route   GET /api/settings/backups/:id
// @access  Private
const getBackupDetails = async (req, res, next) => {
  try {
    const backup = await BackupMetadata.findById(req.params.id)
      .populate('createdBy', 'name')
      .lean();

    if (!backup) {
      return res.status(404).json({ success: false, message: 'Backup metadata not found.' });
    }

    res.json({ success: true, backup });
  } catch (error) {
    next(error);
  }
};

// @desc    Create database backup (Full or Incremental)
// @route   POST /api/settings/backups
// @access  Private
const createBackup = async (req, res, next) => {
  const LockService = require('../config/LockService');
  const lockAcquired = await LockService.acquireLock('db_backup_restore_lock', req.user.id, 300000); // 5 mins lock

  if (!lockAcquired) {
    return res.status(409).json({
      success: false,
      message: 'Another database maintenance operation (Backup or Restore) is currently running. Please try again later.'
    });
  }

  try {
    const { backupType = 'Full', notes = '' } = req.body;
    const backupId = await getNextSequence('backupNumber', 'BKP');

    let lastBackupDate = null;
    if (backupType === 'Incremental') {
      const lastBackup = await BackupMetadata.findOne({ status: 'Completed', backupType: 'Full' }).sort({ createdAt: -1 });
      if (lastBackup) {
        lastBackupDate = lastBackup.createdAt;
      } else {
        logger.info('No prior successful Full backup found. Performing Full backup instead.');
      }
    }

    const backupData = {
      backupId,
      backupDate: new Date(),
      backupVersion: '1.0.0',
      applicationVersion: '1.0.0',
      backupType: lastBackupDate ? 'Incremental' : 'Full',
      collections: {}
    };

    // Query collections (exlcuding lock collections)
    for (const [name, Model] of Object.entries(models)) {
      if (name === 'SystemLock' || name === 'BackupMetadata') continue;

      let query = {};
      if (lastBackupDate) {
        query = {
          $or: [
            { createdAt: { $gt: lastBackupDate } },
            { updatedAt: { $gt: lastBackupDate } },
            { saleDate: { $gt: lastBackupDate } },
            { timestamp: { $gt: lastBackupDate } }
          ]
        };
      }

      const docs = await Model.find(query).lean();
      backupData.collections[name] = docs || [];
    }

    const backupDir = path.join(__dirname, '../../backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `backup_${backupId}_${timestamp}.json`;
    const filePath = path.join(backupDir, fileName);

    const dataString = JSON.stringify(backupData, null, 2);
    
    // Compute SHA-256 Checksum
    const crypto = require('crypto');
    const checksum = crypto.createHash('sha256').update(dataString).digest('hex');

    fs.writeFileSync(filePath, dataString, 'utf8');
    const fileSize = fs.statSync(filePath).size;

    // Create BackupMetadata log
    const meta = await BackupMetadata.create({
      backupId,
      backupType: lastBackupDate ? 'Incremental' : 'Full',
      fileName,
      fileSize,
      checksum,
      status: 'Completed',
      createdBy: req.user.id,
      notes
    });

    await logAudit(
      req.user.id,
      'Database Backup Created',
      'BackupMetadata',
      meta._id,
      null,
      { backupId, backupType: meta.backupType, fileName, fileSize, checksum },
      req.ip
    );

    await LockService.releaseLock('db_backup_restore_lock');

    res.status(201).json({
      success: true,
      message: `Database backup ${backupId} (${meta.backupType}) created successfully.`,
      backup: meta
    });

  } catch (error) {
    await LockService.releaseLock('db_backup_restore_lock');
    next(error);
  }
};

// @desc    Restore database from backup JSON
// @route   POST /api/settings/restore
// @access  Private
const restoreDatabase = async (req, res, next) => {
  const LockService = require('../config/LockService');
  const lockAcquired = await LockService.acquireLock('db_backup_restore_lock', req.user.id, 600000); // 10 mins lock

  if (!lockAcquired) {
    return res.status(409).json({
      success: false,
      message: 'Another database maintenance operation (Backup or Restore) is currently running. Please try again later.'
    });
  }

  try {
    const { fileName } = req.body;
    if (!fileName) {
      await LockService.releaseLock('db_backup_restore_lock');
      return res.status(400).json({ success: false, message: 'Backup filename is required.' });
    }

    const meta = await BackupMetadata.findOne({ fileName });
    if (!meta) {
      await LockService.releaseLock('db_backup_restore_lock');
      return res.status(404).json({ success: false, message: 'Backup metadata not found.' });
    }

    const backupDir = path.join(__dirname, '../../backups');
    const filePath = path.join(backupDir, fileName);

    if (!fs.existsSync(filePath)) {
      await LockService.releaseLock('db_backup_restore_lock');
      return res.status(404).json({ success: false, message: 'JSON backup file not found on disk.' });
    }

    // Read and verify checksum
    const dataString = fs.readFileSync(filePath, 'utf8');
    const crypto = require('crypto');
    const computedChecksum = crypto.createHash('sha256').update(dataString).digest('hex');

    if (computedChecksum !== meta.checksum) {
      await LockService.releaseLock('db_backup_restore_lock');
      return res.status(400).json({
        success: false,
        message: 'Backup file verification failed: Checksum mismatch (possible file corruption).'
      });
    }

    const backupData = JSON.parse(dataString);
    if (!backupData || !backupData.collections) {
      await LockService.releaseLock('db_backup_restore_lock');
      return res.status(400).json({ success: false, message: 'Invalid backup file structure.' });
    }

    // Save current database state to memory for emergency rollback
    const tempBackup = {};
    for (const [name, Model] of Object.entries(models)) {
      if (name === 'SystemLock' || name === 'BackupMetadata') continue;
      tempBackup[name] = await Model.find().lean();
    }

    // Execute restore
    const isIncremental = backupData.backupType === 'Incremental';
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        for (const [name, Model] of Object.entries(models)) {
          if (name === 'SystemLock' || name === 'BackupMetadata') continue;
          
          const restoredDocs = backupData.collections[name] || [];

          if (isIncremental) {
            // Incremental: upsert
            for (const doc of restoredDocs) {
              await Model.findByIdAndUpdate(doc._id, doc, { upsert: true, session });
            }
          } else {
            // Full: clear and insert
            await Model.deleteMany({}).session(session);
            if (restoredDocs.length > 0) {
              await Model.insertMany(restoredDocs, { session });
            }
          }
        }
      });
      session.endSession();
    } catch (txError) {
      session.endSession();
      logger.error('Restore session failed. Initiating database rollback...', txError);
      
      // Perform manual rollback
      for (const [name, Model] of Object.entries(models)) {
        if (name === 'SystemLock' || name === 'BackupMetadata') continue;
        await Model.deleteMany({});
        const origDocs = tempBackup[name];
        if (origDocs && origDocs.length > 0) {
          await Model.insertMany(origDocs);
        }
      }
      
      await LockService.releaseLock('db_backup_restore_lock');
      return res.status(500).json({
        success: false,
        message: `Restore transaction failed. Database rolled back safely. Error: ${txError.message}`
      });
    }

    await reloadCache();

    await logAudit(
      req.user.id,
      'Database Restored from Backup',
      'BackupMetadata',
      meta._id,
      null,
      { backupId: meta.backupId, fileName },
      req.ip
    );

    await LockService.releaseLock('db_backup_restore_lock');

    res.json({
      success: true,
      message: `Database successfully restored from backup ${meta.backupId}.`
    });

  } catch (error) {
    await LockService.releaseLock('db_backup_restore_lock');
    next(error);
  }
};

// @desc    Delete backup metadata and file
// @route   DELETE /api/settings/backups/:id
// @access  Private
const deleteBackup = async (req, res, next) => {
  try {
    const meta = await BackupMetadata.findById(req.params.id);
    if (!meta) {
      return res.status(404).json({ success: false, message: 'Backup record not found.' });
    }

    const filePath = path.join(__dirname, '../../backups', meta.fileName);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (fileErr) {
        logger.error(`Failed to delete backup file ${meta.fileName}:`, fileErr);
      }
    }

    await BackupMetadata.deleteOne({ _id: req.params.id });

    await logAudit(
      req.user.id,
      'Database Backup Deleted',
      'BackupMetadata',
      meta._id,
      { fileName: meta.fileName },
      null,
      req.ip
    );

    res.json({ success: true, message: 'Backup file and metadata record deleted successfully.' });
  } catch (error) {
    next(error);
  }
};

// @desc    Soft-archive old transactions
// @route   POST /api/settings/archive
// @access  Private
const archiveRecords = async (req, res, next) => {
  try {
    const { cutoffDate } = req.body;
    if (!cutoffDate) {
      return res.status(400).json({ success: false, message: 'Cutoff date is required for archiving.' });
    }

    const date = new Date(cutoffDate);
    if (isNaN(date.getTime())) {
      return res.status(400).json({ success: false, message: 'Invalid cutoff date format.' });
    }

    const Sale = require('../models/Sale');
    const SalesReturn = require('../models/SalesReturn');
    const AuditLog = require('../models/AuditLog');
    const CustomerPayment = require('../models/CustomerPayment');
    const InventoryActivity = require('../models/InventoryActivity');

    const salesRes = await Sale.updateMany(
      { saleDate: { $lt: date }, isArchived: { $ne: true } },
      { isArchived: true, archivedAt: new Date(), archivedBy: req.user.id }
    );

    const returnsRes = await SalesReturn.updateMany(
      { returnDate: { $lt: date }, isArchived: { $ne: true } },
      { isArchived: true, archivedAt: new Date(), archivedBy: req.user.id }
    );

    const paymentsRes = await CustomerPayment.updateMany(
      { paymentDate: { $lt: date }, isArchived: { $ne: true } },
      { isArchived: true, archivedAt: new Date(), archivedBy: req.user.id }
    );

    const auditsRes = await AuditLog.updateMany(
      { createdAt: { $lt: date }, isArchived: { $ne: true } },
      { isArchived: true, archivedAt: new Date(), archivedBy: req.user.id }
    );

    const invActsRes = await InventoryActivity.updateMany(
      { createdAt: { $lt: date }, isArchived: { $ne: true } },
      { isArchived: true, archivedAt: new Date(), archivedBy: req.user.id }
    );

    const totalArchived = salesRes.modifiedCount + returnsRes.modifiedCount + paymentsRes.modifiedCount + auditsRes.modifiedCount + invActsRes.modifiedCount;

    if (totalArchived > 0) {
      await logAudit(
        req.user.id,
        'Database Records Soft Archived',
        'SystemMaintenance',
        req.user.id,
        null,
        { cutoffDate, totalArchived, sales: salesRes.modifiedCount, returns: returnsRes.modifiedCount },
        req.ip
      );
    }

    res.json({
      success: true,
      message: `Archiving execution complete. Soft-archived ${totalArchived} documents older than ${date.toLocaleDateString()}.`,
      stats: {
        Sale: salesRes.modifiedCount,
        SalesReturn: returnsRes.modifiedCount,
        CustomerPayment: paymentsRes.modifiedCount,
        AuditLog: auditsRes.modifiedCount,
        InventoryActivity: invActsRes.modifiedCount
      }
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Restore archived records to active
// @route   POST /api/settings/archive/restore
// @access  Private
const restoreArchivedRecords = async (req, res, next) => {
  try {
    const { collectionName, cutoffDate } = req.body;
    const date = cutoffDate ? new Date(cutoffDate) : new Date();

    const collections = {
      Sale: require('../models/Sale'),
      SalesReturn: require('../models/SalesReturn'),
      AuditLog: require('../models/AuditLog'),
      CustomerPayment: require('../models/CustomerPayment'),
      InventoryActivity: require('../models/InventoryActivity')
    };

    let restoredCount = 0;
    const targetCollections = collectionName ? [collectionName] : Object.keys(collections);

    for (const name of targetCollections) {
      const Model = collections[name];
      if (Model) {
        let query = { isArchived: true };
        if (cutoffDate) {
          if (name === 'Sale') query.saleDate = { $lt: date };
          else if (name === 'SalesReturn') query.returnDate = { $lt: date };
          else if (name === 'CustomerPayment') query.paymentDate = { $lt: date };
          else query.createdAt = { $lt: date };
        }

        const resObj = await Model.updateMany(query, {
          isArchived: false,
          archivedAt: null,
          archivedBy: null
        });
        restoredCount += resObj.modifiedCount;
      }
    }

    if (restoredCount > 0) {
      await logAudit(
        req.user.id,
        'Archived Database Records Restored',
        'SystemMaintenance',
        req.user.id,
        null,
        { collectionName, cutoffDate, restoredCount },
        req.ip
      );
    }

    res.json({
      success: true,
      message: `Successfully restored ${restoredCount} archived records back to active views.`,
      restoredCount
    });

  } catch (error) {
    next(error);
  }
};

// @desc    View stats of archived records
// @route   GET /api/settings/archive
// @access  Private
const viewArchivedRecords = async (req, res, next) => {
  try {
    const Sale = require('../models/Sale');
    const SalesReturn = require('../models/SalesReturn');
    const AuditLog = require('../models/AuditLog');
    const CustomerPayment = require('../models/CustomerPayment');
    const InventoryActivity = require('../models/InventoryActivity');

    const SaleCount = await Sale.countDocuments({ isArchived: true });
    const SalesReturnCount = await SalesReturn.countDocuments({ isArchived: true });
    const CustomerPaymentCount = await CustomerPayment.countDocuments({ isArchived: true });
    const AuditLogCount = await AuditLog.countDocuments({ isArchived: true });
    const InventoryActivityCount = await InventoryActivity.countDocuments({ isArchived: true });

    res.json({
      success: true,
      stats: {
        Sale: SaleCount,
        SalesReturn: SalesReturnCount,
        CustomerPayment: CustomerPaymentCount,
        AuditLog: AuditLogCount,
        InventoryActivity: InventoryActivityCount
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Permanently delete archived records (Super Admin only)
// @route   DELETE /api/settings/archive/purge
// @access  Private
const permanentDeleteArchivedRecords = async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Super Admin privileges required to permanently purge database archives.' });
    }

    const { collectionName } = req.body;

    const collections = {
      Sale: require('../models/Sale'),
      SalesReturn: require('../models/SalesReturn'),
      AuditLog: require('../models/AuditLog'),
      CustomerPayment: require('../models/CustomerPayment'),
      InventoryActivity: require('../models/InventoryActivity')
    };

    let purgedCount = 0;
    const targetCollections = collectionName ? [collectionName] : Object.keys(collections);

    for (const name of targetCollections) {
      const Model = collections[name];
      if (Model) {
        const resObj = await Model.deleteMany({ isArchived: true });
        purgedCount += resObj.deletedCount;
      }
    }

    if (purgedCount > 0) {
      await logAudit(
        req.user.id,
        'Archived Database Records Permanently Purged',
        'SystemMaintenance',
        req.user.id,
        null,
        { collectionName, purgedCount },
        req.ip
      );
    }

    res.json({
      success: true,
      message: `Permanently purged ${purgedCount} soft-archived documents from database storage.`,
      purgedCount
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Download server log files
// @route   GET /api/settings/logs/download
// @access  Private
const downloadLogs = async (req, res, next) => {
  try {
    const { logType = 'combined' } = req.query;
    const logFile = logType === 'error' ? 'error.log' : 'combined.log';
    const filePath = path.join(__dirname, '../logs', logFile);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: `Log file ${logFile} not found.` });
    }

    res.download(filePath);
  } catch (error) {
    next(error);
  }
};

// @desc    Manually clear logs older than X days
// @route   POST /api/settings/logs/clear
// @access  Private
const clearOldLogs = async (req, res, next) => {
  try {
    const { days = 30 } = req.body;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const FailedTransaction = require('../models/FailedTransaction');
    const AuditLog = require('../models/AuditLog');
    const CommunicationLog = require('../models/CommunicationLog');

    const auditRes = await AuditLog.deleteMany({ createdAt: { $lt: cutoff }, isArchived: { $ne: true } });
    const failedRes = await FailedTransaction.deleteMany({ timestamp: { $lt: cutoff } });
    const commsRes = await CommunicationLog.deleteMany({ sentAt: { $lt: cutoff } });

    const totalCleared = auditRes.deletedCount + failedRes.deletedCount + commsRes.deletedCount;

    await logAudit(
      req.user.id,
      'System Logs Cleared Manually',
      'SystemMaintenance',
      req.user.id,
      null,
      { days, totalCleared },
      req.ip
    );

    res.json({
      success: true,
      message: `Cleared ${totalCleared} log lines older than ${days} days.`,
      cleared: totalCleared
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get database diagnostics KPI stats
// @route   GET /api/settings/stats
// @access  Private
const getDatabaseStats = async (req, res, next) => {
  try {
    const FailedTransaction = require('../models/FailedTransaction');
    const AuditLog = require('../models/AuditLog');
    
    const collectionsCount = Object.keys(models).length;
    
    let totalRecords = 0;
    for (const Model of Object.values(models)) {
      totalRecords += await Model.countDocuments();
    }

    const Sale = require('../models/Sale');
    const SalesReturn = require('../models/SalesReturn');
    const CustomerPayment = require('../models/CustomerPayment');
    const InventoryActivity = require('../models/InventoryActivity');

    const archivedCount = 
      await Sale.countDocuments({ isArchived: true }) +
      await SalesReturn.countDocuments({ isArchived: true }) +
      await CustomerPayment.countDocuments({ isArchived: true }) +
      await AuditLog.countDocuments({ isArchived: true }) +
      await InventoryActivity.countDocuments({ isArchived: true });

    const lastBackup = await BackupMetadata.findOne({ status: 'Completed' }).sort({ createdAt: -1 });
    const lastBackupTime = lastBackup ? lastBackup.createdAt : null;

    const lastRestoreAudit = await AuditLog.findOne({ action: 'Database Restored from Backup' }).sort({ createdAt: -1 });
    const lastRestoreTime = lastRestoreAudit ? lastRestoreAudit.createdAt : null;

    const failedBackupCount = await BackupMetadata.countDocuments({ status: 'Failed' });
    const failedTransactionCount = await FailedTransaction.countDocuments();
    const totalLogs = await AuditLog.countDocuments();

    res.json({
      success: true,
      stats: {
        totalCollections: collectionsCount,
        totalRecords,
        archivedCount,
        lastBackupTime,
        lastRestoreTime,
        failedBackupCount,
        failedTransactionCount,
        totalLogs
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Rollback settings to previous snapshot
// @route   POST /api/settings/rollback
// @access  Private/Admin
const rollbackSettings = async (req, res, next) => {
  try {
    const { versionNumber } = req.body;
    if (!versionNumber) {
      return res.status(400).json({ success: false, message: 'Version number is required.' });
    }

    const history = await SystemSettingsHistory.findOne({ versionNumber });
    if (!history) {
      return res.status(404).json({ success: false, message: 'Settings snapshot version not found.' });
    }

    const snapshot = history.settingsSnapshot;
    if (!snapshot || typeof snapshot !== 'object') {
      return res.status(400).json({ success: false, message: 'Invalid snapshot data structure.' });
    }

    // Capture current state before rollback for recovery
    const currentSettings = await Settings.find().lean();
    const currentSnapshot = {};
    currentSettings.forEach(s => {
      currentSnapshot[s.key] = s.value;
    });

    const lastHistory = await SystemSettingsHistory.findOne().sort({ versionNumber: -1 });
    const nextVersion = lastHistory ? lastHistory.versionNumber + 1 : 1;

    // Save history rollback record
    await SystemSettingsHistory.create({
      settingsSnapshot: currentSnapshot,
      changedBy: req.user.id,
      changeReason: `Rollback recovery to version #${versionNumber}`,
      versionNumber: nextVersion
    });

    // Apply snapshot values
    for (const [key, value] of Object.entries(snapshot)) {
      await Settings.findOneAndUpdate(
        { key },
        { value },
        { new: true, upsert: true }
      );
    }

    await reloadCache();

    await logSystemAction(req, {
      actionType: 'System Settings Rolled Back',
      module: 'Settings',
      entityType: 'Settings',
      entityId: req.user.id,
      oldValues: currentSnapshot,
      newValues: snapshot,
      remarks: `Restored settings config to version #${versionNumber}. Rollback recovery snapshot #${nextVersion} logged.`
    });

    res.json({ success: true, message: `System settings successfully rolled back to version #${versionNumber}.` });
  } catch (error) {
    next(error);
  }
};

// @desc    Get system settings snapshots history logs
// @route   GET /api/settings/history
// @access  Private/Admin
const getSettingsHistory = async (req, res, next) => {
  try {
    const history = await SystemSettingsHistory.find()
      .populate('changedBy', 'name email')
      .sort({ versionNumber: -1 })
      .lean();
    res.json({ success: true, history });
  } catch (error) {
    next(error);
  }
};

// @desc    Manual backup encryption key rotation policy
// @route   POST /api/settings/key-rotation
// @access  Private/Admin
const rotateEncryptionKey = async (req, res, next) => {
  try {
    const { newEncryptionKey } = req.body;
    if (!newEncryptionKey || newEncryptionKey.length < 16) {
      return res.status(400).json({ success: false, message: 'New encryption key is required and must be at least 16 characters.' });
    }

    // Get current keys setting map
    let rotatedKeys = {};
    const rotatedKeysSetting = await Settings.findOne({ key: 'ROTATED_ENCRYPTION_KEYS' });
    if (rotatedKeysSetting) {
      try {
        rotatedKeys = JSON.parse(rotatedKeysSetting.value);
      } catch (err) {
        rotatedKeys = {};
      }
    }

    // Increment key version
    const currentVersionSetting = await Settings.findOne({ key: 'CURRENT_KEY_VERSION' });
    const currentVersion = currentVersionSetting ? Number(currentVersionSetting.value) : 1;
    const nextVersion = currentVersion + 1;

    // Archive current key under old version (uses current BACKUP_ENCRYPTION_KEY or existing fallback)
    const currentKey = process.env.BACKUP_ENCRYPTION_KEY || 'default_backup_encryption_key_32bytes';
    rotatedKeys[currentVersion] = currentKey;

    // Save updated settings
    await Settings.findOneAndUpdate(
      { key: 'ROTATED_ENCRYPTION_KEYS' },
      { value: JSON.stringify(rotatedKeys), description: 'Archived encryption keys mapping' },
      { upsert: true }
    );

    await Settings.findOneAndUpdate(
      { key: 'CURRENT_KEY_VERSION' },
      { value: nextVersion, description: 'Active backup encryption key version number' },
      { upsert: true }
    );

    // Dynamic key update for active server runtime
    process.env.BACKUP_ENCRYPTION_KEY = newEncryptionKey;

    await reloadCache();

    await logSystemAction(req, {
      actionType: 'Backup Encryption Key Rotated',
      module: 'Security',
      entityType: 'Settings',
      entityId: req.user.id,
      newValues: { activeVersion: nextVersion },
      remarks: `Manual key rotation triggered. Rotated from version ${currentVersion} to ${nextVersion}.`
    });

    res.json({ success: true, message: `Backup encryption key successfully rotated to version ${nextVersion}. Past key archived.` });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getSettings,
  updateSettings,
  getBackupsList,
  getBackupDetails,
  createBackup,
  restoreDatabase,
  deleteBackup,
  archiveRecords,
  restoreArchivedRecords,
  viewArchivedRecords,
  permanentDeleteArchivedRecords,
  downloadLogs,
  clearOldLogs,
  getDatabaseStats,
  rollbackSettings,
  getSettingsHistory,
  rotateEncryptionKey
};
