const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const logger = require('./logger');
const InventoryBatch = require('../models/InventoryBatch');
const Medicine = require('../models/Medicine');
const Notification = require('../models/Notification');
const Sale = require('../models/Sale');
const SaleItem = require('../models/SaleItem');
const Customer = require('../models/Customer');
const BackupMetadata = require('../models/BackupMetadata');
const SystemBackup = require('../models/SystemBackup');
const ActiveSession = require('../models/ActiveSession');
const LoginHistory = require('../models/LoginHistory');
const AuditLog = require('../models/AuditLog');
const FailedTransaction = require('../models/FailedTransaction');
const { createFullBackup, runWeeklyBackupVerification } = require('./BackupService');
const { verifyChainIntegrity, logSystemAction } = require('./AuditService');
const CommunicationLog = require('../models/CommunicationLog');
const SalesReturn = require('../models/SalesReturn');
const CustomerPayment = require('../models/CustomerPayment');
const InventoryActivity = require('../models/InventoryActivity');
const User = require('../models/User');
const Prescription = require('../models/Prescription');
const PrescriptionUsage = require('../models/PrescriptionUsage');
const RefillReminder = require('../models/RefillReminder');
const { getSetting } = require('./SettingsService');
const { collectDailyMetrics } = require('./DatabaseMetricsCollectorService');
const { runAlertRetentionSweep } = require('./AlertRetentionService');
const { runMaintenanceSuite } = require('./MaintenanceService');

