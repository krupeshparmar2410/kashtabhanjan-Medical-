const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const logger = require('./logger');
const RestoreSession = require('../models/RestoreSession');

const modelsList = {
  User: require('../models/User'),
  Agency: require('../models/Agency'),
  AgencyActivity: require('../models/AgencyActivity'),
  AgencyLedger: require('../models/AgencyLedger'),
  SupplierPayment: require('../models/SupplierPayment'),
  Medicine: require('../models/Medicine'),
  InventoryBatch: require('../models/InventoryBatch'),
  InventorySnapshot: require('../models/InventorySnapshot'),
  InventoryActivity: require('../models/InventoryActivity'),
  Customer: require('../models/Customer'),
  CustomerLedger: require('../models/CustomerLedger'),
  LoyaltyLedger: require('../models/LoyaltyLedger'),
  CustomerActivity: require('../models/CustomerActivity'),
  CustomerPayment: require('../models/CustomerPayment'),
  AuditLog: require('../models/AuditLog'),
  Notification: require('../models/Notification'),
  MedicineRecall: require('../models/MedicineRecall'),
  CashClosing: require('../models/CashClosing'),
  CommunicationLog: require('../models/CommunicationLog'),
  FailedTransaction: require('../models/FailedTransaction'),
  Settings: require('../models/Settings'),
  Sale: require('../models/Sale'),
  SaleItem: require('../models/SaleItem'),
  SalesReturn: require('../models/SalesReturn'),
  SalesReturnItem: require('../models/SalesReturnItem'),
  Prescription: require('../models/Prescription'),
  PrescriptionUsage: require('../models/PrescriptionUsage'),
  RefillReminder: require('../models/RefillReminder'),
  LoginHistory: require('../models/LoginHistory'),
  SystemSettingsHistory: require('../models/SystemSettingsHistory'),
  AuditSignatures: require('../models/AuditSignatures')
};

const getStagingPrefix = async () => {
  const db = mongoose.connection.db;
  const collections = await db.listCollections().toArray();
  const names = collections.map(c => c.name);

  let hasStage = false;
  let hasTemp = false;

  for (const name of names) {
    if (name.startsWith('stage_')) hasStage = true;
    if (name.startsWith('temp_')) hasTemp = true;
  }

  if (hasStage) return 'stage_';
  if (hasTemp) return 'temp_';
  return null;
};

const verifyStagingCollections = async (prefix, dumpData) => {
  const db = mongoose.connection.db;
  const collections = await db.listCollections().toArray();
  const names = collections.map(c => c.name);

  // 1. Verify all collections in dumpData are present with prefix (except non-backed up ones)
  for (const [modelName, Model] of Object.entries(modelsList)) {
    // Skip non-backed up
    if (modelName === 'SystemBackup' || modelName === 'BackupVerificationHistory' || modelName === 'ActiveSession') continue;

    const activeName = Model.collection.name;
    const stageName = `${prefix}${activeName}`;
    
    if (dumpData.collections[modelName]) {
      const exists = names.includes(stageName);
      const expectedCount = dumpData.collections[modelName].length;

      if (!exists) {
        if (expectedCount > 0) {
          logger.error(`Staging integrity check failed: missing staging collection ${stageName} with expected documents: ${expectedCount}`);
          return false;
        }
        continue;
      }

      // Check counts
      const docCount = await db.collection(stageName).countDocuments();
      if (docCount !== expectedCount) {
        logger.error(`Staging integrity check failed: count mismatch for ${stageName}. Expected ${expectedCount}, got ${docCount}`);
        return false;
      }
    }
  }

  // 2. Verify critical collections (User has primary admin)
  const userStageName = `${prefix}users`;
  if (names.includes(userStageName)) {
    const primaryAdmin = await db.collection(userStageName).findOne({ isPrimaryAdmin: true });
    if (!primaryAdmin) {
      logger.error('Staging integrity check failed: users collection lacks primary administrator.');
      return false;
    }
  }

  return true;
};

const cleanStagingAndTempCollections = async () => {
  const db = mongoose.connection.db;
  const collections = await db.listCollections().toArray();
  for (const col of collections) {
    if (col.name.startsWith('stage_') || col.name.startsWith('temp_') || col.name.startsWith('backup_')) {
      logger.info(`Startup validation: Dropping stale staging/temp/backup collection ${col.name}...`);
      await db.dropCollection(col.name).catch(() => {});
    }
  }
};

