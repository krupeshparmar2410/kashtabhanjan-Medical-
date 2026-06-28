const mongoose = require('mongoose');
const crypto = require('crypto');
const AuditLog = require('../models/AuditLog');
const AuditSignatures = require('../models/AuditSignatures');
const logger = require('./logger');

// Generate genesis hash
const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

/**
 * Computes hash for a single log block
 */
const calculateBlockHash = (previousHash, actionType, module, entityId, newValues, performedBy) => {
  const entityIdStr = entityId ? entityId.toString() : '';
  const performedByStr = performedBy ? performedBy.toString() : '';
  const newValuesStr = newValues ? JSON.stringify(newValues) : '';
  
  const data = previousHash + actionType + module + entityIdStr + newValuesStr + performedByStr;
  return crypto.createHash('sha256').update(data).digest('hex');
};

/**
 * Logs a system action with cryptographic chaining
 */
let writeQueue = Promise.resolve();

const logSystemAction = async (req, params) => {
  const currentQueue = writeQueue;
  let resolveQueue;
  writeQueue = new Promise((resolve) => {
    resolveQueue = resolve;
  });

  try {
    await currentQueue;
  } catch (err) {
    // Ignore error of previous queue item to avoid blocking subsequent writes
  }

  try {
    const result = await logSystemActionInternal(req, params);
    return result;
  } finally {
    resolveQueue();
  }
};

const logSystemActionInternal = async (req, {
  actionType,
  module: logModule,
  entityType,
  entityId,
  oldValues = null,
  newValues = null,
  status = 'Success',
  remarks = '',
  session = null
}) => {
  try {
    // Extract metadata from request
    let performedBy = null;
    let userRole = 'staff';
    let ipAddress = '127.0.0.1';
    let browserInfo = 'System/CLI';
    let requestMethod = 'SCHEDULER';
    let endpoint = 'SYSTEM';

    if (req) {
      if (req.user) {
        performedBy = req.user._id || req.user.id;
        userRole = req.user.role || 'staff';
      }
      ipAddress = req.ip || (req.headers && req.headers['x-forwarded-for']) || (req.connection && req.connection.remoteAddress) || '127.0.0.1';
      browserInfo = (req.headers && req.headers['user-agent']) || '';
      requestMethod = req.method || '';
      endpoint = req.originalUrl || '';
    }

    // Default fallback to an Admin user if performedBy is null (e.g. CLI or background sweeps)
    if (!performedBy) {
      const User = require('../models/User');
      const systemAdmin = await User.findOne({ role: 'admin' }).session(session);
      if (systemAdmin) {
        performedBy = systemAdmin._id;
        userRole = 'admin';
      } else {
        // Mongoose requires performedBy, generate a temp ObjectId if seeding fails
        performedBy = new mongoose.Types.ObjectId();
      }
    }

    // Retrieve last block to connect chain
    const lastLog = await AuditLog.findOne({}, {}, { sort: { createdAt: -1 } }).session(session);
    const previousHash = lastLog ? lastLog.hash : GENESIS_HASH;

    // Calculate block hash
    const hash = calculateBlockHash(previousHash, actionType, logModule, entityId, newValues, performedBy);

    // Save block
    const audit = new AuditLog({
      actionType,
      module: logModule,
      entityType,
      entityId,
      oldValues,
      newValues,
      performedBy,
      userRole,
      ipAddress,
      browserInfo,
      requestMethod,
      endpoint,
      status,
      remarks,
      hash,
      previousHash
    });

    await audit.save({ session });
    return audit;
  } catch (err) {
    logger.error('Failed to write Audit Log block:', err);
  }
};

/**
 * Validates the cryptographic audit chain from Genesis to latest block
 */
const verifyChainIntegrity = async (operatorId = null) => {
  logger.info('Starting full audit log verification sweep...');
  try {
    const logs = await AuditLog.find().sort({ createdAt: 1 }).lean();
    
    if (logs.length === 0) {
      return { success: true, verifiedCount: 0, message: 'Audit chain is empty.' };
    }

    let previousHash = GENESIS_HASH;
    for (let i = 0; i < logs.length; i++) {
      const current = logs[i];
      
      const calculatedHash = calculateBlockHash(
        previousHash,
        current.actionType,
        current.module,
        current.entityId,
        current.newValues,
        current.performedBy
      );

      if (current.hash !== calculatedHash) {
        return {
          success: false,
          verifiedCount: i,
          corruptedLogId: current._id,
          message: `Hash mismatch at block ID: ${current._id}. Calculated: ${calculatedHash}, Database: ${current.hash}`
        };
      }

      if (current.previousHash !== previousHash) {
        return {
          success: false,
          verifiedCount: i,
          corruptedLogId: current._id,
          message: `Chain link broken at block ID: ${current._id}. Expected previous: ${previousHash}, Found: ${current.previousHash}`
        };
      }

      previousHash = current.hash;
    }

    // Sign the report if validation succeeds
    const reportHash = crypto
      .createHash('sha256')
      .update(previousHash + logs.length.toString() + Date.now().toString())
      .digest('hex');
    
    // HMAC Signature using BACKUP_ENCRYPTION_KEY as salt
    const salt = process.env.BACKUP_ENCRYPTION_KEY;
    if (!salt) {
      throw new Error('BACKUP_ENCRYPTION_KEY environment variable is not defined.');
    }
    const signature = crypto
      .createHmac('sha256', salt)
      .update(reportHash)
      .digest('hex');

    if (operatorId) {
      await AuditSignatures.create({
        reportTimestamp: new Date(),
        verifiedUpToLogId: logs[logs.length - 1]._id,
        reportHash,
        signature,
        verifiedBy: operatorId
      });
    }

    return {
      success: true,
      verifiedCount: logs.length,
      lastLogId: logs[logs.length - 1]._id,
      reportHash,
      signature
    };
  } catch (err) {
    logger.error('Audit chain verification execution failed:', err);
    return { success: false, error: err.message };
  }
};

module.exports = {
  logSystemAction,
  verifyChainIntegrity
};
