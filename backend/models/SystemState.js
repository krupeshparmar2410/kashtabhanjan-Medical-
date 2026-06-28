const mongoose = require('mongoose');

const SystemStateSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    default: 'SYSTEM_STATE'
  },
  systemMode: {
    type: String,
    enum: ['HEALTHY', 'DEGRADED', 'RECOVERY_ONLY', 'CRITICAL'],
    default: 'HEALTHY'
  },
  bootFailureReason: {
    type: String,
    default: ''
  },
  isInRestoreProgress: {
    type: Boolean,
    default: false
  },
  activeRestoreJob: {
    fileName: String,
    rollbackBackupPath: String,
    startedAt: Date,
    restoreSessionId: String,
    backupId: String,
    checksum: String
  },
  drillStatus: {
    type: String,
    enum: ['None', 'Running', 'Passed', 'Failed'],
    default: 'None'
  },
  drillLastRun: {
    type: Date,
    default: null
  },
  version: {
    type: Number,
    default: 0
  },
  recoveryAttemptsCount: {
    type: Number,
    default: 0
  },
  lastRecoveryAttemptAt: {
    type: Date,
    default: null
  }
}, { timestamps: true });

module.exports = mongoose.model('SystemState', SystemStateSchema);