const runExpirySweep = async () => {
  try {
    const today = new Date();
    const batches = await InventoryBatch.find({ isDeleted: false, status: { $ne: 'Sold Out' } });
    
    let expiredAlerts = 0;
    let nearExpiryAlerts = 0;

    // Resolve N+1 queries by fetching all referenced medicines in a single database query
    const medicineIds = [...new Set(batches.map(b => b.medicineId.toString()))];
    const medicinesList = await Medicine.find({ _id: { $in: medicineIds } }, '_id expiryAlertDays').lean();
    const medicineCache = new Map();
    for (const med of medicinesList) {
      medicineCache.set(med._id.toString(), med.expiryAlertDays !== undefined ? med.expiryAlertDays : 90);
    }

    for (const batch of batches) {
      let statusChanged = false;
      let newStatus = batch.status;
      let isSaleBlocked = batch.isSaleBlocked;

      if (batch.availableQuantity <= 0) {
        newStatus = 'Sold Out';
        isSaleBlocked = true;
        statusChanged = true;
      } else {
        const expiryDate = new Date(batch.expiryDate);
        if (expiryDate <= today) {
          newStatus = 'Expired';
          isSaleBlocked = true;
          statusChanged = true;
          expiredAlerts++;
        } else {
          const daysToExpiry = (expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
          // Look up from in-memory cache instead of database findById
          const limitDays = medicineCache.get(batch.medicineId.toString()) !== undefined 
            ? medicineCache.get(batch.medicineId.toString()) 
            : 90;
          
          if (daysToExpiry <= limitDays && batch.status !== 'Near Expiry') {
            newStatus = 'Near Expiry';
            statusChanged = true;
            nearExpiryAlerts++;
          }
        }
      }

      if (statusChanged) {
        batch.status = newStatus;
        batch.isSaleBlocked = isSaleBlocked;
        await batch.save();
      }
    }

    if (expiredAlerts > 0) {
      await Notification.create({
        title: 'Expired Medicines Detected',
        message: `${expiredAlerts} stock batches have reached their expiry date and are now blocked from sales.`,
        type: 'Expired'
      });
    }

    if (nearExpiryAlerts > 0) {
      await Notification.create({
        title: 'Near Expiry Warning',
        message: `${nearExpiryAlerts} inventory batches are nearing their expiry dates. Please review stock order priorities.`,
        type: 'Near Expiry'
      });
    }

    return true;
  } catch (err) {
    logger.error('Error in daily expiry sweep:', err);
    return false;
  }
};

const cleanupStaleReservations = async () => {
  try {
    const now = new Date();
    const timeoutThreshold = new Date(Date.now() - 15 * 60 * 1000); // 15 mins
    
    const staleDrafts = await Sale.find({
      invoiceStatus: 'Draft',
      $or: [
        { expiresAt: { $lt: now } },
        { expiresAt: null, createdAt: { $lt: timeoutThreshold } }
      ]
    });

    if (staleDrafts.length > 0) {
      logger.info(`Releasing stock for ${staleDrafts.length} stale draft billing sheets...`);
      
      const { execute: runInTransaction } = require('./TransactionManager');
      const { logSystemAction } = require('./AuditService');
      
      for (const draft of staleDrafts) {
        try {
          await runInTransaction(async (session) => {
            const items = await SaleItem.find({ saleId: draft._id }).session(session);
            const recoveredBatches = [];
            const recoveredQuantities = [];

            for (const item of items) {
              for (const itemBatch of item.batches) {
                const batch = await InventoryBatch.findById(itemBatch.inventoryBatchId).session(session);
                if (batch) {
                  // Restore quantities
                  batch.reservedQuantity = Math.max(0, (batch.reservedQuantity || 0) - itemBatch.quantity);
                  batch.availableQuantity = Math.round((batch.availableQuantity + itemBatch.quantity) * 100) / 100;
                  
                  // Reopen sold out batches
                  if (batch.status === 'Sold Out' || batch.availableQuantity > 0) {
                    const today = new Date();
                    if (new Date(batch.expiryDate) > today && !batch.isLocked) {
                      batch.status = 'Active';
                      batch.isSaleBlocked = false;
                    } else if (new Date(batch.expiryDate) <= today) {
                      batch.status = 'Expired';
                      batch.isSaleBlocked = true;
                    }
                  }
                  await batch.save({ session });

                  recoveredBatches.push(batch.batchNumber);
                  recoveredQuantities.push(`${itemBatch.quantity} units (Batch: ${batch.batchNumber})`);
                }

                // Restore Medicine master stock
                const medicine = await Medicine.findById(item.medicineId).session(session);
                if (medicine) {
                  medicine.currentStock = Math.round((medicine.currentStock + itemBatch.quantity) * 100) / 100;
                  await medicine.save({ session });
                }
              }
            }

            // Mark draft as Cancelled
            draft.invoiceStatus = 'Cancelled';
            draft.remarks = 'Invoice draft reservation expired and released automatically.';
            await draft.save({ session });

            // Create cryptographically chained audit log
            await logSystemAction(null, {
              actionType: 'Draft Stock Recovered',
              module: 'Inventory',
              entityType: 'Sale',
              entityId: draft._id,
              newValues: {
                draftId: draft._id,
                invoiceNumber: draft.invoiceNumber,
                recoveredQuantities,
                recoveredBatches,
                recoveryTimestamp: new Date()
              },
              remarks: `Expired Draft ${draft.invoiceNumber} cancelled. Stock restored.`,
              session
            });
          });
          logger.info(`Stale draft invoice ${draft.invoiceNumber} successfully cancelled and stock recovered.`);
        } catch (draftErr) {
          logger.error(`Failed to cancel and recover stock for stale draft ${draft.invoiceNumber}:`, draftErr);
        }
      }
      logger.info('Stale stock reservations release cycle completed.');
    }
    return true;
  } catch (err) {
    logger.error('Error in stock reservation cleanup:', err);
    return false;
  }
};

const checkOutstandingOverdue = async () => {
  try {
    const today = new Date();
    const debtors = await Customer.find({ outstandingBalance: { $gt: 0 }, isDeleted: false });
    
    let overdueCount = 0;
    for (const debtor of debtors) {
      const creditSales = await Sale.find({
        customerId: debtor._id,
        invoiceStatus: 'Completed',
        paymentMethod: 'Credit',
        pendingAmount: { $gt: 0 }
      }).sort({ saleDate: 1 });

      for (const sale of creditSales) {
        const creditPeriodDays = debtor.creditDays || 30;
        const dueLimitDate = new Date(sale.saleDate.getTime() + creditPeriodDays * 24 * 60 * 60 * 1000);
        
        if (dueLimitDate < today) {
          overdueCount++;
          break;
        }
      }
    }

    if (overdueCount > 0) {
      await Notification.create({
        title: 'Overdue Outstanding Receivables',
        message: `${overdueCount} registered customers have unpaid invoices exceeding their credit terms period.`,
        type: 'Outstanding'
      });
    }
    return true;
  } catch (err) {
    logger.error('Error checking outstanding overdues:', err);
    return false;
  }
};

const runRetentionPurge = async () => {
  try {
    logger.info('Starting daily retention policy sweep...');
    const adminUser = await User.findOne({ role: 'admin' });
    const systemUserId = adminUser ? adminUser._id : null;
    if (!systemUserId) {
      logger.warn('Skipping scheduler retention purge: No admin user found to associate audit logs.');
      return false;
    }

    const today = new Date();

    // 1. Purge Expired Backups
    const backupRetentionDays = getSetting('BACKUP_RETENTION_DAYS', 30);
    const backupCutoff = new Date(today.getTime() - backupRetentionDays * 24 * 60 * 60 * 1000);
    const expiredBackups = await BackupMetadata.find({ createdAt: { $lt: backupCutoff } });

    let backupsDeleted = 0;
    const backupDir = path.join(__dirname, '../../storage');

    for (const b of expiredBackups) {
      const filePath = path.join(backupDir, b.fileName);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (fileErr) {
          logger.error(`Failed to delete backup file ${b.fileName}:`, fileErr);
        }
      }
      await BackupMetadata.deleteOne({ _id: b._id });
      backupsDeleted++;
    }

    if (backupsDeleted > 0) {
      await AuditLog.create({
        user: systemUserId,
        action: 'System Backup Retention Purge',
        entityType: 'BackupMetadata',
        entityId: systemUserId,
        newValues: { backupsDeletedCount: backupsDeleted },
        ipAddress: '127.0.0.1'
      });
      logger.info(`Purged ${backupsDeleted} expired backup files.`);
    }

    // 2. Purge Expired Logs (AuditLog, FailedTransaction, CommunicationLog)
    const logRetentionDays = getSetting('LOG_RETENTION_DAYS', 90);
    const logCutoff = new Date(today.getTime() - logRetentionDays * 24 * 60 * 60 * 1000);

    const auditRes = await AuditLog.deleteMany({
      createdAt: { $lt: logCutoff },
      isArchived: { $ne: true }
    });

    const failedTxnRes = await FailedTransaction.deleteMany({
      timestamp: { $lt: logCutoff }
    });

    const commsRes = await CommunicationLog.deleteMany({
      sentAt: { $lt: logCutoff }
    });

    const totalLogsPurged = auditRes.deletedCount + failedTxnRes.deletedCount + commsRes.deletedCount;
    if (totalLogsPurged > 0) {
      await AuditLog.create({
        user: systemUserId,
        action: 'System Log Retention Purge',
        entityType: 'SystemLogs',
        entityId: systemUserId,
        newValues: {
          auditLogsPurged: auditRes.deletedCount,
          failedTransactionsPurged: failedTxnRes.deletedCount,
          communicationLogsPurged: commsRes.deletedCount
        },
        ipAddress: '127.0.0.1'
      });
      logger.info(`Purged ${totalLogsPurged} expired system log entries.`);
    }

    // 3. Purge Expired Archives
    const archiveRetentionDays = getSetting('ARCHIVE_RETENTION_DAYS', 365);
    const archiveCutoff = new Date(today.getTime() - archiveRetentionDays * 24 * 60 * 60 * 1000);

    const salesPurged = await Sale.deleteMany({ isArchived: true, archivedAt: { $lt: archiveCutoff } });
    const returnsPurged = await SalesReturn.deleteMany({ isArchived: true, archivedAt: { $lt: archiveCutoff } });
    const paymentsPurged = await CustomerPayment.deleteMany({ isArchived: true, archivedAt: { $lt: archiveCutoff } });
    const invActivitiesPurged = await InventoryActivity.deleteMany({ isArchived: true, archivedAt: { $lt: archiveCutoff } });
    const archivedAuditsPurged = await AuditLog.deleteMany({ isArchived: true, archivedAt: { $lt: archiveCutoff } });

    const totalArchivesPurged = salesPurged.deletedCount + returnsPurged.deletedCount + paymentsPurged.deletedCount + invActivitiesPurged.deletedCount + archivedAuditsPurged.deletedCount;
    if (totalArchivesPurged > 0) {
      await AuditLog.create({
        user: systemUserId,
        action: 'System Archive Retention Purge',
        entityType: 'SystemArchives',
        entityId: systemUserId,
        newValues: {
          salesPurged: salesPurged.deletedCount,
          returnsPurged: returnsPurged.deletedCount,
          paymentsPurged: paymentsPurged.deletedCount,
          inventoryActivitiesPurged: invActivitiesPurged.deletedCount,
          archivedAuditLogsPurged: archivedAuditsPurged.deletedCount
        },
        ipAddress: '127.0.0.1'
      });
      logger.info(`Purged ${totalArchivesPurged} expired soft-archived database documents.`);
    }

    logger.info('Retention policy sweep finished.');
    return true;
  } catch (err) {
    logger.error('Error in daily retention sweep:', err);
    return false;
  }
};

