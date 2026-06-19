const mongoose = require('mongoose');

const ActiveSessionSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  sessionToken: { 
    type: String, 
    required: true, 
    unique: true 
  },
  loginTime: { 
    type: Date, 
    default: Date.now 
  },
  lastActivityAt: { 
    type: Date, 
    default: Date.now 
  },
  expiresAt: { 
    type: Date, 
    required: true 
  },
  isRevoked: { 
    type: Boolean, 
    default: false 
  },
  deviceInfo: {
    ipAddress: { type: String, default: '' },
    browser: { type: String, default: '' },
    operatingSystem: { type: String, default: '' }
  }
}, { 
  timestamps: true 
});

ActiveSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // MongoDB auto-cleanup on expiry

module.exports = mongoose.model('ActiveSession', ActiveSessionSchema);
