const mongoose = require('mongoose');

const MigrationSchema = new mongoose.Schema(
  {
    migrationId: {
      type: String,
      required: [true, 'Migration identifier is required'],
      unique: true,
      trim: true
    },
    description: {
      type: String,
      trim: true,
      default: ''
    },
    executionDate: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      enum: ['Pending', 'Completed', 'Failed'],
      default: 'Completed'
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('Migration', MigrationSchema);
