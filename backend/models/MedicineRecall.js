const mongoose = require('mongoose');

const MedicineRecallSchema = new mongoose.Schema(
  {
    recallNumber: {
      type: String,
      required: [true, 'Recall registry number is required'],
      unique: true,
      trim: true
    },
    medicineId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Medicine',
      required: [true, 'Medicine reference is required']
    },
    affectedBatches: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'InventoryBatch'
      }
    ],
    recallReason: {
      type: String,
      required: [true, 'Recall reason description is required'],
      trim: true
    },
    recallDate: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      enum: ['Active', 'Resolved'],
      default: 'Active'
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Creator reference is required']
    }
  },
  {
    timestamps: true
  }
);

// Indexes
MedicineRecallSchema.index({ medicineId: 1 });
MedicineRecallSchema.index({ createdAt: -1 });

module.exports = mongoose.model('MedicineRecall', MedicineRecallSchema);
