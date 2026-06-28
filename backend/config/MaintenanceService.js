const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const logger = require('./logger');
const { acquireLock, releaseLock } = require('./LockService');
const { validateSystemSafeForCompaction } = require('./CompactionSafetyService');
const { logSystemAction } = require('./AuditService');

const purgeTempFiles = () => {
  const tempDir = path.join(__dirname, '../../storage/temp');
  if (!fs.existsSync(tempDir)) return 0;

  const files = fs.readdirSync(tempDir);
  let purged = 0;
  
  const now = Date.now();
  files.forEach(file => {
    const filePath = path.join(tempDir, file);
    try {
      const stats = fs.statSync(filePath);
      if (now - stats.mtimeMs > 24 * 60 * 60 * 1000) {
        fs.unlinkSync(filePath);
        purged++;
      }
    } catch (err) {
      logger.error(`Error deleting temp file ${file}: ${err.message}`);
    }
  });
  return purged;
};

const compactDatabase = async () => {
  const db = mongoose.connection.db;
  const collections = await db.listCollections().toArray();
  
  // 1. Compaction Safety Validation
  const safety = await validateSystemSafeForCompaction();
  if (!safety.isSafe) {
    logger.warn(`Database compaction aborted: ${safety.reasons.join(', ')}`);
    return 0;
  }

  // 2. Lock check
  const locked = await acquireLock('system-compaction', 'SYSTEM_MAINTENANCE_JOB', 300000);
  if (!locked) {
    logger.warn('Database compaction deferred: Active lock session in progress.');
    return 0;
  }

  let compactedCount = 0;
  try {
    for (const col of collections) {
      if (col.name.startsWith('system.')) continue;
      try {
        logger.info(`Compacting collection ${col.name}...`);
        await db.command({ compact: col.name, force: true });
        compactedCount++;
      } catch (colErr) {
        logger.error(`Failed to compact collection ${col.name}: ${colErr.message}`);
      }
    }
    
    await logSystemAction(null, {
      actionType: 'Database Maintenance Compacted',
      module: 'Database',
      entityType: 'System',
      entityId: new mongoose.Types.ObjectId(),
      remarks: `Database compaction completed. Compacted ${compactedCount} collections.`
    });

    return compactedCount;
  } finally {
    await releaseLock('system-compaction');
  }
};

const runMaintenanceSuite = async () => {
  logger.info('Starting scheduled preventive maintenance job...');
  const purgedCount = purgeTempFiles();
  const compactedCount = await compactDatabase();
  logger.info(`Preventive maintenance completed. Purged ${purgedCount} files. Compacted ${compactedCount} collections.`);
  return { purgedCount, compactedCount };
};

module.exports = { runMaintenanceSuite, compactDatabase, purgeTempFiles };
