const mongoose = require('mongoose');

const PrescriptionSchema = new mongoose.Schema(
  {
    prescriptionNumber: {
      type: String,
      required: [true, 'Prescription number is required'],
      unique: true,
      trim: true
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: [true, 'Customer reference is required']
    },
    doctorName: {
      type: String,
      required: [true, 'Doctor name is required'],
      trim: true
    },
    doctorRegistrationNumber: {
      type: String,
      required: [true, 'Doctor registration number is required'],
      trim: true
    },
    patientName: {
      type: String,
      required: [true, 'Patient name is required'],
      trim: true
    },
    prescriptionDate: {
      type: Date,
      required: [true, 'Prescription date is required']
    },
    documentUrl: {
      type: String,
      trim: true,
      default: ''
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    },
    approvedAt: {
      type: Date,
      default: null
    },
    lastUsedAt: {
      type: Date,
      default: null
    },
    remarks: {
      type: String,
      default: ''
    },
    pharmacistNotes: {
      type: String,
      default: ''
    },
    status: {
      type: String,
      enum: ['Pending', 'Verified', 'Approved', 'Rejected', 'Expired'],
      default: 'Pending'
    },
    rejectionReason: {
      type: String,
      default: ''
    },
    validityDays: {
      type: Number,
      default: 180
    },
    expiryDate: {
      type: Date
    },

    medicines: [
      {
        medicineId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Medicine',
          required: [true, 'Medicine ID is required']
        },
        medicineName: {
          type: String,
          required: [true, 'Medicine name is required'],
          trim: true
        },
        dosage: {
          type: String,
          trim: true
        },
        duration: {
          type: String,
          trim: true
        },
        quantityAllowed: {
          type: Number,
          required: [true, 'Quantity allowed is required'],
          min: [1, 'Quantity allowed must be at least 1']
        },
        quantityConsumed: {
          type: Number,
          default: 0,
          min: [0, 'Quantity consumed cannot be negative']
        },
        quantityRemaining: {
          type: Number,
          default: 0
        }
      }
    ],
    statusHistory: [
      {
        status: { type: String, required: true },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        updatedAt: { type: Date, default: Date.now },
        remarks: { type: String, default: '' }
      }
    ],
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    rejectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    approvalRemarks: {
      type: String,
      default: ''
    },
    history: [
      {
        modifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        modifiedAt: { type: Date, default: Date.now },
        changes: { type: mongoose.Schema.Types.Mixed }
      }
    ],

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
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    }
  },
  {
    timestamps: true
  }
);

PrescriptionSchema.index({ customerId: 1 });
PrescriptionSchema.index({ status: 1 });
PrescriptionSchema.index({ expiryDate: 1 });

module.exports = mongoose.model('Prescription', PrescriptionSchema);
