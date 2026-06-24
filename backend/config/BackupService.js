const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const AdmZip = require('adm-zip');
const logger = require('./logger');
const SystemBackup = require('../models/SystemBackup');
const BackupVerificationHistory = require('../models/BackupVerificationHistory');
const { getSetting } = require('./SettingsService');
const { getNextSequence } = require('./SequenceService');
const { execute: runInTransaction } = require('./TransactionManager');

const APP_VERSION = '1.0.0';
const SCHEMA_VERSION = '1.0.0';

// Import all models to dump/load
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
  Sequence: require('../models/Sequence'),
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
  ActiveSession: require('../models/ActiveSession'),
  SystemSettingsHistory: require('../models/SystemSettingsHistory'),
  AuditSignatures: require('../models/AuditSignatures'),
  BackupVerificationHistory: require('../models/BackupVerificationHistory')
};

/**
 * Derives encryption key from the current env key or rotated keys
 */
const getEncryptionKey = (version = 1) => {
  const currentKey = process.env.BACKUP_ENCRYPTION_KEY;
  if (!currentKey) {
    throw new Error('BACKUP_ENCRYPTION_KEY environment variable is not defined.');
  }
  if (version === 1) {
    return crypto.scryptSync(currentKey, 'salt', 32);
  }
  
  try {
    const rotatedKeysStr = getSetting('ROTATED_ENCRYPTION_KEYS', '{}');
    const keysObj = JSON.parse(rotatedKeysStr);
    if (keysObj[version]) {
      return crypto.scryptSync(keysObj[version], 'salt', 32);
    }
  } catch (err) {
    logger.error(`Failed to parse rotated keys: ${err.message}`);
  }
  return crypto.scryptSync(currentKey, 'salt', 32);
};

/**
 * Check disk space and folder size limits
 */
const checkStorageSpace = () => {
  const storageRoot = path.join(__dirname, '../../storage');
  try {
    if (fs.statfsSync) {
      const stats = fs.statfsSync(storageRoot);
      const freePercent = (stats.bavail / stats.blocks) * 100;
      if (freePercent < 10) {
        logger.error('CRITICAL: Available storage space is below 10%. Backup execution blocked.');
        return false;
      }
    }
  } catch (err) {
    logger.warn(`Storage space check failed: ${err.message}`);
  }
  return true;
};

/**
 * Creates full encrypted database backup ZIP using TransactionManager
 */
const createFullBackup = async (operatorId, notes = '', targetFolder = 'backups/daily') => {
  const startTime = Date.now();
  if (!checkStorageSpace()) {
    throw new Error('Insufficient disk storage space. Backup blocked.');
  }

  try {
    return await runInTransaction(async (session) => {
      const backupId = await getNextSequence('backupNumber', 'BKP');
      const User = require('../models/User');
      const operator = await User.findById(operatorId).session(session);
      const operatorName = operator ? operator.name : 'System/CLI';

      const dumpData = {
        backupId,
        backupVersion: '1.0.0',
        appVersion: APP_VERSION,
        dbSchemaVersion: SCHEMA_VERSION,
        collections: {}
      };

      // Serialize all collections
      for (const [name, Model] of Object.entries(models)) {
        if (name === 'SystemBackup' || name === 'BackupVerificationHistory' || name === 'ActiveSession') continue;
        const docs = await Model.find({}).session(session).lean();
        dumpData.collections[name] = docs || [];
      }

      const zip = new AdmZip();
      zip.addFile('data.json', Buffer.from(JSON.stringify(dumpData, null, 2), 'utf8'));
      
      const metaInfo = {
        backupId,
        appVersion: APP_VERSION,
        dbSchemaVersion: SCHEMA_VERSION,
        checksum: ''
      };
      zip.addFile('meta.json', Buffer.from(JSON.stringify(metaInfo, null, 2), 'utf8'));

      const zipBuffer = zip.toBuffer();
      const checksum = crypto.createHash('sha256').update(zipBuffer).digest('hex');

      const keyVersion = Number(getSetting('CURRENT_KEY_VERSION', 1));
      const key = getEncryptionKey(keyVersion);
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

      let encrypted = cipher.update(zipBuffer);
      encrypted = Buffer.concat([encrypted, cipher.final()]);
      const tag = cipher.getAuthTag();

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `full_backup_${backupId}_${timestamp}.zip.enc`;
      const storageRoot = path.join(__dirname, '../../storage');
      const relativeFilePath = path.join(targetFolder, fileName);
      const absoluteFilePath = path.join(storageRoot, relativeFilePath);

      const payload = Buffer.concat([iv, tag, encrypted]);
      fs.writeFileSync(absoluteFilePath, payload);

      const fileSize = payload.length;

      const backupRecord = new SystemBackup({
        backupNumber: backupId,
        backupType: 'Full',
        fileName,
        filePath: relativeFilePath,
        fileSize,
        checksum,
        isEncrypted: true,
        encryptionTag: tag.toString('hex'),
        encryptionIV: iv.toString('hex'),
        keyVersion,
        status: 'Completed',
        healthStatus: 'Unverified',
        backupStartedAt: new Date(startTime),
        backupCompletedAt: new Date(),
        createdBy: operatorId,
        backupCreatedByName: operatorName,
        notes,
        appVersion: APP_VERSION,
        backupSourceVersion: APP_VERSION,
        dbSchemaVersion: SCHEMA_VERSION
      });

      await backupRecord.save({ session });
      logger.info(`Database backup ${backupId} completed successfully.`);
      return backupRecord;
    });
  } catch (err) {
    logger.error('Database backup failed:', err);
    throw err;
  }
};