const runPrescriptionExpirySweep = async () => {
  try {
    const today = new Date();
    const expiredPrescriptions = await Prescription.find({
      status: { $in: ['Pending', 'Verified', 'Approved'] },
      expiryDate: { $lt: today },
      isArchived: false
    });

    if (expiredPrescriptions.length > 0) {
      const systemUser = await User.findOne({ role: 'admin' });
      const userId = systemUser ? systemUser._id : null;

      for (const pr of expiredPrescriptions) {
        pr.status = 'Expired';
        pr.statusHistory.push({
          status: 'Expired',
          remarks: 'Prescription marked expired by daily system scan.',
          updatedAt: new Date(),
          updatedBy: userId
        });
        await pr.save();

        if (userId) {
          await AuditLog.create({
            user: userId,
            action: 'Prescription Expiry',
            entityType: 'Prescription',
            entityId: pr._id,
            newValues: { status: 'Expired' },
            ipAddress: '127.0.0.1'
          });
        }
      }
      logger.info(`Prescription expiry sweep: updated ${expiredPrescriptions.length} items to Expired.`);
    }
    return true;
  } catch (err) {
    logger.error('Error in prescription expiry sweep:', err);
    return false;
  }
};

const generateRefillReminders = async () => {
  try {
    const today = new Date();
    const refillDays = parseInt(getSetting('REFILL_REMINDER_DAYS', 3), 10);
    const prevDays = parseInt(getSetting('REFILL_DUPLICATE_PREVENTION_DAYS', 30), 10);

    const prescriptions = await Prescription.find({ status: 'Approved', isArchived: false });
    const systemUser = await User.findOne({ role: 'admin' });
    const creatorId = systemUser ? systemUser._id : null;

    let reminderCount = 0;

    for (const pr of prescriptions) {
      for (const item of pr.medicines) {
        if (item.quantityRemaining <= 0) continue;

        let dosagePerDay = 1;
        if (item.dosage) {
          const match = item.dosage.match(/(\d+)/g);
          if (match) {
            dosagePerDay = match.reduce((sum, val) => sum + parseInt(val, 10), 0) || 1;
          }
        }

        const lastUsage = await PrescriptionUsage.findOne({
          prescriptionId: pr._id,
          medicineId: item.medicineId
        }).sort({ consumedAt: -1 });

        const baseDate = lastUsage ? lastUsage.consumedAt : pr.prescriptionDate;
        const daysRemaining = item.quantityRemaining / dosagePerDay;
        const refillDueDate = new Date(baseDate.getTime() + daysRemaining * 24 * 60 * 60 * 1000);

        const msDiff = refillDueDate.getTime() - today.getTime();
        const daysDiff = msDiff / (1000 * 60 * 60 * 24);

        if (daysDiff >= 0 && daysDiff <= refillDays) {
          const cutoff = new Date(today.getTime() - prevDays * 24 * 60 * 60 * 1000);
          const duplicate = await RefillReminder.findOne({
            customerId: pr.customerId,
            prescriptionId: pr._id,
            medicineId: item.medicineId,
            refillDueDate: {
              $gte: new Date(refillDueDate.getTime() - 2 * 24 * 60 * 60 * 1000),
              $lte: new Date(refillDueDate.getTime() + 2 * 24 * 60 * 60 * 1000)
            },
            createdAt: { $gt: cutoff },
            status: { $ne: 'Cancelled' }
          });

          if (!duplicate) {
            const count = await RefillReminder.countDocuments({});
            const reminderNumber = `REM-${String(count + 1).padStart(6, '0')}`;

            const reminder = await RefillReminder.create({
              reminderNumber,
              customerId: pr.customerId,
              prescriptionId: pr._id,
              medicineId: item.medicineId,
              refillDueDate,
              reminderPriority: 'Medium',
              status: 'Scheduled',
              createdBy: creatorId || pr.customerId
            });

            await reminder.save();
            reminderCount++;
          }
        }
      }
    }

    if (reminderCount > 0) {
      logger.info(`Refill reminders scan: Generated ${reminderCount} scheduled reminders.`);
    }
    return true;
  } catch (err) {
    logger.error('Error in refill reminders sweep:', err);
    return false;
  }
};

