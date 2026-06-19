const mongoose = require('mongoose');

const SystemSettingsHistorySchema = new mongoose.Schema({
  settingsSnapshot: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  changedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  changedAt: {
    type: Date,
    default: Date.now
  },
  changeReason: {
    type: String,
    default: ''
  },
  versionNumber: {
    type: Number,
    required: true
  },
  isVerifiedCompatible: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

SystemSettingsHistorySchema.index({ versionNumber: -1 });
SystemSettingsHistorySchema.index({ changedAt: -1 });

module.exports = mongoose.model('SystemSettingsHistory', SystemSettingsHistorySchema);
