const mongoose = require('mongoose');

const SystemBackupSchema = new mongoose.Schema({
  backupNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  backupType: {
    type: String,
    enum: ['Full'],
    default: 'Full'
  },
  fileName: {
    type: String,
    required: true,
    trim: true
  },
  filePath: {
    type: String,
    required: true,
    trim: true
  },
  fileSize: {
    type: Number,
    required: true
  },
  checksum: {
    type: String,
    required: true,
    trim: true
  },
  isEncrypted: {
    type: Boolean,
    default: true
  },
  encryptionTag: {
    type: String,
    required: true,
    trim: true
  },
  encryptionIV: {
    type: String,
    required: true,
    trim: true
  },
  keyVersion: {
    type: Number,
    default: 1
  },
  status: {
    type: String,
    enum: ['Pending', 'Running', 'Completed', 'Failed', 'Corrupted'],
    default: 'Pending'
  },
  healthStatus: {
    type: String,
    enum: ['Unverified', 'Passed', 'Warning', 'Failed', 'Corrupted'],
    default: 'Unverified'
  },
  lastVerifiedAt: {
    type: Date,
    default: null
  },
  verificationDuration: {
    type: Number,
    default: 0
  },
  restoreTestDate: {
    type: Date,
    default: null
  },
  isArchived: {
    type: Boolean,
    default: false
  },
  backupStartedAt: {
    type: Date,
    required: true
  },
  backupCompletedAt: {
    type: Date
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  backupCreatedByName: {
    type: String,
    required: true
  },
  notes: {
    type: String,
    trim: true,
    default: ''
  },
  errorMessage: {
    type: String,
    trim: true,
    default: ''
  },
  appVersion: {
    type: String,
    required: true
  },
  backupSourceVersion: {
    type: String,
    required: true
  },
  dbSchemaVersion: {
    type: String,
    required: true
  },
  backupFormatVersion: {
    type: String,
    default: '1.0.0'
  }
}, {
  timestamps: true
});

SystemBackupSchema.index({ createdAt: -1 });
SystemBackupSchema.index({ healthStatus: 1 });

module.exports = mongoose.model('SystemBackup', SystemBackupSchema);