const archiveExpiredReminders = async () => {
  try {
    const today = new Date();
    const cutoff = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);
    const result = await RefillReminder.updateMany(
      {
        status: { $in: ['Sent', 'Failed', 'Cancelled', 'Claimed'] },
        createdAt: { $lt: cutoff },
        isArchived: false
      },
      {
        $set: { isArchived: true, archivedAt: new Date() }
      }
    );
    if (result.modifiedCount > 0) {
      logger.info(`Archived ${result.modifiedCount} expired refill reminders.`);
    }
    return true;
  } catch (err) {
    logger.error('Error archiving expired reminders:', err);
    return false;
  }
};

const runDailySchedulerJobs = async () => {
  try {
    logger.info('Running daily scheduled maintenance jobs (11:00 PM)...');
    
    // 1. Full Backup
    const User = require('../models/User');
    const systemAdmin = await User.findOne({ role: 'admin' });
    const adminId = systemAdmin ? systemAdmin._id : new mongoose.Types.ObjectId();
    try {
      await createFullBackup(adminId, 'Automated daily scheduled backup point', 'backups/daily');
    } catch (bkpErr) {
      logger.error('Daily automated backup failed:', bkpErr);
    }

    // 2. Storage space check
    const storageRoot = path.join(__dirname, '../../storage');
    if (fs.statfsSync) {
      try {
        const stats = fs.statfsSync(storageRoot);
        const freePercent = (stats.bavail / stats.blocks) * 100;
        if (freePercent < 10) {
          await logSystemAction(null, {
            actionType: 'Storage Space Critical Warning',
            module: 'Security',
            entityType: 'SystemBackup',
            entityId: adminId,
            remarks: `CRITICAL: Free disk space is currently at ${freePercent.toFixed(2)}% (below 10% limit).`
          });
        }
      } catch (spaceErr) {
        logger.error('Storage space diagnostic check failed:', spaceErr);
      }
    }

    // 3. Failed Login attempts cleanup
    await User.updateMany(
      { lockUntil: { $lt: new Date() } },
      { $set: { failedLoginAttempts: 0, lockUntil: null } }
    );

    // 4. Session cleanup
    const sessionCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await ActiveSession.deleteMany({ expiresAt: { $lt: sessionCutoff } });

    // 5. Collect daily database telemetry snapshot metrics
    try {
      await collectDailyMetrics();
    } catch (metricErr) {
      logger.error('Daily database metrics collection failed:', metricErr);
    }

    logger.info('Daily scheduler tasks completed successfully.');
    return true;
  } catch (err) {
    logger.error('Error running daily scheduled jobs:', err);
    return false;
  }
};

