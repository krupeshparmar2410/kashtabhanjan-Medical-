const mongoose = require('mongoose');

const AdminAuditLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    action: {
      type: String,
      enum: ['SWITCH_PRIMARY_ADMIN', 'AUTO_HEAL_FIX', 'MANUAL_UPDATE', 'ROLLBACK'],
      required: true,
    },
    previousValue: { type: Boolean, required: true },
    newValue: { type: Boolean, required: true },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    source: { type: String, enum: ['API', 'SYSTEM'], required: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdAt: { type: Date, default: Date.now, immutable: true },
  },
  { versionKey: false }
);

AdminAuditLogSchema.index({ action: 1, createdAt: -1 });
AdminAuditLogSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('AdminAuditLog', AdminAuditLogSchema);