/**
 * Validates backup zip and file compatibility checks
 */
const validateBackupFile = (absoluteFilePath, keyVersion, recordedTagHex, recordedChecksum) => {
  if (!fs.existsSync(absoluteFilePath)) {
    throw new Error('Backup file does not exist on disk.');
  }

  const payload = fs.readFileSync(absoluteFilePath);
  if (payload.length < 28) {
    throw new Error('Invalid backup file structure: too small.');
  }

  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const encrypted = payload.subarray(28);

  const key = getEncryptionKey(keyVersion);
  
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  let decryptedBuffer;
  try {
    decryptedBuffer = decipher.update(encrypted);
    decryptedBuffer = Buffer.concat([decryptedBuffer, decipher.final()]);
  } catch (err) {
    throw new Error('Backup decryption failed: Checksum mismatch or invalid encryption key.');
  }

  const computedChecksum = crypto.createHash('sha256').update(decryptedBuffer).digest('hex');
  if (recordedChecksum && computedChecksum !== recordedChecksum) {
    throw new Error('Backup verification failed: SHA-256 checksum verification mismatch.');
  }

  const zip = new AdmZip(decryptedBuffer);
  const dataEntry = zip.getEntry('data.json');
  if (!dataEntry) {
    throw new Error('Invalid backup archive contents: data.json not found.');
  }

  const dumpData = JSON.parse(dataEntry.getData().toString('utf8'));
  
  if (dumpData.appVersion !== APP_VERSION || dumpData.dbSchemaVersion !== SCHEMA_VERSION) {
    throw new Error(`Backup version incompatibility. Backup App version: ${dumpData.appVersion}, Database Schema version: ${dumpData.dbSchemaVersion}. Current System: App ${APP_VERSION}, Schema ${SCHEMA_VERSION}.`);
  }

  return dumpData;
};

/**
 * Transaction-Safe Restoration swapping collections using TransactionManager
 */
