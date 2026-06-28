const SystemLock = require('../models/SystemLock');

/**
 * Acquire a distributed lock.
 * Returns the lock document if the lock was acquired, otherwise null.
 */
async function acquireLock(name, session) {
  const now = new Date();
  const lock = await SystemLock.findOneAndUpdate(
    { _id: name },
    { $setOnInsert: { lockedAt: now } },
    { upsert: true, new: true, session }
  ).lean();

  // If lock was newly inserted, its lockedAt will exactly match `now`
  if (lock && lock.lockedAt.getTime() === now.getTime()) return lock;
  return null;
}

/** Release a lock (delete the document). */
async function releaseLock(name, session) {
  await SystemLock.deleteOne({ _id: name }).session(session);
}

module.exports = { acquireLock, releaseLock };
