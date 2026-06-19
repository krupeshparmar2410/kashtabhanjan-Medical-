const mongoose = require('mongoose');

const SystemLockSchema = new mongoose.Schema(
  {
    lockName: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    lockedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    lockedAt: {
      type: Date,
      default: Date.now
    },
    expiresAt: {
      type: Date,
      required: true
    },
    status: {
      type: String,
      enum: ['Locked', 'Released'],
      default: 'Locked'
    }
  },
  {
    timestamps: true
  }
);

// Index to expire automatically after expiresAt (self-healing lock)
SystemLockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('SystemLock', SystemLockSchema);
