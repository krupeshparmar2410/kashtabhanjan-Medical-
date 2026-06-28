const mongoose = require('mongoose');
const Alert = require('../models/Alert');
const ArchivedAlert = require('../models/ArchivedAlert');
const { logSystemAction } = require('./AuditService');
const logger = require('./logger');

const runAlertRetentionSweep = async () => {
  logger.info('Starting Alert retention sweep process...');
  const today = new Date();
  
  // Cutoffs
  const archiveCutoff = new Date(today.getTime() - 180 * 24 * 60 * 60 * 1000); // 180 Days
  const deleteCutoff = new Date(today.getTime() - 365 * 24 * 60 * 60 * 1000); // 365 Days

  try {
    // 1. Archive acknowledged alerts older than 180 days (limit 1000 per sweep to prevent OOM)
    const alertsToArchive = await Alert.find({
      isAcknowledged: true,
      acknowledgedAt: { $lt: archiveCutoff }
    }).limit(1000).lean();

    let archivedCount = 0;
    if (alertsToArchive.length > 0) {
      const archivePayload = alertsToArchive.map(a => ({
        originalAlertId: a._id,
        module: a.module,
        severity: a.severity,
        message: a.message,
        acknowledgedAt: a.acknowledgedAt,
        acknowledgedBy: a.acknowledgedBy,
        remarks: a.remarks,
        alertCreatedAt: a.createdAt
      }));

      await ArchivedAlert.insertMany(archivePayload);
      const idsToClear = alertsToArchive.map(a => a._id);
      await Alert.deleteMany({ _id: { $in: idsToClear } });
      archivedCount = alertsToArchive.length;
      logger.info(`Archived ${archivedCount} acknowledged system alerts.`);
    }

    // 2. Delete archived alerts older than 365 days
    const deleteRes = await ArchivedAlert.deleteMany({
      archivedAt: { $lt: deleteCutoff }
    });
    const deletedCount = deleteRes.deletedCount;
    if (deletedCount > 0) {
      logger.info(`Purged ${deletedCount} expired archived alerts.`);
    }

    if (archivedCount > 0 || deletedCount > 0) {
      await logSystemAction(null, {
        actionType: 'Alert Retention Executed',
        module: 'System',
        entityType: 'Alert',
        entityId: new mongoose.Types.ObjectId(),
        remarks: `Alert retention completed: Archived ${archivedCount} alerts. Purged ${deletedCount} historical archives.`
      });
    }

    return { archivedCount, deletedCount };
  } catch (err) {
    logger.error('Failed to run alert retention sweep:', err);
    throw err;
  }
};

module.exports = { runAlertRetentionSweep };
