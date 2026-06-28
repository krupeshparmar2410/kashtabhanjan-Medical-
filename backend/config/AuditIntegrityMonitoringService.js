const AuditLog = require('../models/AuditLog');
const crypto = require('crypto');
const logger = require('./logger');

const deterministicStringify = (obj) => {
  if (!obj || typeof obj !== 'object') return JSON.stringify(obj);
  return JSON.stringify(Object.keys(obj).sort().reduce((acc, key) => {
    acc[key] = obj[key];
    return acc;
  }, {}));
};

const checkLastBlocks = async () => {
  try {
    const logs = await AuditLog.find().sort({ createdAt: -1 }).limit(10).lean();
    if (logs.length === 0) {
      // Empty audit logs collection is suspicious if the system has been seeded or running
      return { 
        status: 'Warning', 
        verifiedCount: 0,
        message: 'Suspicious state: Audit log collection is empty.' 
      };
    }

    for (let i = 0; i < logs.length - 1; i++) {
      const current = logs[i];
      const prev = logs[i + 1];

      const entityIdStr = current.entityId ? current.entityId.toString() : '';
      const performedByStr = current.performedBy ? current.performedBy.toString() : '';
      const newValuesStr = current.newValues ? deterministicStringify(current.newValues) : '';
      
      const dataToHash = 
        current.previousHash + 
        current.actionType + 
        current.module + 
        entityIdStr + 
        newValuesStr + 
        performedByStr;
      
      const calculatedHash = crypto.createHash('sha256').update(dataToHash).digest('hex');

      if (current.hash !== calculatedHash || current.previousHash !== prev.hash) {
        return {
          status: 'Critical',
          message: `Audit chain mismatch detected at log ID: ${current._id}`
        };
      }
    }

    return { status: 'Healthy', verifiedCount: logs.length };
  } catch (err) {
    logger.error('Audit integrity validation failed:', err);
    return { status: 'Warning', error: err.message };
  }
};

module.exports = { checkLastBlocks };
