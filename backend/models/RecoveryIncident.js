const mongoose = require('mongoose');

const RecoveryIncidentSchema = new mongoose.Schema(
  {
    incidentType: {
      type: String,
      required: true,
      enum: ['InterruptedRestore', 'FailedMigration', 'IndexAnomalies']
    },
    affectedCollections: [{ type: String }],
    detectedAt: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ['Pending', 'Resolved'],
      default: 'Pending',
      index: true
    },
    resolutionNotes: { type: String, default: '' },
    resolvedAt: { type: Date, default: null },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
  },
  { timestamps: true }
);

RecoveryIncidentSchema.index({ status: 1, incidentType: 1 });
RecoveryIncidentSchema.index({ createdAt: -1 });

module.exports = mongoose.model('RecoveryIncident', RecoveryIncidentSchema);
