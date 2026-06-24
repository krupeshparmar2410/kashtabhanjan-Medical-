const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const logger = require('./logger');

const runStartupHealthChecks = async () => {
  logger.info('Executing Startup Health validation diagnostics...');

  // 1. Verify Database Connectivity
  if (mongoose.connection.readyState !== 1) {
    logger.error('Database connection state is not connected. Health checks: FAILED.');
    process.exit(1);
  }

  // 2. Verify MongoDB Replica Set Status (Transactions requirement)
  const { getStatus } = require('./TransactionManager');
  const txStatus = getStatus();
  if (!txStatus.transactionSupport) {
    logger.warn('WARNING: Database is not running in Replica Set mode. Running in standalone degraded mode without transactions.');
  } else {
    logger.info(`Database is running in Replica Set mode (${txStatus.replicaSetType}). Transactions: ENABLED.`);
  }

  // 3. Verify Required Collections and Indexes Exist
  try {
    const collections = await mongoose.connection.db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);
    
    // We expect at least users, settings, auditlogs
    const required = ['users', 'settings', 'auditlogs'];
    const missing = required.filter(r => !collectionNames.includes(r));
    if (missing.length > 0) {
      logger.warn(`Required database collections [${missing.join(', ')}] do not exist yet (will be seeded/created on boot).`);
    }

    // Verify User indexes
    const User = require('../models/User');
    const userIndexes = await User.collection.indexes();
    const emailIndexExists = userIndexes.some(idx => idx.key.email === 1);
    if (!emailIndexExists) {
      logger.warn('Required unique email index on User collection is missing. Rebuilding...');
      await User.syncIndexes();
    }
  } catch (err) {
    logger.error(`Database indexes validation failure: ${err.message}. Health checks: FAILED.`);
    process.exit(1);
  }

  // 4. Verify Admin Account Exists
  try {
    const User = require('../models/User');
    const adminCount = await User.countDocuments({ role: 'admin' });
    if (adminCount === 0) {
      logger.warn('No Admin user profile detected in database.');
    }
  } catch (err) {
    logger.error(`Failed to scan admin account: ${err.message}. Health checks: FAILED.`);
    process.exit(1);
  }

  // 5. Verify Storage Directories and Accessibility
  const storageRoot = path.join(__dirname, '../../storage');
  const dirs = [
    path.join(storageRoot, 'backups/daily'),
    path.join(storageRoot, 'backups/weekly'),
    path.join(storageRoot, 'backups/monthly'),
    path.join(storageRoot, 'recovery'),
    path.join(storageRoot, 'exports'),
    path.join(storageRoot, 'logs/archive')
  ];

  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
        logger.info(`Created required directory: ${dir}`);
      } catch (err) {
        logger.warn(`WARNING: Failed to create directory ${dir}: ${err.message}. Running with backup directory warnings.`);
      }
    }
    // Test write permission
    try {
      const testFile = path.join(dir, '.write_test');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
    } catch (err) {
      logger.warn(`WARNING: Directory ${dir} is not writeable: ${err.message}. Running with backup directory warnings.`);
    }
  });

  // 6. Verify Backup Encryption Key Length and Strength
  const encKey = process.env.BACKUP_ENCRYPTION_KEY;
  if (!encKey || encKey.trim() === '' || encKey === 'default_salt' || encKey === 'default_backup_encryption_key_32bytes') {
    logger.error('CRITICAL STARTUP ERROR: BACKUP_ENCRYPTION_KEY environment variable is undefined or set to insecure fallback.');
    process.exit(1);
  }
  if (encKey.length < 32) {
    logger.error('CRITICAL STARTUP ERROR: BACKUP_ENCRYPTION_KEY length is critically short (must be at least 32 characters long).');
    process.exit(1);
  }

  // 7. Verify Sufficient Disk Space (at least 10% free)
  try {
    if (fs.statfsSync) {
      const stats = fs.statfsSync(storageRoot);
      const freePercent = (stats.bavail / stats.blocks) * 100;
      if (freePercent < 10) {
        logger.warn(`Storage space is low: only ${freePercent.toFixed(2)}% free.`);
      }
    }
  } catch (err) {
    logger.warn(`Could not verify disk space: ${err.message}`);
  }

  // 8. Verify System Settings Initialization
  try {
    const Settings = require('../models/Settings');
    const settingsCount = await Settings.countDocuments();
    if (settingsCount === 0) {
      logger.warn('Settings collection is empty. Initialization service required.');
    }
  } catch (err) {
    logger.error(`System Settings check failed: ${err.message}. Health checks: FAILED.`);
    process.exit(1);
  }

  // 9. Verify Audit Chain Genesis Block and Integrity
  try {
    const AuditLog = require('../models/AuditLog');
    const logCount = await AuditLog.countDocuments();
    if (logCount === 0) {
      logger.info('Audit log table is empty. Chain initialization will occur on first system action.');
    } else {
      // Validate last 100 audit records
      const logs = await AuditLog.find().sort({ createdAt: -1 }).limit(100).lean();
      const crypto = require('crypto');
      for (let i = 0; i < logs.length - 1; i++) {
        const current = logs[i];
        const prev = logs[i + 1];
        
        // Calculate hash of current and verify chain
        const entityIdStr = current.entityId ? current.entityId.toString() : '';
        const performedByStr = current.performedBy ? current.performedBy.toString() : '';
        const newValuesStr = current.newValues ? JSON.stringify(current.newValues) : '';
        
        const dataToHash = 
          current.previousHash + 
          current.actionType + 
          current.module + 
          entityIdStr + 
          newValuesStr + 
          performedByStr;
        const calculatedHash = crypto.createHash('sha256').update(dataToHash).digest('hex');

        if (current.hash !== calculatedHash) {
          logger.error(`AUDIT CHAIN INTEGRITY CORRUPTION: Log block ID ${current._id} hash does not match calculated values.`);
          process.exit(1);
        }
        if (current.previousHash !== prev.hash) {
          logger.error(`AUDIT CHAIN CORRUPTION: Link broken between Block ${current._id} and Block ${prev._id}.`);
          process.exit(1);
        }
      }
    }
  } catch (err) {
    logger.error(`Audit logs chain validation failure: ${err.message}. Health checks: FAILED.`);
    process.exit(1);
  }

  logger.info('Startup Health validation diagnostics: COMPLETED.');
};

module.exports = { runStartupHealthChecks };
