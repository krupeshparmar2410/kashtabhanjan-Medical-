const mongoose = require('mongoose');

const InventoryBatchSchema = new mongoose.Schema(
  {
    batchCode: {
      type: String,
      required: [true, 'Batch code is required'],
      unique: true,
      trim: true
    },
    medicineId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Medicine',
      required: [true, 'Medicine reference is required']
    },
    purchaseItemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PurchaseItem'
    },
    batchNumber: {
      type: String,
      required: [true, 'Batch number is required'],
      trim: true
    },
    manufacturingDate: {
      type: Date,
      required: false
    },
    expiryDate: {
      type: Date,
      required: [true, 'Expiry date is required']
    },
    originalQuantity: {
      type: Number,
      required: [true, 'Original quantity is required'],
      min: [0, 'Original quantity cannot be negative']
    },
    availableQuantity: {
      type: Number,
      required: [true, 'Available quantity is required'],
      min: [0, 'Available quantity cannot be negative']
    },
    reservedQuantity: {
      type: Number,
      default: 0,
      min: [0, 'Reserved quantity cannot be negative']
    },
    purchasePrice: {
      type: Number,
      required: [true, 'Purchase price is required'],
      min: [0, 'Purchase price cannot be negative']
    },
    sellingPrice: {
      type: Number,
      required: [true, 'Selling price is required'],
      min: [0, 'Selling price cannot be negative']
    },
    mrp: {
      type: Number,
      required: [true, 'MRP is required'],
      min: [0, 'MRP cannot be negative']
    },
    status: {
      type: String,
      enum: {
        values: ['Active', 'Near Expiry', 'Expired', 'Sold Out'],
        message: 'Invalid batch status'
      },
      default: 'Active'
    },
    isLocked: {
      type: Boolean,
      default: false
    },
    lockReason: {
      type: String,
      trim: true,
      default: ''
    },
    isSaleBlocked: {
      type: Boolean,
      default: false
    },
    recallStatus: {
      type: String,
      enum: ['Normal', 'Recalled'],
      default: 'Normal'
    },
    recallReason: {
      type: String,
      trim: true,
      default: ''
    },
    isDeleted: {
      type: Boolean,
      default: false
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Creator user reference is required']
    }
  },
  {
    timestamps: true
  }
);

// Indexes
InventoryBatchSchema.index({ medicineId: 1 });
InventoryBatchSchema.index({ batchNumber: 1 });
InventoryBatchSchema.index({ expiryDate: 1 });
InventoryBatchSchema.index({ status: 1 });
InventoryBatchSchema.index({ isDeleted: 1 });
InventoryBatchSchema.index({ medicineId: 1, batchNumber: 1, isDeleted: 1 }, { unique: true });

module.exports = mongoose.model('InventoryBatch', InventoryBatchSchema);
