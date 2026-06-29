const mongoose = require('mongoose');

const RestoreSessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true },
  backupId: { type: String },
  checksum: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  status: { type: String, enum: ['IN_PROGRESS', 'COMPLETED', 'FAILED'], default: 'IN_PROGRESS' },
  systemStateRef: { type: mongoose.Schema.Types.ObjectId, ref: 'SystemState' }
});

module.exports = mongoose.model('RestoreSession', RestoreSessionSchema);
