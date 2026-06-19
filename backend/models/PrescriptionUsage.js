const mongoose = require('mongoose');

const PrescriptionUsageSchema = new mongoose.Schema(
  {
    prescriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Prescription',
      required: [true, 'Prescription reference is required']
    },
    saleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Sale',
      required: [true, 'Sale reference is required']
    },
    medicineId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Medicine',
      required: [true, 'Medicine reference is required']
    },
    quantityConsumed: {
      type: Number,
      required: [true, 'Quantity consumed is required'],
      min: [1, 'Quantity consumed must be at least 1']
    },
    consumedAt: {
      type: Date,
      default: Date.now
    },
    billedQuantity: {
      type: Number,
      required: [true, 'Billed quantity is required']
    },
    invoiceNumber: {
      type: String,
      required: [true, 'Invoice number is required']
    },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Verifier user reference is required']
    },
    isArchived: {
      type: Boolean,
      default: false
    },
    archivedAt: {
      type: Date,
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

// Performance & search indexing
PrescriptionUsageSchema.index({ prescriptionId: 1 });
PrescriptionUsageSchema.index({ saleId: 1 });
PrescriptionUsageSchema.index({ medicineId: 1 });

module.exports = mongoose.model('PrescriptionUsage', PrescriptionUsageSchema);