const runWeeklySchedulerJobs = async () => {
  try {
    logger.info('Running weekly scheduled maintenance jobs (Sunday 02:00 AM)...');
    
    const User = require('../models/User');
    const systemAdmin = await User.findOne({ role: 'admin' });
    const adminId = systemAdmin ? systemAdmin._id : new mongoose.Types.ObjectId();
    
    // 1. Backup verification
    try {
      await runWeeklyBackupVerification(adminId);
    } catch (verifyErr) {
      logger.error('Weekly backup verification failed:', verifyErr);
    }

    // 2. Index verification
    const modelsToSync = [User, require('../models/Medicine'), require('../models/InventoryBatch'), require('../models/Sale')];
    for (const Model of modelsToSync) {
      await Model.syncIndexes().catch(err => logger.error(`Failed index rebuild for model: ${err.message}`));
    }

    // 3. Audit log integrity validation
    try {
      const verification = await verifyChainIntegrity(adminId);
      if (!verification.success) {
        logger.error('CRITICAL: Weekly audit log integrity check failed. Chain corruption detected!', verification.message);
        await logSystemAction(null, {
          actionType: 'Audit Log Chain Integrity Validation Failure',
          module: 'Security',
          entityType: 'AuditLog',
          entityId: adminId,
          remarks: `Verification failed: ${verification.message}`
        });
      }
    } catch (auditChainErr) {
      logger.error('Weekly audit log integrity validation failed:', auditChainErr);
    }

    logger.info('Weekly scheduler tasks completed successfully.');
    return true;
  } catch (err) {
    logger.error('Error running weekly scheduled jobs:', err);
    return false;
  }
};

