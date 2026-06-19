const mongoose = require('mongoose');

const CustomerLedgerSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: [true, 'Customer reference is required']
    },
    transactionType: {
      type: String,
      required: [true, 'Transaction type is required'],
      enum: {
        values: ['Sale', 'Payment', 'Sale Return', 'Opening Balance'],
        message: 'Invalid transaction type'
      }
    },
    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
      required: [true, 'Reference document ID is required']
    },
    referenceNumber: {
      type: String,
      required: [true, 'Reference number is required'],
      trim: true
    },
    debit: {
      type: Number,
      default: 0,
      min: [0, 'Debit amount cannot be negative']
    },
    credit: {
      type: Number,
      default: 0,
      min: [0, 'Credit amount cannot be negative']
    },
    runningBalance: {
      type: Number,
      required: [true, 'Running balance is required']
    },
    remarks: {
      type: String,
      trim: true,
      default: ''
    },
    branchId: {
      type: String,
      default: null
    }
  },
  {
    timestamps: true
  }
);

// Indexes
CustomerLedgerSchema.index({ customerId: 1 });
CustomerLedgerSchema.index({ referenceId: 1 });
CustomerLedgerSchema.index({ createdAt: -1 });

module.exports = mongoose.model('CustomerLedger', CustomerLedgerSchema);
