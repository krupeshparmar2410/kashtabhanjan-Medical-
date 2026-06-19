const mongoose = require('mongoose');

const PurchaseReturnSchema = new mongoose.Schema(
  {
    returnNumber: {
      type: String,
      required: [true, 'Return number is required'],
      unique: true,
      trim: true
    },
    purchaseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Purchase',
      default: null // Optional reference
    },
    agencyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Agency',
      required: [true, 'Supplier agency reference is required']
    },
    returnDate: {
      type: Date,
      required: [true, 'Return date is required'],
      default: Date.now
    },
    totalAmount: {
      type: Number,
      required: [true, 'Total return amount is required'],
      min: [0, 'Total return amount cannot be negative']
    },
    gstAmount: {
      type: Number,
      default: 0,
      min: [0, 'GST amount cannot be negative']
    },
    remarks: {
      type: String,
      trim: true,
      default: ''
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Author user reference is required']
    },
    isDeleted: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
);

// Indexes
PurchaseReturnSchema.index({ agencyId: 1 });
PurchaseReturnSchema.index({ returnDate: 1 });

module.exports = mongoose.model('PurchaseReturn', PurchaseReturnSchema);
