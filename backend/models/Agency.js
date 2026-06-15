const mongoose = require('mongoose');

const AgencySchema = new mongoose.Schema(
  {
    agencyCode: {
      type: String,
      required: [true, 'Agency code is required'],
      unique: true,
      trim: true
    },
    agencyName: {
      type: String,
      required: [true, 'Agency name is required'],
      trim: true
    },
    contactPerson: {
      type: String,
      trim: true
    },
    contactPersonDesignation: {
      type: String,
      trim: true
    },
    phone: {
      type: String,
      required: [true, 'Primary phone number is required'],
      trim: true
    },
    alternatePhone: {
      type: String,
      trim: true
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      // Custom sparse unique validation handled at controller/db level,
      // but mongoose match validation is still clean to verify email format
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
        'Please add a valid email'
      ]
    },
    gstNumber: {
      type: String,
      trim: true
    },
    drugLicenseNumber: {
      type: String,
      trim: true
    },
    address: {
      type: String,
      trim: true
    },
    city: {
      type: String,
      trim: true
    },
    state: {
      type: String,
      trim: true
    },
    pincode: {
      type: String,
      trim: true
    },
    status: {
      type: String,
      enum: {
        values: ['active', 'inactive'],
        message: 'Status must be active or inactive'
      },
      default: 'active'
    },
    agencyCategory: {
      type: String,
      enum: {
        values: ['Manufacturer', 'Wholesaler', 'Distributor', 'Local Supplier'],
        message: 'Invalid agency category classification'
      },
      default: 'Distributor'
    },
    isPreferredSupplier: {
      type: Boolean,
      default: false
    },
    isBlocked: {
      type: Boolean,
      default: false
    },
    creditDays: {
      type: Number,
      default: 0,
      min: [0, 'Credit days cannot be negative']
    },
    openingBalance: {
      type: Number,
      default: 0,
      min: [0, 'Opening balance cannot be negative']
    },
    currentBalance: {
      type: Number,
      default: 0,
      min: [0, 'Current balance cannot be negative']
    },
    creditLimit: {
      type: Number,
      default: 0,
      min: [0, 'Credit limit cannot be negative']
    },
    bankName: {
      type: String,
      trim: true
    },
    accountNumber: {
      type: String,
      trim: true
    },
    ifscCode: {
      type: String,
      trim: true
    },
    gstCertificateUrl: {
      type: String,
      default: null
    },
    drugLicenseUrl: {
      type: String,
      default: null
    },
    lastPurchaseDate: {
      type: Date,
      default: null
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Author user reference is required']
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
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

// Performance & uniqueness indexing
AgencySchema.index({ agencyName: 1 });
AgencySchema.index({ phone: 1 });

module.exports = mongoose.model('Agency', AgencySchema);
