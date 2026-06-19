const mongoose = require('mongoose');

const AgencyLedgerSchema = new mongoose.Schema(
  {
    agencyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Agency',
      required: [true, 'Supplier agency reference is required']
    },
    transactionType: {
      type: String,
      required: [true, 'Transaction type is required'],
      enum: {
        values: ['Purchase', 'Payment', 'Purchase Return', 'Opening Balance'],
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
    }
  },
  {
    timestamps: true
  }
);

// Indexes
AgencyLedgerSchema.index({ agencyId: 1 });
AgencyLedgerSchema.index({ referenceId: 1 });
AgencyLedgerSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AgencyLedger', AgencyLedgerSchema);