const restoreFromBackup = async (operatorId, fileName, confirmationPhrase) => {
  if (confirmationPhrase !== 'RESTORE SYSTEM STATE') {
    throw new Error('Restoration aborted: Invalid confirmation phrase.');
  }

  const meta = await SystemBackup.findOne({ fileName, isArchived: false });
  if (!meta) {
    throw new Error('Backup record metadata not found or has been archived.');
  }

  const storageRoot = path.join(__dirname, '../../storage');
  const absoluteFilePath = path.join(storageRoot, meta.filePath);

  logger.info(`Starting restore safety checks for backup: ${meta.backupNumber}`);

  let recoveryRecord;
  try {
    recoveryRecord = await createFullBackup(operatorId, `Automatic pre-restore rollback recovery point for BKP-${meta.backupNumber}`, 'recovery');
    logger.info(`Pre-restore safety recovery point created: ${recoveryRecord.backupNumber}`);
  } catch (backupErr) {
    throw new Error(`Failed to create pre-restore recovery rollback checkpoint: ${backupErr.message}. Restoration aborted.`);
  }

  let dumpData;
  try {
    dumpData = validateBackupFile(absoluteFilePath, meta.keyVersion, meta.encryptionTag, meta.checksum);
    
    const required = ['User', 'Settings', 'AuditLog'];
    const missing = required.filter(col => !dumpData.collections[col]);
    if (missing.length > 0) {
      throw new Error(`Invalid backup document set. Missing required collections: [${missing.join(', ')}].`);
    }
    logger.info('Decryption, Checksum, and Version Compatibility validations: PASSED.');
  } catch (valErr) {
    const { logSystemAction } = require('./AuditService');
    await logSystemAction(null, {
      actionType: 'Database Restore Compatibility Failure',
      module: 'Security',
      entityType: 'SystemBackup',
      entityId: meta._id,
      newValues: { fileName, error: valErr.message },
      status: 'Failed',
      remarks: `Compatibility check failed during restore: ${valErr.message}`
    });
    throw valErr;
  }

  try {
    return await runInTransaction(async (session) => {
      for (const [name, Model] of Object.entries(models)) {
        if (name === 'SystemBackup' || name === 'BackupVerificationHistory' || name === 'ActiveSession') continue;

        const documents = dumpData.collections[name] || [];
        const tempCollectionName = `temp_${Model.collection.name}`;
        const TempModel = mongoose.model(tempCollectionName, Model.schema, tempCollectionName);

        await TempModel.deleteMany({}).session(session);
        
        if (documents.length > 0) {
          await TempModel.insertMany(documents, { session });
        }

        const tempCount = await TempModel.countDocuments().session(session);
        if (tempCount !== documents.length) {
          throw new Error(`Document count validation mismatch on collection ${name}. Expected: ${documents.length}, Loaded: ${tempCount}`);
        }
      }

      for (const [name, Model] of Object.entries(models)) {
        if (name === 'SystemBackup' || name === 'BackupVerificationHistory' || name === 'ActiveSession') continue;

        const activeCollectionName = Model.collection.name;
        const tempCollectionName = `temp_${activeCollectionName}`;

        await mongoose.connection.db.dropCollection(activeCollectionName).catch(() => {});
        await mongoose.connection.db.renameCollection(tempCollectionName, activeCollectionName);
      }

      logger.info(`System successfully restored from backup ${meta.backupNumber}.`);

      const { reloadCache } = require('./SettingsService');
      await reloadCache();

      return { success: true, message: `System database successfully restored from BKP-${meta.backupNumber}.` };
    });
  } catch (restoreErr) {
    logger.error('Restore transaction failed. Initiating automatic rollback recovery...', restoreErr);

    try {
      const recoveryPath = path.join(storageRoot, recoveryRecord.filePath);
      const rollbackDump = validateBackupFile(recoveryPath, recoveryRecord.keyVersion, recoveryRecord.encryptionTag, recoveryRecord.checksum);
      
      for (const [name, Model] of Object.entries(models)) {
        if (name === 'SystemBackup' || name === 'BackupVerificationHistory' || name === 'ActiveSession') continue;
        
        await Model.deleteMany({});
        const docs = rollbackDump.collections[name] || [];
        if (docs.length > 0) {
          await Model.insertMany(docs);
        }
      }
      logger.info('Automatic recovery rollback completed successfully. Database state returned to pre-restore snapshot.');
    } catch (rollbackErr) {
      logger.error('CRITICAL DATABASE ROLLBACK RECOVERY FAILED. Database may be corrupt.', rollbackErr);
    }

    throw restoreErr;
  }
};

/**
 * Weekly Scheduled verification restore test
 */
const runWeeklyBackupVerification = async (operatorId = null) => {
  const startTime = Date.now();
  const latestBackup = await SystemBackup.findOne({ status: 'Completed', isArchived: false }).sort({ createdAt: -1 });
  if (!latestBackup) {
    logger.info('No backups available for weekly health verification.');
    return;
  }

  const storageRoot = path.join(__dirname, '../../storage');
  const absoluteFilePath = path.join(storageRoot, latestBackup.filePath);

  logger.info(`Starting weekly backup verification run for: ${latestBackup.backupNumber}`);
  let result = 'Failed';
  let errorMessage = '';

  try {
    const dump = validateBackupFile(absoluteFilePath, latestBackup.keyVersion, latestBackup.encryptionTag, latestBackup.checksum);
    
    for (const [name, Model] of Object.entries(models)) {
      if (name === 'SystemBackup' || name === 'BackupVerificationHistory' || name === 'ActiveSession') continue;
      const docCount = dump.collections[name] ? dump.collections[name].length : 0;
      if (docCount === 0 && name === 'User') {
        throw new Error('User collection check returned 0 profiles.');
      }
    }
    result = 'Passed';
    latestBackup.healthStatus = 'Passed';
  } catch (err) {
    result = 'Failed';
    latestBackup.healthStatus = 'Failed';
    errorMessage = err.message;
    logger.error(`Weekly verification failed for ${latestBackup.backupNumber}: ${err.message}`);
  } finally {
    const elapsed = Date.now() - startTime;
    latestBackup.lastVerifiedAt = new Date();
    latestBackup.verificationDuration = elapsed;
    latestBackup.restoreTestDate = new Date();
    await latestBackup.save();

    await BackupVerificationHistory.create({
      backupId: latestBackup._id,
      verificationDate: new Date(),
      durationMs: elapsed,
      result,
      operatorId,
      errorMessage
    });
  }
};

module.exports = {
  createFullBackup,
  restoreFromBackup,
  runWeeklyBackupVerification,
  getEncryptionKey
};
