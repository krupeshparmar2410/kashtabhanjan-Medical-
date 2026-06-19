const mongoose = require('mongoose');

const CustomerPaymentSchema = new mongoose.Schema(
  {
    paymentNumber: {
      type: String,
      required: [true, 'Payment number is required'],
      unique: true,
      trim: true
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: [true, 'Customer reference is required']
    },
    paymentDate: {
      type: Date,
      default: Date.now
    },
    amountPaid: {
      type: Number,
      required: [true, 'Payment amount is required'],
      min: [0.01, 'Payment amount must be greater than zero']
    },
    paymentMethod: {
      type: String,
      enum: {
        values: ['Cash', 'UPI', 'Card'],
        message: 'Invalid payment method'
      },
      default: 'Cash'
    },
    referenceNumber: {
      type: String,
      trim: true,
      default: ''
    },
    remarks: {
      type: String,
      trim: true,
      default: ''
    },
    branchId: {
      type: String,
      default: null
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
CustomerPaymentSchema.index({ customerId: 1 });
CustomerPaymentSchema.index({ paymentDate: -1 });

module.exports = mongoose.model('CustomerPayment', CustomerPaymentSchema);
