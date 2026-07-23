const mongoose = require('mongoose');

const PurchaseItemSchema = new mongoose.Schema(
  {
    purchaseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Purchase',
      required: [true, 'Purchase invoice reference is required']
    },
    medicineId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Medicine',
      required: [true, 'Medicine reference is required']
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
      required: [true, 'Expiry date is required'],
      validate: {
        validator: function(value) {
          // If manufacturing date is present, check that expiry date is greater than it
          return this.manufacturingDate ? value > this.manufacturingDate : true;
        },
        message: 'Expiry date must be greater than manufacturing date'
      }
    },
    quantity: {
      type: Number,
      required: [true, 'Quantity is required'],
      min: [0.0001, 'Quantity must be greater than zero']
    },
    freeQuantity: {
      type: Number,
      default: 0,
      min: [0, 'Free quantity cannot be negative']
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
      required: [true, 'Maximum Retail Price (MRP) is required'],
      min: [0, 'MRP cannot be negative']
    },
    gstPercentage: {
      type: Number,
      required: [true, 'GST percentage is required'],
      min: [0, 'GST percentage cannot be negative']
    },
    discountPercentage: {
      type: Number,
      default: 0,
      min: [0, 'Discount percentage cannot be negative']
    },
    lineTotal: {
      type: Number,
      required: [true, 'Line item total is required'],
      min: [0, 'Line total cannot be negative']
    }
  },
  {
    timestamps: true
  }
);

// Indexes for fast lookups
PurchaseItemSchema.index({ purchaseId: 1 });
PurchaseItemSchema.index({ medicineId: 1 });
PurchaseItemSchema.index({ batchNumber: 1 });

module.exports = mongoose.model('PurchaseItem', PurchaseItemSchema);