const runMonthlySchedulerJobs = async () => {
  try {
    logger.info('Running monthly scheduled maintenance jobs (1st of Month 03:00 AM)...');
    
    // 1. Audit archive transfer
    const cutoffDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    const result = await AuditLog.updateMany(
      { createdAt: { $lt: cutoffDate }, isArchived: false },
      { $set: { isArchived: true, archivedAt: new Date() } }
    );
    logger.info(`Soft-archived ${result.modifiedCount} logs older than 365 days.`);

    // 2. Backup retention sweeps processing
    await runRetentionPurge();

    // 3. Alert retention sweeps processing
    try {
      await runAlertRetentionSweep();
    } catch (retSweepErr) {
      logger.error('Monthly alert retention sweep failed:', retSweepErr);
    }

    logger.info('Monthly scheduler tasks completed successfully.');
    return true;
  } catch (err) {
    logger.error('Error running monthly scheduled jobs:', err);
    return false;
  }
};

const checkAndRecoverMissedBackup = async () => {
  try {
    logger.info('Running Startup Scheduler Recovery scan...');
    const latest = await SystemBackup.findOne({ status: 'Completed', isArchived: false }).sort({ createdAt: -1 });
    
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    if (!latest || latest.createdAt.getTime() < oneDayAgo) {
      logger.warn('Scheduler missed-run detected: Latest backup is missing or older than 24 hours. Scheduling auto recovery backup run in 5 minutes.');
      
      setTimeout(async () => {
        try {
          logger.info('Executing automated missed-run recovery database backup...');
          const User = require('../models/User');
          const systemAdmin = await User.findOne({ role: 'admin' });
          const adminId = systemAdmin ? systemAdmin._id : new mongoose.Types.ObjectId();
          await createFullBackup(adminId, 'Automated missed-run startup recovery backup', 'backups/daily');
          logger.info('Automated recovery backup completed successfully.');
        } catch (backupErr) {
          logger.error('Startup recovery backup execution failed:', backupErr);
        }
      }, 300000);
    }
    return true;
  } catch (err) {
    logger.error('Startup Scheduler Recovery scan failed:', err);
    return false;
  }
};

