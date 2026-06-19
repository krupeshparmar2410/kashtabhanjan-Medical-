const mongoose = require('mongoose');

const CommunicationLogSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      default: null
    },
    type: {
      type: String,
      required: [true, 'Notification type is required'],
      enum: ['SMS', 'WhatsApp', 'Email']
    },
    recipient: {
      type: String,
      required: [true, 'Recipient contact is required'],
      trim: true
    },
    message: {
      type: String,
      required: [true, 'Message body content is required'],
      trim: true
    },
    status: {
      type: String,
      enum: ['Sent', 'Failed', 'Pending'],
      default: 'Sent'
    },
    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null
    },
    sentAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

// Indexes
CommunicationLogSchema.index({ customerId: 1 });
CommunicationLogSchema.index({ sentAt: -1 });

module.exports = mongoose.model('CommunicationLog', CommunicationLogSchema);
