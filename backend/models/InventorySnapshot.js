const mongoose = require('mongoose');

const InventorySnapshotSchema = new mongoose.Schema(
  {
    snapshotDate: {
      type: Date,
      required: [true, 'Snapshot date is required'],
      unique: true,
      index: true
    },
    totalItems: {
      type: Number,
      required: [true, 'Total items count is required'],
      default: 0
    },
    totalPurchaseValue: {
      type: Number,
      required: [true, 'Total purchase value is required'],
      default: 0
    },
    totalSellingValue: {
      type: Number,
      required: [true, 'Total selling value is required'],
      default: 0
    },
    totalMrpValue: {
      type: Number,
      required: [true, 'Total MRP value is required'],
      default: 0
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required']
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('InventorySnapshot', InventorySnapshotSchema);
