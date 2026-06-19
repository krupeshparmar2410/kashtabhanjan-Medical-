const mongoose = require('mongoose');

const CashClosingSchema = new mongoose.Schema(
  {
    closingDate: {
      type: Date,
      default: Date.now
    },
    billingCounter: {
      type: String,
      required: [true, 'Billing counter identifier is required'],
      trim: true
    },
    openingCash: {
      type: Number,
      required: [true, 'Opening cash balance is required'],
      min: [0, 'Opening cash cannot be negative']
    },
    cashSales: {
      type: Number,
      default: 0,
      min: [0, 'Cash sales cannot be negative']
    },
    expenses: {
      type: Number,
      default: 0,
      min: [0, 'Expenses cannot be negative']
    },
    refunds: {
      type: Number,
      default: 0,
      min: [0, 'Refunds cannot be negative']
    },
    closingCash: {
      type: Number,
      required: [true, 'Calculated closing cash is required'],
      min: [0, 'Closing cash cannot be negative']
    },
    actualCashInDrawer: {
      type: Number,
      required: [true, 'Actual cash in drawer is required'],
      min: [0, 'Actual cash cannot be negative']
    },
    difference: {
      type: Number,
      default: 0
    },
    status: {
      type: String,
      enum: ['Open', 'Closed'],
      default: 'Closed'
    },
    notes: {
      type: String,
      trim: true,
      default: ''
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Cashier user reference is required']
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
CashClosingSchema.index({ closingDate: -1, billingCounter: 1 });

module.exports = mongoose.model('CashClosing', CashClosingSchema);
