const mongoose = require('mongoose');

const SalesReturnSchema = new mongoose.Schema(
  {
    returnNumber: {
      type: String,
      required: [true, 'Return number is required'],
      unique: true,
      trim: true
    },
    saleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Sale',
      required: [true, 'Original sale reference is required']
    },
    returnDate: {
      type: Date,
      default: Date.now
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: [true, 'Customer reference is required']
    },
    subtotal: {
      type: Number,
      default: 0,
      min: [0, 'Subtotal cannot be negative']
    },
    gstAmount: {
      type: Number,
      default: 0,
      min: [0, 'GST amount cannot be negative']
    },
    refundAmount: {
      type: Number,
      required: [true, 'Refund amount is required'],
      min: [0, 'Refund amount cannot be negative']
    },
    paymentMethod: {
      type: String,
      enum: ['Cash', 'UPI', 'Credit Adjustment'],
      default: 'Cash'
    },
    remarks: {
      type: String,
      trim: true,
      default: ''
    },
    isDeleted: {
      type: Boolean,
      default: false
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
SalesReturnSchema.index({ saleId: 1 });
SalesReturnSchema.index({ returnDate: -1 });

module.exports = mongoose.model('SalesReturn', SalesReturnSchema);
