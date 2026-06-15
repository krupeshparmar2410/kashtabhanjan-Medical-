const mongoose = require('mongoose');

const AgencyActivitySchema = new mongoose.Schema({
  agencyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Agency',
    required: [true, 'Agency reference is required']
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

module.exports = mongoose.model('AgencyActivity', AgencyActivitySchema);
