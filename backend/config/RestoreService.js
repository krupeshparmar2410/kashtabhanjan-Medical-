const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const logger = require('./logger');
const RestoreSession = require('../models/RestoreSession');
const SystemBackup = require('../models/SystemBackup');
const SystemState = require('../models/SystemState');
const { getSetting } = require('./SettingsService');

const models = {
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

const performStagingRestoreAndSwap = async (operatorId, fileName, confirmationPhrase) => {
  if (confirmationPhrase !== 'RESTORE SYSTEM STATE') {
    throw new Error('Restoration aborted: Invalid confirmation phrase.');
  }

  const meta = await SystemBackup.findOne({ fileName, isArchived: false });
  const storageRoot = path.join(__dirname, '../../storage');
  
  let absoluteFilePath;
  let keyVersion = 1;
  let recordedTagHex = null;
  let recordedChecksum = null;

  if (!meta) {
    const searchDirs = ['backups/daily', 'backups/weekly', 'backups/monthly', 'recovery', 'temp'];
    let foundPath = null;
    for (const folder of searchDirs) {
      const testPath = path.join(storageRoot, folder, fileName);
      if (fs.existsSync(testPath)) {
        foundPath = testPath;
        break;
      }
    }
    if (!foundPath && fs.existsSync(fileName)) {
      foundPath = path.resolve(fileName);
    }

    if (!foundPath) {
      throw new Error(`Backup file ${fileName} not found on disk.`);
    }
    absoluteFilePath = foundPath;
    keyVersion = Number(getSetting('CURRENT_KEY_VERSION', 1));
  } else {
    absoluteFilePath = path.join(storageRoot, meta.filePath);
    keyVersion = meta.keyVersion;
    recordedTagHex = meta.encryptionTag;
    recordedChecksum = meta.checksum;
  }

  logger.info(`Initiating staging restore process for file: ${fileName}`);

  const { createFullBackup, validateBackupFile } = require('./BackupService');

  // 1. Create a pre-restore safety rollback backup
  let recoveryRecord;
  try {
    recoveryRecord = await createFullBackup(operatorId, `Pre-restore safety snapshot for ${fileName}`, 'recovery');
    logger.info(`Pre-restore safety rollback checkpoint created: ${recoveryRecord.backupNumber}`);
  } catch (backupErr) {
    logger.error(`Staging Restore Safety Gate: Pre-restore rollback backup failed: ${backupErr.message}`);
    throw new Error('RESTORE_BLOCKED_ROLLBACK_BACKUP_FAILED');
  }

  // 2. Verify rollback snapshot integrity (Read compatibility validation)
  try {
    const rollbackPath = path.join(storageRoot, recoveryRecord.filePath);
    validateBackupFile(rollbackPath, recoveryRecord.keyVersion, recoveryRecord.encryptionTag, recoveryRecord.checksum);
    logger.info('Pre-restore safety rollback backup verification: PASSED.');
  } catch (verifyErr) {
    logger.error(`CRITICAL: Rollback backup verification failed: ${verifyErr.message}. Aborting restore.`);
    if (recoveryRecord) {
      fs.unlinkSync(path.join(storageRoot, recoveryRecord.filePath));
      await SystemBackup.deleteOne({ _id: recoveryRecord._id });
    }
    throw new Error('RESTORE_BLOCKED_ROLLBACK_BACKUP_VERIFICATION_FAILED');
  }

  // 3. Validate target backup compatibility
  let dumpData;
  try {
    dumpData = validateBackupFile(absoluteFilePath, keyVersion, recordedTagHex, recordedChecksum);
    const required = ['User', 'Settings', 'AuditLog'];
    const missing = required.filter(col => !dumpData.collections[col]);
    if (missing.length > 0) {
      throw new Error(`Missing required collections: [${missing.join(', ')}].`);
    }
  } catch (valErr) {
    logger.error(`Backup file compatibility checks failed: ${valErr.message}`);
    if (recoveryRecord) {
      fs.unlinkSync(path.join(storageRoot, recoveryRecord.filePath));
      await SystemBackup.deleteOne({ _id: recoveryRecord._id });
    }
    throw valErr;
  }

  // 4. Update database-backed SystemState status
  const crypto = require('crypto');
  const fileBuffer = fs.readFileSync(absoluteFilePath);
  const fileChecksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');
  const restoreSessionId = crypto.randomUUID();

  await SystemState.findOneAndUpdate(
    { key: 'SYSTEM_STATE' },
    {
      isInRestoreProgress: true,
      activeRestoreJob: {
        fileName,
        rollbackBackupPath: recoveryRecord.filePath,
        startedAt: new Date(),
        restoreSessionId,
        backupId: dumpData.backupId,
        checksum: fileChecksum
      }
    },
    { upsert: true }
  );

  // Create a RestoreSession entry to track this restore operation
  await RestoreSession.create({
    sessionId: restoreSessionId,
    backupId: dumpData.backupId,
    checksum: fileChecksum,
    status: 'IN_PROGRESS',
    systemStateRef: (await SystemState.findOne({ key: 'SYSTEM_STATE' }))._id
  });

  const db = mongoose.connection.db;
  const collections = await db.listCollections().toArray();
  const existingNames = collections.map(c => c.name);

  // 5. Restore to Staging (prefixed with "stage_")
  const stagingModels = [];
  try {
    for (const [name, Model] of Object.entries(models)) {
      const activeCollectionName = Model.collection.name;
      const stagingCollectionName = `stage_${activeCollectionName}`;

      let StageModel;
      if (mongoose.models[stagingCollectionName]) {
        StageModel = mongoose.models[stagingCollectionName];
      } else {
        const stageSchema = Model.schema.clone();
        stageSchema.set('autoIndex', false);
        StageModel = mongoose.model(stagingCollectionName, stageSchema, stagingCollectionName);
      }

      await StageModel.deleteMany({});
      
      const documents = dumpData.collections[name] || [];
      if (documents.length > 0) {
        await StageModel.insertMany(documents);
      }

      const count = await StageModel.countDocuments();
      if (count !== documents.length) {
        throw new Error(`Staging validation failed for ${name}. Expected ${documents.length}, got ${count}`);
      }

      stagingModels.push({
        modelName: name,
        activeName: activeCollectionName,
        stageName: stagingCollectionName,
        backupName: `backup_${activeCollectionName}`
      });
    }

    logger.info('Staging restore validation completed successfully. Commencing atomic swap...');

    // 6. Swap production to backup, then staging to production
    for (const item of stagingModels) {
      if (existingNames.includes(item.activeName)) {
        await db.renameCollection(item.activeName, item.backupName);
      }
      await db.renameCollection(item.stageName, item.activeName);
    }

    // 7. Post-swap Verification and cleanup of backup collections
    for (const item of stagingModels) {
      await db.dropCollection(item.backupName).catch(() => {});
    }

    // Rebuild indexes on all models
    logger.info('Rebuilding production collection indexes...');
    for (const [name, Model] of Object.entries(models)) {
      await Model.createIndexes().catch(err => logger.error(`Index build failed for ${name}: ${err.message}`));
    }

    // Clear SystemState Progress
    await SystemState.findOneAndUpdate(
      { key: 'SYSTEM_STATE' },
      {
        isInRestoreProgress: false,
        activeRestoreJob: null,
        systemMode: 'HEALTHY',
        bootFailureReason: ''
      }
    );

    logger.info(`Staging restore and atomic swap completed successfully for file ${fileName}.`);
    
    const { reloadCache } = require('./SettingsService');
    await reloadCache();

    return { success: true, message: `System database successfully restored from ${fileName}.` };

  } catch (err) {
    logger.error(`Critical error during staging restore: ${err.message}. Initiating rollback...`);
    
    // Rollback atomic swap safely
    try {
      const collectionsAfterFail = await db.listCollections().toArray();
      const currentNames = collectionsAfterFail.map(c => c.name);

      for (const item of stagingModels) {
        // Drop staging collection unconditionally (safe cleanup)
        if (currentNames.includes(item.stageName)) {
          await db.dropCollection(item.stageName).catch(() => {});
        }

        // Only restore backup if the backup collection exists!
        if (currentNames.includes(item.backupName)) {
          // Drop whatever is in activeName to prepare for restoring backupName
          if (currentNames.includes(item.activeName)) {
            await db.dropCollection(item.activeName).catch(() => {});
          }
          await db.renameCollection(item.backupName, item.activeName);
        }
        // If backupName does NOT exist, activeName was never renamed and contains original production data.
        // We MUST NOT drop activeName in that case!
      }
    } catch (rollbackErr) {
      logger.error(`CRITICAL ROLLBACK SWAP FAILED: ${rollbackErr.message}`);
    }

    await SystemState.findOneAndUpdate(
      { key: 'SYSTEM_STATE' },
      {
        isInRestoreProgress: false,
        activeRestoreJob: null
      }
    );

    throw err;
  }
};

const runIsolatedDrill = async (operatorId, absoluteBackupPath, keyVersion, recordedTagHex, recordedChecksum) => {
  const drillDBName = 'kashtbhanjan_drill';
  let drillConnection = null;

  try {
    const { validateBackupFile } = require('./BackupService');
    const dumpData = validateBackupFile(absoluteBackupPath, keyVersion, recordedTagHex, recordedChecksum);

    let baseURI = 'mongodb://127.0.0.1:27017/medical_shop';
    if (mongoose.connection && mongoose.connection.host) {
      const host = mongoose.connection.host;
      if (host === '127.0.0.1' || host === 'localhost') {
        baseURI = `mongodb://${host}:${mongoose.connection.port || 27017}/medical_shop`;
      } else if (process.env.MONGO_URI) {
        baseURI = process.env.MONGO_URI;
      }
    }

    const prefix = baseURI.startsWith('mongodb+srv://') ? 'mongodb+srv://' : 'mongodb://';
    const cleanBase = baseURI.replace(/^mongodb\+srv:\/\//, 'http://').replace(/^mongodb:\/\//, 'http://');
    const url = new URL(cleanBase);
    url.pathname = `/${drillDBName}`;
    const drillURI = url.toString().replace(/^http:\/\//, prefix);

    logger.info(`Starting Isolated Disaster Recovery Drill on: ${drillURI}`);
    drillConnection = await mongoose.createConnection(drillURI).asPromise();

    for (const [name, Model] of Object.entries(models)) {
      const DrillModel = drillConnection.model(name, Model.schema);
      const docs = dumpData.collections[name] || [];
      
      await DrillModel.deleteMany({});
      if (docs.length > 0) {
        await DrillModel.insertMany(docs);
      }

      const count = await DrillModel.countDocuments();
      if (count !== docs.length) {
        throw new Error(`Drill validation failed: Count mismatch on model ${name}`);
      }
    }

    // Clean up drill database completely
    await drillConnection.dropDatabase();
    await drillConnection.close();
    logger.info(`Disaster Recovery Drill completed. Isolated DB ${drillDBName} dropped successfully.`);
    
    await SystemState.findOneAndUpdate(
      { key: 'SYSTEM_STATE' },
      { drillStatus: 'Passed', drillLastRun: new Date() }
    );

    return { success: true };
  } catch (err) {
    if (drillConnection) {
      await drillConnection.dropDatabase().catch(() => {});
      await drillConnection.close().catch(() => {});
    }
    
    await SystemState.findOneAndUpdate(
      { key: 'SYSTEM_STATE' },
      { drillStatus: 'Failed', drillLastRun: new Date() }
    );
    
    logger.error('Disaster Recovery Drill failed:', err);
    throw err;
  }
};

module.exports = { performStagingRestoreAndSwap, runIsolatedDrill };
