const mongoose = require('mongoose');
const logger = require('./logger');

let initialized = false;
let transactionSupport = false;
let dbType = 'Local';
let replicaSetType = 'standalone';
let activeTransactionsCount = 0;

const setTransactionSupport = (support, type, rType) => {
  transactionSupport = support;
  dbType = type;
  replicaSetType = rType;
  initialized = true;
};

const detectSupport = async () => {
  if (initialized) return;
  try {
    if (mongoose.connection.readyState === 1) {
      const admin = mongoose.connection.db.admin();
      const status = await admin.command({ hello: 1 });
      const isAtlas = mongoose.connection.host && mongoose.connection.host.includes('mongodb.net');

      if (status.setName) {
        replicaSetType = isAtlas ? 'atlas' : 'localReplicaSet';
        transactionSupport = true;
      } else if (isAtlas) {
        replicaSetType = 'atlas';
        transactionSupport = true;
      } else {
        replicaSetType = 'standalone';
        transactionSupport = false;
      }
      dbType = isAtlas ? 'Atlas' : 'Local';
      initialized = true;
    }
  } catch (err) {
    // fallback defaults
  }
};

const getStatus = () => {
  return {
    transactionSupport,
    dbType,
    replicaSetType
  };
};

/**
 * Executes operations inside a transaction if replica set is available,
 * otherwise runs them normally without transaction session.
 * @param {Function} callback - Async callback(session)
 */
const execute = async (callback) => {
  await detectSupport();
  activeTransactionsCount++;
  if (transactionSupport) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const result = await callback(session);
      await session.commitTransaction();
      return result;
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
      activeTransactionsCount = Math.max(0, activeTransactionsCount - 1);
    }
  } else {
    try {
      return await callback(null);
    } finally {
      activeTransactionsCount = Math.max(0, activeTransactionsCount - 1);
    }
  }
};

const getActiveTransactionsCount = () => activeTransactionsCount;

module.exports = {
  execute,
  setTransactionSupport,
  getStatus,
  getActiveTransactionsCount
};

