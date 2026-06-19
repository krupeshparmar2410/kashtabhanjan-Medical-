const mongoose = require('mongoose');

const InventoryDisposalSchema = new mongoose.Schema(
  {
    disposalNumber: {
      type: String,
      required: [true, 'Disposal number is required'],
      unique: true,
      trim: true
    },
    inventoryBatchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'InventoryBatch',
      required: [true, 'Inventory batch reference is required']
    },
    medicineId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Medicine',
      required: [true, 'Medicine reference is required']
    },
    quantity: {
      type: Number,
      required: [true, 'Quantity is required'],
      min: [1, 'Disposal quantity must be at least 1']
    },
    reason: {
      type: String,
      required: [true, 'Disposal reason is required'],
      enum: {
        values: ['Expired', 'Damaged', 'Lost', 'Theft', 'Other'],
        message: 'Invalid disposal reason'
      }
    },
    disposalDate: {
      type: Date,
      required: [true, 'Disposal date is required'],
      default: Date.now
    },
    notes: {
      type: String,
      trim: true,
      default: ''
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User performing disposal is required']
    }
  },
  {
    timestamps: true
  }
);

// Indexes
InventoryDisposalSchema.index({ medicineId: 1 });
InventoryDisposalSchema.index({ inventoryBatchId: 1 });
InventoryDisposalSchema.index({ disposalDate: 1 });

module.exports = mongoose.model('InventoryDisposal', InventoryDisposalSchema);
