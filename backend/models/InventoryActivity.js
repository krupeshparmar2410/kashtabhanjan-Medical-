const mongoose = require('mongoose');

const InventoryActivitySchema = new mongoose.Schema(
  {
    inventoryBatchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'InventoryBatch',
      required: [true, 'Inventory batch reference is required']
    },
    action: {
      type: String,
      required: [true, 'Action name is required'] // e.g. 'Purchase Receipt', 'Return', 'Disposal', 'Stock Adjustment', 'Sale'
    },
    description: {
      type: String,
      required: [true, 'Description is required']
    },
    adjustmentReason: {
      type: String,
      enum: {
        values: ['Physical Count Difference', 'Damage', 'Expiry', 'Theft', 'Sample Given', 'Other'],
        message: 'Invalid stock adjustment reason'
      },
      required: false
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User performing action is required']
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    isArchived: {
      type: Boolean,
      default: false
    },
    archivedAt: {
      type: Date,
      default: null
    },
    archivedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    }
  }
);

// Indexes
InventoryActivitySchema.index({ inventoryBatchId: 1 });
InventoryActivitySchema.index({ createdAt: -1 });

module.exports = mongoose.model('InventoryActivity', InventoryActivitySchema);
