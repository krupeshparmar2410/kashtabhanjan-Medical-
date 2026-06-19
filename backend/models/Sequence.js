const mongoose = require('mongoose');

const SequenceSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      required: [true, 'Sequence identifier key is required']
    },
    sequenceValue: {
      type: Number,
      default: 0
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('Sequence', SequenceSchema);
