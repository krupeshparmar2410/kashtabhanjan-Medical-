const mongoose = require('mongoose');

const AlertSchema = new mongoose.Schema(
  {
    module: {
      type: String,
      required: true,
      enum: ['Database', 'Storage', 'Resource', 'Backup', 'Audit', 'Inventory', 'Finance', 'System']
    },
    severity: {
      type: String,
      required: true,
      enum: ['Info', 'Warning', 'Critical']
    },
    message: { type: String, required: true },
    isAcknowledged: { type: Boolean, default: false },
    acknowledgedAt: { type: Date, default: null },
    acknowledgedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    remarks: { type: String, default: '' }
  },
  { timestamps: true }
);

AlertSchema.index({ isAcknowledged: 1, createdAt: -1 });
module.exports = mongoose.model('Alert', AlertSchema);
