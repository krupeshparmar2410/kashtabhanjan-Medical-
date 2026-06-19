const mongoose = require('mongoose');

const BackupVerificationHistorySchema = new mongoose.Schema({
  backupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SystemBackup',
    required: true
  },
  verificationDate: {
    type: Date,
    default: Date.now
  },
  durationMs: {
    type: Number,
    required: true
  },
  result: {
    type: String,
    enum: ['Passed', 'Warning', 'Failed', 'Corrupted'],
    required: true
  },
  operatorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  errorMessage: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

BackupVerificationHistorySchema.index({ backupId: 1 });
BackupVerificationHistorySchema.index({ verificationDate: -1 });

module.exports = mongoose.model('BackupVerificationHistory', BackupVerificationHistorySchema);
