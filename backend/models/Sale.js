const mongoose = require('mongoose');

const SaleSchema = new mongoose.Schema(
  {
    invoiceNumber: {
      type: String,
      required: [true, 'Invoice number is required'],
      unique: true,
      trim: true
    },
    saleDate: {
      type: Date,
      default: Date.now
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: [true, 'Customer reference is required']
    },
    customerName: {
      type: String,
      required: [true, 'Customer name is required'],
      trim: true
    },
    customerPhone: {
      type: String,
      trim: true,
      default: ''
    },
    isGstInclusive: {
      type: Boolean,
      default: true
    },
    subtotal: {
      type: Number,
      required: [true, 'Subtotal is required'],
      min: [0, 'Subtotal cannot be negative']
    },
    discountType: {
      type: String,
      enum: ['Percentage', 'Fixed', 'None'],
      default: 'None'
    },
    discountValue: {
      type: Number,
      default: 0,
      min: [0, 'Discount value cannot be negative']
    },
    discountAmount: {
      type: Number,
      default: 0,
      min: [0, 'Discount amount cannot be negative']
    },
    gstAmount: {
      type: Number,
      default: 0,
      min: [0, 'GST amount cannot be negative']
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
      min: [0, 'Pending amount cannot be negative']
    },
    paymentMethod: {
      type: String,
      enum: {
        values: ['Cash', 'UPI', 'Card', 'Mixed', 'Credit'],
        message: 'Invalid payment method'
      },
      default: 'Cash'
    },
    paymentDetails: {
      cashAmount: { type: Number, default: 0 },
      upiAmount: { type: Number, default: 0 },
      cardAmount: { type: Number, default: 0 },
      creditAmount: { type: Number, default: 0 }
    },
    dueDate: {
      type: Date,
      default: null
    },
    creditDays: {
      type: Number,
      default: 0
    },
    billingCounter: {
      type: String,
      default: 'Counter-1'
    },
    orderSource: {
      type: String,
      enum: ['POS', 'Mobile App', 'Website', 'WhatsApp'],
      default: 'POS'
    },
    prescriptionNumber: {
      type: String,
      trim: true,
      default: ''
    },
    prescriptionDocumentUrl: {
      type: String,
      trim: true,
      default: ''
    },
    linkedPrescriptionIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Prescription'
      }
    ],
    complianceVerifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    complianceVerifiedAt: {
      type: Date,
      default: null
    },
    invoiceStatus: {
      type: String,
      enum: ['Draft', 'Completed', 'Cancelled', 'Returned'],
      default: 'Completed'
    },
    expiresAt: {
      type: Date,
      default: null
    },
    loyaltyPointsEarned: {
      type: Number,
      default: 0
    },
    loyaltyPointsRedeemed: {
      type: Number,
      default: 0
    },
    remarks: {
      type: String,
      trim: true,
      default: ''
    },
    adminOverrideUsed: {
      type: Boolean,
      default: false
    },
    adminOverrideReason: {
      type: String,
      trim: true,
      default: ''
    },
    idempotencyKey: {
      type: String,
      trim: true,
      default: null
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

// Indexes for query performance
SaleSchema.index({ customerId: 1 });
SaleSchema.index({ saleDate: -1 });
SaleSchema.index({ isDeleted: 1 });

module.exports = mongoose.model('Sale', SaleSchema);