const executeSwap = async (prefix) => {
  const db = mongoose.connection.db;
  const collections = await db.listCollections().toArray();
  const existingNames = collections.map(c => c.name);

  const swapped = [];
  try {
    for (const [modelName, Model] of Object.entries(modelsList)) {
      const activeName = Model.collection.name;
      const stageName = `${prefix}${activeName}`;
      const backupName = `backup_${activeName}`;

      if (existingNames.includes(stageName)) {
        if (existingNames.includes(activeName)) {
          await db.renameCollection(activeName, backupName);
        }
        await db.renameCollection(stageName, activeName);
        swapped.push({ activeName, backupName });
      }
    }

    // Success! Drop backup collections
    for (const item of swapped) {
      await db.dropCollection(item.backupName).catch(() => {});
    }
    return true;
  } catch (swapErr) {
    logger.error(`Error during atomic swap resume: ${swapErr.message}. Initiating rollback of swapped collections...`);
    try {
      const collectionsAfterFail = await db.listCollections().toArray();
      const currentNames = collectionsAfterFail.map(c => c.name);

      for (const item of swapped) {
        if (currentNames.includes(item.backupName)) {
          if (currentNames.includes(item.activeName)) {
            await db.dropCollection(item.activeName).catch(() => {});
          }
          await db.renameCollection(item.backupName, item.activeName);
        }
      }
    } catch (rollErr) {
      logger.error(`CRITICAL: Rollback of swapped collections failed: ${rollErr.message}`);
    }
    return false;
  }
};

const rollbackFromFileSnapshot = async (rollbackBackupPath) => {
  const { validateBackupFile } = require('./BackupService');
  const storageRoot = path.join(__dirname, '../../storage');
  const absoluteRollbackPath = path.join(storageRoot, rollbackBackupPath);

  if (!fs.existsSync(absoluteRollbackPath)) {
    throw new Error(`Rollback snapshot file not found: ${absoluteRollbackPath}`);
  }

  const rollbackDump = validateBackupFile(absoluteRollbackPath, 1, null, null);

  for (const [name, Model] of Object.entries(modelsList)) {
    await Model.deleteMany({});
    const docs = rollbackDump.collections[name] || [];
    if (docs.length > 0) {
      await Model.insertMany(docs);
    }
  }
};


let systemStatus = 'HEALTHY';
let bootFailureReason = '';

const getSystemStatus = () => systemStatus;
const getBootFailureReason = () => bootFailureReason;

