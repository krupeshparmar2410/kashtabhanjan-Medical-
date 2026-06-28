const mongoose = require('mongoose');

// Collection to hold distributed locks. Each lock document expires via TTL.
const SystemLockSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true }, // lock name, e.g., 'PRIMARY_ADMIN_HEAL'
    lockedAt: { type: Date, default: Date.now },
  },
  { collection: 'system_locks', timestamps: false }
);

// TTL index – document removed after 60 seconds of inactivity (adjust as needed)
SystemLockSchema.index({ lockedAt: 1 }, { expireAfterSeconds: 60 });

module.exports = mongoose.model('SystemLock', SystemLockSchema);
