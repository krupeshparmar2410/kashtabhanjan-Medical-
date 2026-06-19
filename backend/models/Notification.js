const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Notification title is required'],
      trim: true
    },
    message: {
      type: String,
      required: [true, 'Notification message is required'],
      trim: true
    },
    type: {
      type: String,
      required: [true, 'Alert type is required'],
      enum: {
        values: ['Low Stock', 'Near Expiry', 'Expired', 'Outstanding', 'Recall', 'Failed Transaction'],
        message: 'Invalid alert type'
      }
    },
    isRead: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
);

// Indexes
NotificationSchema.index({ isRead: 1 });
NotificationSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Notification', NotificationSchema);
