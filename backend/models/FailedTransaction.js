const mongoose = require('mongoose');

const FailedTransactionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User is required']
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      required: [true, 'Failed request payload is required']
    },
    errorMessage: {
      type: String,
      required: [true, 'Error message details are required'],
      trim: true
    },
    stackTrace: {
      type: String,
      trim: true,
      default: ''
    },
    ipAddress: {
      type: String,
      default: ''
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

// Index
FailedTransactionSchema.index({ timestamp: -1 });

module.exports = mongoose.model('FailedTransaction', FailedTransactionSchema);
