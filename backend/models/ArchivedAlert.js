const mongoose = require('mongoose');

const ArchivedAlertSchema = new mongoose.Schema(
  {
    originalAlertId: { type: mongoose.Schema.Types.ObjectId, required: true },
    module: { type: String, required: true },
    severity: { type: String, required: true },
    message: { type: String, required: true },
    acknowledgedAt: { type: Date, required: true },
    acknowledgedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    remarks: { type: String, default: '' },
    alertCreatedAt: { type: Date, required: true },
    archivedAt: { type: Date, default: Date.now, index: true }
  }
);

module.exports = mongoose.model('ArchivedAlert', ArchivedAlertSchema);
