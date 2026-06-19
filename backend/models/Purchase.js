const mongoose = require('mongoose');

const PurchaseSchema = new mongoose.Schema(
  {
    purchaseNumber: {
      type: String,
      required: [true, 'Purchase number is required'],
      unique: true,
      trim: true
    },
    invoiceNumber: {
      type: String,
      required: [true, 'Invoice number is required'],
      trim: true
    },
    invoiceDate: {
      type: Date,
      required: [true, 'Invoice date is required']
    },
    purchaseDate: {
      type: Date,
      required: [true, 'Purchase date is required']
    },
    agencyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Agency',
      required: [true, 'Supplier agency reference is required']
    },
    billAmount: {
      type: Number,
      required: [true, 'Bill amount is required'],
      min: [0, 'Bill amount cannot be negative']
    },
    gstAmount: {
      type: Number,
      required: [true, 'GST amount is required'],
      min: [0, 'GST amount cannot be negative'],
      default: 0
    },
    discountAmount: {
      type: Number,
      required: [true, 'Discount amount is required'],
      min: [0, 'Discount amount cannot be negative'],
      default: 0
    },
    grandTotal: {
      type: Number,
      required: [true, 'Grand total is required'],
      min: [0, 'Grand total cannot be negative']
    },
    paidAmount: {
      type: Number,
      default: 0,
      min: [0, 'Paid amount cannot be negative']
    },
    pendingAmount: {
      type: Number,
      default: 0,
      min: [0, 'Pending outstanding amount cannot be negative']
    },
    dueDate: {
      type: Date
    },
    creditDays: {
      type: Number,
      default: 0,
      min: [0, 'Credit days cannot be negative']
    },
    invoiceDocumentUrl: {
      type: String,
      default: null
    },
    paymentMethod: {
      type: String,
      enum: {
        values: ['Cash', 'Bank Transfer', 'UPI', 'Cheque', 'Credit'],
        message: 'Invalid payment method'
      },
      default: 'Cash'
    },
    purchaseStatus: {
      type: String,
      enum: {
        values: ['Draft', 'Approved', 'Posted', 'Cancelled'],
        message: 'Invalid purchase status'
      },
      default: 'Draft'
    },
    remarks: {
      type: String,
      trim: true,
      default: ''
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    approvedAt: {
      type: Date,
      default: null
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Creator user reference is required']
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
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

// Indexes for query performance
PurchaseSchema.index({ invoiceNumber: 1 });
PurchaseSchema.index({ agencyId: 1 });
PurchaseSchema.index({ purchaseDate: 1 });

module.exports = mongoose.model('Purchase', PurchaseSchema);
