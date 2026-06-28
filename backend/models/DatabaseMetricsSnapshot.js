const mongoose = require('mongoose');

const DatabaseMetricsSnapshotSchema = new mongoose.Schema(
  {
    dataSizeMB: { type: Number, required: true },
    storageSizeMB: { type: Number, required: true },
    collectionsCount: { type: Number, required: true },
    indexesCount: { type: Number, required: true },
    totalDocuments: { type: Number, required: true },
    createdAt: { type: Date, default: Date.now, index: true }
  }
);

module.exports = mongoose.model('DatabaseMetricsSnapshot', DatabaseMetricsSnapshotSchema);
