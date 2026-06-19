const mongoose = require('mongoose');

const SalesReturnItemSchema = new mongoose.Schema(
  {
    salesReturnId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SalesReturn',
      required: [true, 'Sales return reference is required']
    },
    medicineId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Medicine',
      required: [true, 'Medicine reference is required']
    },
    quantity: {
      type: Number,
      required: [true, 'Return quantity is required'],
      min: [1, 'Quantity must be at least 1']
    },
    sellingPrice: {
      type: Number,
      required: [true, 'Selling price is required'],
      min: [0, 'Selling price cannot be negative']
    },
    gstPercentage: {
      type: Number,
      default: 0
    },
    gstAmount: {
      type: Number,
      default: 0
    },
    lineTotal: {
      type: Number,
      required: [true, 'Line total is required'],
      min: [0, 'Line total cannot be negative']
    },
    batches: [
      {
        inventoryBatchId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'InventoryBatch',
          required: [true, 'Batch reference is required']
        },
        batchNumber: {
          type: String,
          required: [true, 'Batch number is required']
        },
        quantity: {
          type: Number,
          required: [true, 'Batch quantity returned is required']
        }
      }
    ]
  },
  {
    timestamps: true
  }
);

// Indexes
SalesReturnItemSchema.index({ salesReturnId: 1 });
SalesReturnItemSchema.index({ medicineId: 1 });

module.exports = mongoose.model('SalesReturnItem', SalesReturnItemSchema);