const runStartupHealthChecks = async () => {
  logger.info('Executing Startup Health validation diagnostics...');

  // 1. Verify Database Connectivity (with up to 5 retries for slow boots)
  let retries = 5;
  while (mongoose.connection.readyState !== 1 && retries > 0) {
    logger.info('Waiting for database connection readiness...');
    await new Promise(r => setTimeout(r, 1000));
    retries--;
  }

  if (mongoose.connection.readyState !== 1) {
    logger.error('Database connection state is not connected. Booting in CRITICAL mode.');
    systemStatus = 'CRITICAL';
    bootFailureReason = 'Database connection failed. Verify local MongoDB service is running.';
    return;
  }

  // 2. Load/Initialize SystemState from DB
  const SystemState = require('../models/SystemState');
  let state = await SystemState.findOne({ key: 'SYSTEM_STATE' });
  if (!state) {
    state = await SystemState.create({ key: 'SYSTEM_STATE', systemMode: 'HEALTHY' });
  }

  // 3. Scan for interrupted restore job
  const prefix = await getStagingPrefix();
  const hasInterruptedRestore = (state.isInRestoreProgress && state.activeRestoreJob) || prefix;

  if (hasInterruptedRestore) {
    const recoveryStart = Date.now();
    state.recoveryAttemptsCount = (state.recoveryAttemptsCount || 0) + 1;
    state.lastRecoveryAttemptAt = new Date();
    await state.save();

    logger.warn(`Startup validation: Interrupted restore state detected. Attempt ${state.recoveryAttemptsCount}/3...`);

    if (state.recoveryAttemptsCount > 3) {
      logger.error('CRITICAL: Startup validation: Maximum recovery attempts exceeded. Safeguard triggered. Discarding staging data and booting in degraded mode.');
      
      // Safeguard: Clean staging/temp collections to prevent blocking
      await cleanStagingAndTempCollections();

      // Clear Restore Progress in state
      state.isInRestoreProgress = false;
      state.activeRestoreJob = null;
      state.systemMode = 'DEGRADED';
      state.bootFailureReason = 'Interrupted restore repeatedly failed to recover automatically.';
      await state.save();

      // Log recovery incident failure
      const { logSystemAction } = require('./AuditService');
      await logSystemAction(null, {
        actionType: 'RECOVERY_RUN',
        module: 'System',
        entityType: 'SystemState',
        entityId: state._id,
        newValues: {
          recoveryType: 'Restore Recovery',
          timestamp: new Date(),
          triggerReason: 'Maximum recovery attempts exceeded',
          actionTaken: 'Rollback (Safeguard)',
          collectionsAffected: prefix ? [prefix + '*'] : [],
          finalResult: 'Failed',
          durationMs: Date.now() - recoveryStart,
          operator: 'System'
        },
        remarks: 'Interrupted restore repeatedly failed. Staging collections purged. System started in degraded mode.'
      });

      systemStatus = 'DEGRADED';
      bootFailureReason = 'Interrupted restore repeatedly failed to recover automatically.';
    } else {
      // Perform Verification
      let verificationSucceeded = false;
      let targetJob = state.activeRestoreJob || {};
      let dumpData = null;
      const { validateBackupFile } = require('./BackupService');

      try {
        if (!prefix) {
          throw new Error('No staging collections found.');
        }
        if (!targetJob.fileName) {
          throw new Error('No restore active job metadata found.');
        }

        const storageRoot = path.join(__dirname, '../../storage');
        const absoluteTargetFilePath = path.join(storageRoot, 'backups/daily', targetJob.fileName);
        const absoluteTargetFilePath2 = path.join(storageRoot, targetJob.fileName);
        let absoluteFilePath = fs.existsSync(absoluteTargetFilePath) 
          ? absoluteTargetFilePath 
          : (fs.existsSync(absoluteTargetFilePath2) ? absoluteTargetFilePath2 : null);

        if (!absoluteFilePath) {
          const searchDirs = ['backups/daily', 'backups/weekly', 'backups/monthly', 'recovery', 'temp'];
          for (const folder of searchDirs) {
            const testPath = path.join(storageRoot, folder, targetJob.fileName);
            if (fs.existsSync(testPath)) {
              absoluteFilePath = testPath;
              break;
            }
          }
        }

        if (!absoluteFilePath) {
          throw new Error(`Target backup file ${targetJob.fileName} not found on disk.`);
        }

        // 1. Verify Restore Session ID exists in metadata
        if (!targetJob.restoreSessionId) {
          throw new Error('Restore Session ID is missing in active job metadata.');
        }

        // 2. Validate target backup file compatibility & metadata checkpoint
        dumpData = validateBackupFile(absoluteFilePath, 1, null, null);

        // 3. Verify Backup ID matches
        if (targetJob.backupId && targetJob.backupId !== dumpData.backupId) {
          throw new Error(`Backup ID mismatch: expected ${targetJob.backupId}, found ${dumpData.backupId}`);
        }

        // 4. Verify checksum matches
        const crypto = require('crypto');
        const fileBuffer = fs.readFileSync(absoluteFilePath);
        const actualChecksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');

        if (targetJob.checksum && targetJob.checksum !== actualChecksum) {
          throw new Error(`Restore manifest/checksum mismatch: expected ${targetJob.checksum}, found ${actualChecksum}`);
        }

        // 5. Verify staging collections completeness, count and integrity
        const isComplete = await verifyStagingCollections(prefix, dumpData);
        if (!isComplete) {
          throw new Error('Staging collections count or integrity verification failed.');
        }

        verificationSucceeded = true;
      } catch (err) {
        logger.error(`Startup validation: Verification of staging restore failed: ${err.message}`);
      }

      if (verificationSucceeded) {
        logger.info(`Startup validation: Verification succeeded. Resuming atomic swap...`);
        const swapOk = await executeSwap(prefix);

        if (swapOk) {
          logger.info('Startup validation: Automatic self-healing resume completed successfully.');
          
          state.isInRestoreProgress = false;
          state.activeRestoreJob = null;
          state.recoveryAttemptsCount = 0; // reset counter on success
          state.systemMode = 'HEALTHY';
          state.bootFailureReason = '';
          await state.save();

          const { logSystemAction } = require('./AuditService');
          await logSystemAction(null, {
            actionType: 'RECOVERY_RUN',
            module: 'System',
            entityType: 'SystemState',
            entityId: state._id,
            newValues: {
              recoveryType: 'Restore Recovery',
              timestamp: new Date(),
              triggerReason: 'Interrupted restore detected on boot',
              actionTaken: 'Resume',
              collectionsAffected: Object.keys(modelsList).map(m => modelsList[m].collection.name),
              finalResult: 'Success',
              durationMs: Date.now() - recoveryStart,
              operator: 'System'
            },
            remarks: `Interrupted restore for ${targetJob.fileName} resumed and atomic swap completed successfully.`
          });

          const RecoveryIncident = require('../models/RecoveryIncident');
          await RecoveryIncident.updateMany(
            { incidentType: 'InterruptedRestore', status: 'Pending' },
            { status: 'Resolved', resolutionNotes: 'Auto-resolved via successful resume on system boot', resolvedAt: new Date() }
          );

          systemStatus = 'HEALTHY';
          bootFailureReason = '';
        } else {
          verificationSucceeded = false; // Trigger rollback if swap failed
        }
      }

      if (!verificationSucceeded) {
        logger.warn('Startup validation: Initiating safe rollback and cleanup...');
        let rollbackResult = 'Failed';
        try {
          // Drop temporary/staging collections
          await cleanStagingAndTempCollections();

          // Restore from rollback backup path if exists
          if (targetJob.rollbackBackupPath) {
            logger.info(`Attempting rollback to snapshot: ${targetJob.rollbackBackupPath}`);
            await rollbackFromFileSnapshot(targetJob.rollbackBackupPath);
            logger.info('Rollback snapshot restored successfully.');
            rollbackResult = 'Success';
          } else {
            logger.warn('No rollback snapshot path available. Production database left untouched.');
            rollbackResult = 'Not Attempted (No Snapshot)';
          }

          state.isInRestoreProgress = false;
          state.activeRestoreJob = null;
          state.recoveryAttemptsCount = 0; // reset counter on rollback completion
          state.systemMode = 'DEGRADED';
          state.bootFailureReason = 'Interrupted restore was rolled back.';
          await state.save();

          const { logSystemAction } = require('./AuditService');
          await logSystemAction(null, {
            actionType: 'RECOVERY_RUN',
            module: 'System',
            entityType: 'SystemState',
            entityId: state._id,
            newValues: {
              recoveryType: 'Restore Recovery',
              timestamp: new Date(),
              triggerReason: 'Interrupted restore validation failed',
              actionTaken: 'Rollback',
              collectionsAffected: Object.keys(modelsList).map(m => modelsList[m].collection.name),
              finalResult: rollbackResult,
              durationMs: Date.now() - recoveryStart,
              operator: 'System'
            },
            remarks: `Interrupted restore failed verification. Rollback executed with result: ${rollbackResult}.`
          });

          const RecoveryIncident = require('../models/RecoveryIncident');
          await RecoveryIncident.updateMany(
            { incidentType: 'InterruptedRestore', status: 'Pending' },
            { status: 'Resolved', resolutionNotes: `Auto-resolved via rollback on system boot: ${rollbackResult}`, resolvedAt: new Date() }
          );

          systemStatus = 'DEGRADED';
          bootFailureReason = 'Interrupted restore failed validation and was rolled back.';
        } catch (rollErr) {
          logger.error(`CRITICAL: Rollback failed: ${rollErr.message}`);
          systemStatus = 'RECOVERY_ONLY';
          bootFailureReason = `Interrupted restore rollback failed: ${rollErr.message}`;
        }
      }
    }
  }

  // 4. Scan for stale staging or backup collections and clean them
  try {
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    for (const col of collections) {
      if (col.name.startsWith('stage_') || col.name.startsWith('backup_')) {
        logger.info(`Startup validation: Dropping stale staging/backup collection ${col.name}...`);
        await db.dropCollection(col.name).catch(() => {});
      }
    }
  } catch (err) {
    logger.error(`Failed to clean stale collections on boot: ${err.message}`);
  }

  // 5. Cleanup stale system backup locks & automatic recovery
  try {
    const SystemBackup = require('../models/SystemBackup');
    const { logSystemAction } = require('./AuditService');
    const { validateBackupFile, createFullBackup } = require('./BackupService');
    const storageRoot = path.join(__dirname, '../../storage');
    
    const staleBackups = await SystemBackup.find({
      status: { $in: ['Running', 'Pending'] }
    });

    if (staleBackups.length > 0) {
      logger.info(`Startup validation: Found ${staleBackups.length} stale backup jobs. Checking state...`);
      for (const b of staleBackups) {
        const recoveryStart = Date.now();
        const absoluteFilePath = path.join(storageRoot, b.filePath);
        let isValid = false;

        // 1. Check if backup archive exists on disk
        if (fs.existsSync(absoluteFilePath)) {
          try {
            // 2. Validate backup archive decrypt and checksum
            validateBackupFile(absoluteFilePath, b.keyVersion, b.encryptionTag, b.checksum);
            isValid = true;
          } catch (valErr) {
            logger.warn(`Stale backup validation failed for ${b.backupNumber}: ${valErr.message}`);
          }
        }

        if (isValid) {
          // If backup completed successfully: Update status
          b.status = 'Completed';
          b.notes = 'RecoveredOnStartup';
          await b.save();

          logger.info(`Startup validation: Stale backup ${b.backupNumber} successfully validated and marked Completed.`);

          // Audit log for successful backup recovery
          await logSystemAction(null, {
            actionType: 'RECOVERY_RUN',
            module: 'System',
            entityType: 'SystemBackup',
            entityId: b._id,
            newValues: {
              recoveryType: 'Backup Recovery',
              timestamp: new Date(),
              triggerReason: 'Stale running backup found to be valid on disk',
              actionTaken: 'Resume',
              collectionsAffected: ['SystemBackup'],
              finalResult: 'Success',
              durationMs: Date.now() - recoveryStart,
              operator: 'System'
            },
            remarks: `Stale backup ${b.backupNumber} was found valid on disk and marked Completed.`
          });
        } else {
          // If backup is incomplete: Release locks, Mark Failed, Record ServerRestartDetected
          b.status = 'Failed';
          b.notes = 'ServerRestartDetected';
          b.errorMessage = 'Backup was interrupted or incomplete due to unexpected server restart/shutdown.';
          await b.save();

          logger.warn(`Startup validation: Stale backup ${b.backupNumber} was incomplete. Status marked Failed.`);

          // Audit log for failed backup recovery
          await logSystemAction(null, {
            actionType: 'RECOVERY_RUN',
            module: 'System',
            entityType: 'SystemBackup',
            entityId: b._id,
            newValues: {
              recoveryType: 'Backup Recovery',
              timestamp: new Date(),
              triggerReason: 'Stale running backup found incomplete/invalid',
              actionTaken: 'Rollback',
              collectionsAffected: ['SystemBackup'],
              finalResult: 'Failed',
              durationMs: Date.now() - recoveryStart,
              operator: 'System'
            },
            remarks: `Stale backup ${b.backupNumber} was incomplete/invalid. Status marked Failed.`
          });

          // Only retry automatically when safe
          const { checkStorageSpace } = require('./BackupService');
          const { validateSystemSafeForCompaction } = require('./CompactionSafetyService');
          const spaceOk = checkStorageSpace();
          const safety = await validateSystemSafeForCompaction();

          // Limit retry count using DB logs of recent automatic retries to avoid loops (Issue 4)
          const recentRetriesCount = await SystemBackup.countDocuments({
            status: 'Failed',
            notes: 'ServerRestartDetected',
            createdAt: { $gte: new Date(Date.now() - 5 * 60 * 1000) }
          });

          // Check if there is already an active backup running/pending (avoid duplicates)
          const activeBackupsCount = await SystemBackup.countDocuments({
            status: { $in: ['Running', 'Pending'] },
            _id: { $ne: b._id }
          });

          if (spaceOk && safety.isSafe && recentRetriesCount <= 3 && activeBackupsCount === 0) {
            logger.info(`Startup validation: Initiating safe automatic backup retry for failed job ${b.backupNumber}...`);
            
            const primaryAdmin = await modelsList.User.findOne({ isPrimaryAdmin: true });
            const operatorId = b.createdBy || (primaryAdmin ? primaryAdmin._id : new mongoose.Types.ObjectId());

            // Start the backup asynchronously in background (don't await to not block startup)
            createFullBackup(operatorId, `Automatic retry of failed backup ${b.backupNumber} after server restart`, 'backups/daily')
              .then(newB => logger.info(`Automatic retry backup completed successfully: ${newB.backupNumber}`))
              .catch(retryErr => logger.error(`Automatic backup retry failed: ${retryErr.message}`));
          } else {
            logger.warn(`Startup validation: Automatic retry skipped for backup ${b.backupNumber} due to safety checks (disk/locks/limit).`);
          }
        }
      }
    }
  } catch (err) {
    logger.error(`Failed to clean stale backup locks on boot: ${err.message}`);
  }

  // 5.5. Clean expired draft reservations on boot (recovery validation)
  try {
    const { cleanupStaleReservations } = require('./SchedulerService');
    logger.info('Startup validation: Scanning for expired draft reservations...');
    await cleanupStaleReservations();
  } catch (err) {
    logger.error(`Failed to clean expired draft reservations on boot: ${err.message}`);
  }

  // 6. Verify MongoDB Replica Set Status
  const { getStatus } = require('./TransactionManager');
  const txStatus = await getStatus();
  console.log(`Transaction Support: ${txStatus.transactionSupport}, DB Type: ${txStatus.dbType}, Replica Set Type: ${txStatus.replicaSetType}`);
  if (!txStatus.transactionSupport) {
    logger.warn('WARNING: Database is not running in Replica Set mode. Running in standalone degraded mode.');
    if (systemStatus === 'HEALTHY') {
      systemStatus = 'DEGRADED';
      bootFailureReason = 'Transactions disabled: MongoDB is not running as a replica set.';
    }
  }

  // 7. Verify Required Collections and Indexes Exist
  try {
    const User = require('../models/User');
    const Medicine = require('../models/Medicine');
    const Customer = require('../models/Customer');

    logger.info('Synchronizing database indexes...');
    await User.syncIndexes();
    await Medicine.syncIndexes();
    await Customer.syncIndexes();
    logger.info('Database indexes synchronized successfully.');
  } catch (err) {
    logger.error(`Database indexes validation failure: ${err.message}`);
    if (systemStatus === 'HEALTHY') {
      systemStatus = 'DEGRADED';
      bootFailureReason = `Database indexes sync failed: ${err.message}`;
    }
  }

  // 8. Verify Storage Directories and Accessibility
  const storageRoot = path.join(__dirname, '../../storage');
  const uploadsRoot = path.join(__dirname, '../../uploads');
  const dirs = [
    storageRoot,
    path.join(storageRoot, 'backups'),
    path.join(storageRoot, 'backups/daily'),
    path.join(storageRoot, 'backups/weekly'),
    path.join(storageRoot, 'backups/monthly'),
    path.join(storageRoot, 'recovery'),
    path.join(storageRoot, 'exports'),
    path.join(storageRoot, 'logs/archive'),
    path.join(storageRoot, 'temp'),
    uploadsRoot,
    path.join(uploadsRoot, 'prescriptions')
  ];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
        logger.info(`Created required directory: ${dir}`);
      } catch (err) {
        const errorMsg = `Failed to create required directory ${dir}: ${err.message}`;
        logger.error(`CRITICAL STARTUP ERROR: ${errorMsg}`);
        systemStatus = 'CRITICAL';
        bootFailureReason = errorMsg;
        return;
      }
    }
    try {
      const testFile = path.join(dir, '.write_test');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
    } catch (err) {
      const errorMsg = `Directory ${dir} is not writeable: ${err.message}`;
      logger.error(`CRITICAL STARTUP ERROR: ${errorMsg}`);
      systemStatus = 'CRITICAL';
      bootFailureReason = errorMsg;
      return;
    }
  }

  // 9. Verify Backup Encryption Key
  const encKey = process.env.BACKUP_ENCRYPTION_KEY;
  if (!encKey || encKey.trim() === '' || encKey === 'default_salt' || encKey === 'default_backup_encryption_key_32bytes') {
    logger.error('CRITICAL STARTUP ERROR: BACKUP_ENCRYPTION_KEY is undefined or insecure.');
    systemStatus = 'RECOVERY_ONLY';
    bootFailureReason = 'BACKUP_ENCRYPTION_KEY is insecure or missing.';
    return;
  }
  if (encKey.length < 32) {
    logger.error('CRITICAL STARTUP ERROR: BACKUP_ENCRYPTION_KEY length is critically short.');
    systemStatus = 'RECOVERY_ONLY';
    bootFailureReason = 'BACKUP_ENCRYPTION_KEY must be at least 32 characters.';
    return;
  }

  if (state) {
    state.systemMode = systemStatus;
    state.bootFailureReason = bootFailureReason;
    await state.save();
  }

  logger.info(`Startup Health validation diagnostics: COMPLETED. System status: ${systemStatus}`);
};

module.exports = { runStartupHealthChecks, getSystemStatus, getBootFailureReason };