const startBackgroundJobs = () => {
  logger.info('Registering background monitoring jobs scheduler...');

  setTimeout(async () => {
    try {
      await runExpirySweep();
    } catch (e) {
      logger.error('Background expiry sweep failed:', e);
    }
    try {
      await cleanupStaleReservations();
    } catch (e) {
      logger.error('Background cleanup reservations failed:', e);
    }
    try {
      await checkOutstandingOverdue();
    } catch (e) {
      logger.error('Background check outstanding failed:', e);
    }
    try {
      await runRetentionPurge();
    } catch (e) {
      logger.error('Background retention sweep failed:', e);
    }
    try {
      await runPrescriptionExpirySweep();
    } catch (e) {
      logger.error('Background prescription expiry sweep failed:', e);
    }
    try {
      await generateRefillReminders();
    } catch (e) {
      logger.error('Background refill reminders scan failed:', e);
    }
    try {
      await archiveExpiredReminders();
    } catch (e) {
      logger.error('Background archive expired reminders failed:', e);
    }
    // Run missed backup check on boot wrapped securely
    try {
      await checkAndRecoverMissedBackup();
    } catch (e) {
      logger.error('Background startup recovery scan failed:', e);
    }
  }, 10000);

  // Expiry sweep every 12 hours
  setInterval(async () => {
    try {
      await runExpirySweep();
    } catch (e) {
      logger.error('Interval expiry sweep failed:', e);
    }
  }, 12 * 60 * 60 * 1000);

  // Reservation cleanups every 2 minutes
  setInterval(async () => {
    try {
      await cleanupStaleReservations();
    } catch (e) {
      logger.error('Interval cleanup reservations failed:', e);
    }
  }, 2 * 60 * 1000);

  // Overdue check every 6 hours
  setInterval(async () => {
    try {
      await checkOutstandingOverdue();
    } catch (e) {
      logger.error('Interval check outstanding failed:', e);
    }
  }, 6 * 60 * 60 * 1000);

  // Retention sweep every 24 hours
  setInterval(async () => {
    try {
      await runRetentionPurge();
    } catch (e) {
      logger.error('Interval retention sweep failed:', e);
    }
  }, 24 * 60 * 60 * 1000);

  // Daily offline prescription & reminder sweeps
  setInterval(async () => {
    try {
      await runPrescriptionExpirySweep();
      await generateRefillReminders();
      await archiveExpiredReminders();
    } catch (e) {
      logger.error('Interval daily compliance sweeps failed:', e);
    }
  }, 24 * 60 * 60 * 1000);

  // Dedicated cron check interval checking every 60 seconds
  setInterval(async () => {
    try {
      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      const currentDay = now.getDate();
      const currentDayOfWeek = now.getDay(); // 0 = Sunday

      // Daily at 11:00 PM (23:00)
      if (currentHour === 23 && currentMinute === 0) {
        await runDailySchedulerJobs();
      }

      // Daily Preventive Maintenance at 01:00 AM
      if (currentHour === 1 && currentMinute === 0) {
        try {
          await runMaintenanceSuite();
        } catch (maintErr) {
          logger.error('Scheduled daily preventive maintenance failed:', maintErr);
        }
      }
      
      // Weekly: Sunday at 02:00 AM
      if (currentDayOfWeek === 0 && currentHour === 2 && currentMinute === 0) {
        await runWeeklySchedulerJobs();
      }

      // Monthly: 1st of month at 03:00 AM
      if (currentDay === 1 && currentHour === 3 && currentMinute === 0) {
        await runMonthlySchedulerJobs();
      }
    } catch (e) {
      logger.error('Chronological check sweep failed:', e);
    }
  }, 60000);
};

module.exports = {
  startBackgroundJobs,
  runExpirySweep,
  cleanupStaleReservations,
  runRetentionPurge,
  runPrescriptionExpirySweep,
  generateRefillReminders,
  runDailySchedulerJobs,
  runWeeklySchedulerJobs,
  runMonthlySchedulerJobs,
  checkAndRecoverMissedBackup
};
