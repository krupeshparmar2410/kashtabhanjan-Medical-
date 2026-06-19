const mongoose = require('mongoose');

const CustomerSchema = new mongoose.Schema(
  {
    customerType: {
      type: String,
      enum: {
        values: ['Walk-In', 'Registered'],
        message: 'Invalid customer type'
      },
      default: 'Registered'
    },
    name: {
      type: String,
      required: [
        function() { return this.customerType === 'Registered'; },
        'Name is required for registered customers'
      ],
      trim: true
    },
    phone: {
      type: String,
      required: [
        function() { return this.customerType === 'Registered'; },
        'Phone number is required for registered customers'
      ],
      trim: true
    },
    email: {
      type: String,
      trim: true,
      default: ''
    },
    address: {
      type: String,
      trim: true,
      default: ''
    },
    city: {
      type: String,
      trim: true,
      default: ''
    },
    state: {
      type: String,
      trim: true,
      default: ''
    },
    pincode: {
      type: String,
      trim: true,
      default: ''
    },
    loyaltyPoints: {
      type: Number,
      default: 0,
      min: [0, 'Loyalty points cannot be negative']
    },
    outstandingBalance: {
      type: Number,
      default: 0
    },
    creditLimit: {
      type: Number,
      default: 5000,
      min: [0, 'Credit limit cannot be negative']
    },
    creditDays: {
      type: Number,
      default: 30,
      min: [0, 'Credit days cannot be negative']
    },
    lifetimeValue: {
      type: Number,
      default: 0
    },
    purchaseFrequency: {
      type: Number,
      default: 0 // sales count
    },
    repeatPurchaseRate: {
      type: Number,
      default: 0 // percentage
    },
    averageDaysBetweenPurchases: {
      type: Number,
      default: 0
    },
    chronicConditions: [
      {
        condition: { type: String, trim: true },
        diagnosisDate: { type: Date },
        treatingDoctor: { type: String, trim: true },
        notes: { type: String, trim: true }
      }
    ],

    isDeleted: {
      type: Boolean,
      default: false
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

// Indexes
CustomerSchema.index({ phone: 1 });
CustomerSchema.index({ name: 1 });
CustomerSchema.index({ isDeleted: 1 });

module.exports = mongoose.model('Customer', CustomerSchema);
