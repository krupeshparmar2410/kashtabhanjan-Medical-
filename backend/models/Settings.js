const mongoose = require('mongoose');

const SettingsSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: [true, 'Settings key is required'],
      unique: true,
      trim: true
    },
    value: {
      type: mongoose.Schema.Types.Mixed,
      required: [true, 'Settings value is required']
    },
    description: {
      type: String,
      trim: true,
      default: ''
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('Settings', SettingsSchema);
