const mongoose = require('mongoose');

const RefillReminderSchema = new mongoose.Schema(
  {
    reminderNumber: {
      type: String,
      required: [true, 'Reminder number is required'],
      unique: true,
      trim: true
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: [true, 'Customer reference is required']
    },
    prescriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Prescription',
      required: [true, 'Prescription reference is required']
    },
    medicineId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Medicine',
      required: [true, 'Medicine reference is required']
    },
    refillDueDate: {
      type: Date,
      required: [true, 'Refill due date is required']
    },
    reminderPriority: {
      type: String,
      enum: ['Low', 'Medium', 'High'],
      default: 'Medium'
    },
    status: {
      type: String,
      enum: ['Scheduled', 'Contacted', 'Completed', 'Cancelled'],
      default: 'Scheduled'
    },
    scheduledDate: {
      type: Date,
      default: Date.now
    },
    sentAt: {
      type: Date,
      default: null
    },

    isManual: {
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

// Performance & search indexing
RefillReminderSchema.index({ customerId: 1 });
RefillReminderSchema.index({ status: 1 });
RefillReminderSchema.index({ refillDueDate: 1 });


module.exports = mongoose.model('RefillReminder', RefillReminderSchema);
