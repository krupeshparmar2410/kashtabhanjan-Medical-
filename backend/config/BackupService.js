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
        
        let query = Model.find({});
        if (name === 'User') {
          query = query.select('+password');
        }
        
        const docs = await query.session(session).lean();
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

const { performStagingRestoreAndSwap, runIsolatedDrill } = require('./RestoreService');

/**
 * Transaction-Safe Restoration swapping collections using Staging and Atomic Swap
 */
const restoreFromBackup = async (operatorId, fileName, confirmationPhrase) => {
  return await performStagingRestoreAndSwap(operatorId, fileName, confirmationPhrase);
};

/**
 * Weekly Scheduled verification restore test using isolated DR drill database
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
    // Run isolated drill validation
    await runIsolatedDrill(
      operatorId || latestBackup.createdBy,
      absoluteFilePath,
      latestBackup.keyVersion,
      latestBackup.encryptionTag,
      latestBackup.checksum
    );
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
  getEncryptionKey,
  validateBackupFile,
  checkStorageSpace
};

