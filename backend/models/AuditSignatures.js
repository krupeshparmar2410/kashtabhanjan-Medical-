const mongoose = require('mongoose');

const AuditSignaturesSchema = new mongoose.Schema({
  reportTimestamp: {
    type: Date,
    default: Date.now
  },
  verifiedUpToLogId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AuditLog',
    required: true
  },
  reportHash: {
    type: String,
    required: true
  },
  signature: {
    type: String,
    required: true
  },
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

AuditSignaturesSchema.index({ reportTimestamp: -1 });
AuditSignaturesSchema.index({ verifiedUpToLogId: 1 });

module.exports = mongoose.model('AuditSignatures', AuditSignaturesSchema);
