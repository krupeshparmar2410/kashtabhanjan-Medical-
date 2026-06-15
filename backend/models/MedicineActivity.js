const mongoose = require('mongoose');

const MedicineActivitySchema = new mongoose.Schema({
  medicineId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Medicine',
    required: [true, 'Medicine reference is required']
  },
  action: {
    type: String,
    required: [true, 'Action is required']
  },
  description: {
    type: String,
    trim: true
  },
  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Performing user reference is required']
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('MedicineActivity', MedicineActivitySchema);
