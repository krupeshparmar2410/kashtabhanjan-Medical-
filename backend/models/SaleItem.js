const mongoose = require('mongoose');

const SaleItemSchema = new mongoose.Schema(
  {
    saleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Sale',
      required: [true, 'Sale invoice reference is required']
    },
    medicineId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Medicine',
      required: [true, 'Medicine reference is required']
    },
    medicineName: {
      type: String,
      required: [true, 'Medicine name snapshot is required'],
      trim: true
    },
    medicineCode: {
      type: String,
      required: [true, 'Medicine code snapshot is required'],
      trim: true
    },
    hsnCode: {
      type: String,
      trim: true,
      default: ''
    },
    unitType: {
      type: String,
      trim: true,
      default: ''
    },
    quantity: {
      type: Number,
      required: [true, 'Sold quantity is required'],
      min: [0.0001, 'Quantity must be at least 0.0001']
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
    gstPercentage: {
      type: Number,
      default: 0,
      min: [0, 'GST percentage cannot be negative']
    },
    gstAmount: {
      type: Number,
      default: 0,
      min: [0, 'GST amount cannot be negative']
    },
    discountPercentage: {
      type: Number,
      default: 0,
      min: [0, 'Discount percentage cannot be negative']
    },
    discountAmount: {
      type: Number,
      default: 0,
      min: [0, 'Discount amount cannot be negative']
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
        expiryDate: {
          type: Date,
          required: [true, 'Expiry date is required']
        },
        quantity: {
          type: Number,
          required: [true, 'Batch quantity consumed is required']
        },
        purchasePrice: {
          type: Number,
          required: [true, 'Purchase price snapshot is required']
        },
        sellingPrice: {
          type: Number,
          required: [true, 'Selling price is required']
        },
        mrp: {
          type: Number,
          required: [true, 'MRP is required']
        }
      }
    ]
  },
  {
    timestamps: true
  }
);

// Indexes
SaleItemSchema.index({ saleId: 1 });
SaleItemSchema.index({ medicineId: 1 });

module.exports = mongoose.model('SaleItem', SaleItemSchema);
