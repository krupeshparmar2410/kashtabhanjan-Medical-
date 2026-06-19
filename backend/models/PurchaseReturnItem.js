const mongoose = require('mongoose');

const PurchaseReturnItemSchema = new mongoose.Schema(
  {
    purchaseReturnId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PurchaseReturn',
      required: [true, 'Purchase return reference is required']
    },
    medicineId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Medicine',
      required: [true, 'Medicine reference is required']
    },
    inventoryBatchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'InventoryBatch',
      required: [true, 'Inventory batch reference is required']
    },
    quantity: {
      type: Number,
      required: [true, 'Return quantity is required'],
      min: [1, 'Quantity must be at least 1']
    },
    purchasePrice: {
      type: Number,
      required: [true, 'Purchase price is required'],
      min: [0, 'Purchase price cannot be negative']
    },
    lineTotal: {
      type: Number,
      required: [true, 'Line total is required'],
      min: [0, 'Line total cannot be negative']
    }
  },
  {
    timestamps: true
  }
);

// Indexes
PurchaseReturnItemSchema.index({ purchaseReturnId: 1 });
PurchaseReturnItemSchema.index({ medicineId: 1 });
PurchaseReturnItemSchema.index({ inventoryBatchId: 1 });

module.exports = mongoose.model('PurchaseReturnItem', PurchaseReturnItemSchema);
