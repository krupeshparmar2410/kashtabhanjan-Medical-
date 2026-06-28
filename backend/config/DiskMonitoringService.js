const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const logger = require('./logger');

const getDriveMetrics = (checkPath) => {
  try {
    const stats = fs.statfsSync(checkPath);
    const freeBytes = stats.bavail * stats.bsize;
    const totalBytes = stats.blocks * stats.bsize;
    const freeGB = freeBytes / (1024 * 1024 * 1024);
    const freePercent = (freeBytes / totalBytes) * 100;

    return {
      freeSpaceGB: Math.round(freeGB * 100) / 100,
      freePercent: Math.round(freePercent * 100) / 100
    };
  } catch (err) {
    logger.error(`Failed to get drive metrics for path ${checkPath}: ${err.message}`);
    return null;
  }
};

const checkDiskSpace = async () => {
  const storagePath = path.join(__dirname, '../../storage');
  try {
    const appMetrics = getDriveMetrics(storagePath);
    if (!appMetrics) {
      return { status: 'Critical', error: 'Failed to access application storage path' };
    }

    // Resolve DB stats dynamically to verify size limits
    let dbMetrics = null;
    if (mongoose.connection.readyState === 1) {
      try {
        const admin = mongoose.connection.db.admin();
        const opts = await admin.command({ getCmdLineOpts: 1 });
        const dbPath = opts.parsed?.storage?.dbPath || process.env.MONGO_DATA_PATH;
        if (dbPath && fs.existsSync(dbPath)) {
          dbMetrics = getDriveMetrics(dbPath);
        }
      } catch (dbPathErr) {
        logger.warn(`Failed to resolve dynamic Mongo dbPath: ${dbPathErr.message}. Falling back to app storage path.`);
      }
    }

    let status = 'Healthy';
    const primaryFreeGB = dbMetrics ? Math.min(appMetrics.freeSpaceGB, dbMetrics.freeSpaceGB) : appMetrics.freeSpaceGB;
    
    if (primaryFreeGB < 5) {
      status = 'Critical';
    } else if (primaryFreeGB < 20) {
      status = 'Warning';
    }

    return {
      status,
      appStorage: {
        freeSpaceGB: appMetrics.freeSpaceGB,
        freePercent: appMetrics.freePercent
      },
      dbStorage: dbMetrics ? {
        freeSpaceGB: dbMetrics.freeSpaceGB,
        freePercent: dbMetrics.freePercent
      } : null,
      freeSpaceGB: primaryFreeGB
    };
  } catch (err) {
    logger.error('Failed to resolve disk space metrics:', err);
    return { status: 'Critical', error: err.message };
  }
};

module.exports = { checkDiskSpace };
