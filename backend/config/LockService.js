const SystemLock = require('../models/SystemLock');

/**
 * Acquire a distributed cluster-safe lock
 * @param {string} lockName Name of the lock
 * @param {string} userId User ID acquiring the lock
 * @param {number} durationMs Lock duration in milliseconds before auto-expiry
 * @returns {Promise<boolean>} True if lock acquired, false if already locked
 */
const acquireLock = async (lockName, userId, durationMs = 900000) => { // Default 15 minutes
  try {
    const now = new Date();
    const expiresAt = new Date(Date.now() + durationMs);

    // Look for an existing, unexpired lock
    const activeLock = await SystemLock.findOne({
      lockName,
      status: 'Locked',
      expiresAt: { $gt: now }
    });

    if (activeLock) {
      return false;
    }

    // Try to acquire the lock atomically via findOneAndUpdate with upsert
    // If multiple workers try at the exact same moment, the unique index on lockName will prevent duplicates,
    // and MongoDB will throw a duplicate key error which we catch and return false.
    await SystemLock.findOneAndUpdate(
      { lockName },
      {
        lockedBy: userId,
        lockedAt: now,
        expiresAt,
        status: 'Locked'
      },
      { upsert: true, new: true }
    );

    return true;
  } catch (error) {
    // Duplicate key error code 11000 from MongoDB unique index
    if (error.code === 11000) {
      return false;
    }
    console.error('Lock acquisition error:', error);
    return false;
  }
};

/**
 * Release a distributed lock
 * @param {string} lockName Name of the lock to release
 * @returns {Promise<boolean>} True if lock released
 */
const releaseLock = async (lockName) => {
  try {
    await SystemLock.findOneAndUpdate(
      { lockName },
      { status: 'Released' }
    );
    return true;
  } catch (error) {
    console.error('Lock release error:', error);
    return false;
  }
};

module.exports = {
  acquireLock,
  releaseLock
};
