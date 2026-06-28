const mongoose = require('mongoose');
const DatabaseMetricsSnapshot = require('../models/DatabaseMetricsSnapshot');
const logger = require('./logger');

const collectDailyMetrics = async () => {
  try {
    if (mongoose.connection.readyState !== 1) {
      logger.warn('Skipping metrics collection: Database not connected.');
      return null;
    }

    // 1. Deduplicate check - only one snapshot per day
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const existing = await DatabaseMetricsSnapshot.findOne({ createdAt: { $gte: todayStart } });
    if (existing) {
      logger.info('Database metrics snapshot already exists for today. Skipping creation.');
      return existing;
    }

    const db = mongoose.connection.db;
    const stats = await db.command({ dbStats: 1 });
    
    const collections = await db.listCollections().toArray();
    let totalDocs = 0;
    
    for (const col of collections) {
      if (col.name.startsWith('system.')) continue;
      const count = await db.collection(col.name).countDocuments();
      totalDocs += count;
    }

    const snapshot = new DatabaseMetricsSnapshot({
      dataSizeMB: Math.round((stats.dataSize / (1024 * 1024)) * 100) / 100,
      storageSizeMB: Math.round((stats.storageSize / (1024 * 1024)) * 100) / 100,
      collectionsCount: stats.collections,
      indexesCount: stats.indexes,
      totalDocuments: totalDocs
    });

    await snapshot.save();
    logger.info(`Database metrics snapshot recorded: ${snapshot.dataSizeMB} MB data, ${snapshot.totalDocuments} docs.`);
    return snapshot;
  } catch (err) {
    logger.error('Failed to collect database metrics:', err);
    return null;
  }
};

module.exports = { collectDailyMetrics };
