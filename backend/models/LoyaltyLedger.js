const mongoose = require('mongoose');

const LoyaltyLedgerSchema = new mongoose.Schema(
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
        values: ['Earned', 'Redeemed', 'Reverted'],
        message: 'Invalid loyalty transaction type'
      }
    },
    points: {
      type: Number,
      required: [true, 'Points quantity is required']
    },
    runningBalance: {
      type: Number,
      required: [true, 'Running balance is required']
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
    remarks: {
      type: String,
      trim: true,
      default: ''
    }
  },
  {
    timestamps: true
  }
);

// Indexes
LoyaltyLedgerSchema.index({ customerId: 1 });
LoyaltyLedgerSchema.index({ createdAt: -1 });

module.exports = mongoose.model('LoyaltyLedger', LoyaltyLedgerSchema);
