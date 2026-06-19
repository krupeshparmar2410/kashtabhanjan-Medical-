const mongoose = require('mongoose');

const CustomerActivitySchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: [true, 'Customer reference is required']
    },
    action: {
      type: String,
      required: [true, 'Action is required']
    },
    description: {
      type: String,
      trim: true
    },
    beforeValues: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    afterValues: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Performing user reference is required']
    }
  },
  {
    timestamps: true
  }
);

// Indexes
CustomerActivitySchema.index({ customerId: 1 });
CustomerActivitySchema.index({ createdAt: -1 });

module.exports = mongoose.model('CustomerActivity', CustomerActivitySchema);
