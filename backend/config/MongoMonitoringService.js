const mongoose = require('mongoose');
const logger = require('./logger');

const getMongoStats = async () => {
  if (mongoose.connection.readyState !== 1) {
    return { status: 'Critical', connection: 'Disconnected' };
  }

  try {
    const db = mongoose.connection.db;
    const stats = await db.command({ dbStats: 1 });
    
    let replStatus = 'Standalone';
    try {
      const status = await db.admin().command({ replSetGetStatus: 1 });
      replStatus = status.set ? `ReplSet: ${status.set}` : 'Standalone';
    } catch (e) {
      // Expected to fail on standalone installations
    }

    return {
      status: 'Healthy',
      connection: 'Connected',
      replicaSet: replStatus,
      collectionsCount: stats.collections,
      objectsCount: stats.objects,
      dataSizeMB: Math.round((stats.dataSize / (1024 * 1024)) * 100) / 100,
      storageSizeMB: Math.round((stats.storageSize / (1024 * 1024)) * 100) / 100,
      indexesCount: stats.indexes
    };
  } catch (err) {
    logger.error('Failed to retrieve Mongo stats:', err);
    return { status: 'Critical', connection: 'Connected', error: err.message };
  }
};

module.exports = { getMongoStats };
