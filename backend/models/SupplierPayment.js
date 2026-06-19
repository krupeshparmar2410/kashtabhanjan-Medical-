const mongoose = require('mongoose');

const SupplierPaymentSchema = new mongoose.Schema(
  {
    paymentNumber: {
      type: String,
      required: [true, 'Payment number is required'],
      unique: true,
      trim: true
    },
    agencyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Agency',
      required: [true, 'Supplier agency reference is required']
    },
    paymentDate: {
      type: Date,
      required: [true, 'Payment date is required'],
      default: Date.now
    },
    amountPaid: {
      type: Number,
      required: [true, 'Amount paid is required'],
      min: [0.01, 'Amount paid must be greater than zero']
    },
    paymentMethod: {
      type: String,
      enum: {
        values: ['Cash', 'Bank Transfer', 'UPI', 'Cheque'],
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
SupplierPaymentSchema.index({ agencyId: 1 });
SupplierPaymentSchema.index({ paymentDate: 1 });

module.exports = mongoose.model('SupplierPayment', SupplierPaymentSchema);
