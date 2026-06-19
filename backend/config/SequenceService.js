const Sequence = require('../models/Sequence');

const getNextSequence = async (sequenceName, prefix, padding = 6) => {
  const seq = await Sequence.findByIdAndUpdate(
    sequenceName,
    { $inc: { sequenceValue: 1 } },
    { new: true, upsert: true }
  );
  return `${prefix}${String(seq.sequenceValue).padStart(padding, '0')}`;
};

module.exports = {
  getNextSequence
};
