const mongoose = require('mongoose');
const logger = require('./logger');

let cachedState = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 10000; // 10 seconds

const syncStateWithDB = async () => {
  const now = Date.now();
  if (cachedState && (now - lastCacheTime < CACHE_TTL_MS)) {
    return cachedState;
  }

  try {
    if (mongoose.connection.readyState !== 1) {
      return { systemMode: 'CRITICAL', bootFailureReason: 'Database connection offline' };
    }
    const SystemState = require('../models/SystemState');
    let state = await SystemState.findOne({ key: 'SYSTEM_STATE' });
    if (!state) {
      state = await SystemState.findOneAndUpdate(
        { key: 'SYSTEM_STATE' },
        { $setOnInsert: { systemMode: 'HEALTHY', version: 0 } },
        { upsert: true, new: true }
      );
    }
    cachedState = state.toObject();
    lastCacheTime = now;
    return cachedState;
  } catch (err) {
    logger.error(`Error syncing system state with DB: ${err.message}`);
    return { systemMode: 'CRITICAL', bootFailureReason: err.message };
  }
};

const getSystemMode = async () => {
  const state = await syncStateWithDB();
  return state.systemMode;
};

const setSystemMode = async (mode, reason = '') => {
  try {
    if (mongoose.connection.readyState !== 1) {
      throw new Error('Database connection is offline. Cannot update system mode.');
    }
    const SystemState = require('../models/SystemState');
    let updated = false;
    let retries = 3;

    while (!updated && retries > 0) {
      const state = await SystemState.findOne({ key: 'SYSTEM_STATE' });
      const currentVersion = state ? state.version : 0;
      
      const result = await SystemState.findOneAndUpdate(
        { key: 'SYSTEM_STATE', version: currentVersion },
        { $set: { systemMode: mode, bootFailureReason: reason }, $inc: { version: 1 } },
        { upsert: true, new: true }
      );

      if (result) {
        cachedState = result.toObject();
        lastCacheTime = Date.now();
        updated = true;
      } else {
        retries--;
        await new Promise(r => setTimeout(r, 100)); // Stagger
      }
    }

    if (!updated) {
      throw new Error('State modification conflict: concurrent updates exceeded limit.');
    }

    logger.info(`System mode updated to ${mode}. Reason: ${reason}`);
    return cachedState;
  } catch (err) {
    logger.error(`Failed to set system mode to ${mode}: ${err.message}`);
    throw err;
  }
};

const isMaintenanceMode = async () => {
  const mode = await getSystemMode();
  return mode === 'RECOVERY_ONLY' || mode === 'CRITICAL';
};

const getMaintenanceReason = async () => {
  const state = await syncStateWithDB();
  return state.bootFailureReason || 'System undergoing maintenance';
};

const enableMaintenanceMode = async (reason) => {
  await setSystemMode('RECOVERY_ONLY', reason || 'Undergoing Critical System Maintenance');
};

const disableMaintenanceMode = async () => {
  await setSystemMode('HEALTHY', '');
};

module.exports = {
  getSystemMode,
  setSystemMode,
  isMaintenanceMode,
  getMaintenanceReason,
  enableMaintenanceMode,
  disableMaintenanceMode,
  syncStateWithDB
};
