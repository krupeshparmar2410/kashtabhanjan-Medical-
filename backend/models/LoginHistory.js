const mongoose = require('mongoose');

const LoginHistorySchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    default: null 
  },
  emailAttempted: { 
    type: String, 
    required: [true, 'Attempted email is required'] 
  },
  loginTime: { 
    type: Date, 
    default: Date.now 
  },
  ipAddress: { 
    type: String, 
    default: '' 
  },
  browser: { 
    type: String, 
    default: '' 
  },
  operatingSystem: { 
    type: String, 
    default: '' 
  },
  loginStatus: { 
    type: String, 
    enum: ['Success', 'Failed', 'Locked'], 
    required: true 
  }
}, { 
  timestamps: true 
});

module.exports = mongoose.model('LoginHistory', LoginHistorySchema);
